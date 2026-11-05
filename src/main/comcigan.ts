/**
 * Comcigan (컴시간) timetable integration service
 * Runs in Electron main process only (uses Node.js modules)
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
let Timetable: any;
try {
  Timetable = require('comcigan-parser');
} catch {
  console.warn('[Comcigan] comcigan-parser module not found');
}

import type { ComciganConfig, ComciganSchool, ComciganSchoolGrid, ComciganTimetableData, TeacherPeriod } from '../shared/types';
import { BrowserWindow } from 'electron';
import { buildTeacherGrid, parseSchoolSearch } from './comciganGrid';

// Simple JSON file persistence (avoid electron-store ESM issues)
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { app } from 'electron';

// 시간표 설정은 사람마다 따로 둔다. 공용 PC에서 앞 교사의 시간표로 수업 화면 보호가 돌면
// 다음 교사의 수업 중에 개인 일정이 가려지지 않는다.
const LEGACY_CONFIG_PATH = path.join(app.getPath('userData'), 'comcigan-config.json');

function configPath(userId: string): string {
  return path.join(app.getPath('userData'), `comcigan-config-${userId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

function loadConfigFromDisk(userId: string): ComciganConfig | null {
  const file = configPath(userId);
  try {
    // 예전에는 PC에 하나였다. 업데이트 뒤 처음 로그인한 사람에게 넘긴다
    if (!fs.existsSync(file) && fs.existsSync(LEGACY_CONFIG_PATH)) fs.renameSync(LEGACY_CONFIG_PATH, file);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) { console.warn('[Comcigan] Failed to load config:', err); }
  return null;
}

function saveConfigToDisk(userId: string, config: ComciganConfig | null): void {
  const file = configPath(userId);
  try {
    if (config) {
      fs.writeFileSync(file, JSON.stringify(config), 'utf-8');
    } else {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  } catch (err) { console.warn('[Comcigan] Failed to save config:', err); }
}

const WEEKDAY_STRINGS = ['월', '화', '수', '목', '금'];
/** 전교 시간표는 받는 데 몇 초 걸리므로 잠시 재사용한다 */
const GRID_TTL_MS = 10 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 15 * 1000;
/** 파서는 서버가 답하지 않으면 끝나지 않는다. 회의 찾기와 새로고침이 멈추지 않게 끊는다 */
const PARSER_TIMEOUT_MS = 30 * 1000;

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`컴시간 응답 없음 (${label})`)), PARSER_TIMEOUT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** 받은 자료에 수업 칸이 하나라도 있는지. 사이트가 빈 자료를 주면 옛 시간표를 지우지 않는다 */
export function hasAnyClass(data: any, maxGrade: number): boolean {
  for (let grade = 1; grade <= maxGrade; grade++) {
    for (const classData of Object.values<any>(data?.[grade] ?? {})) {
      for (const day of Object.values<any>(classData ?? {})) {
        if (Array.isArray(day) && day.some((cell: any) => cell?.subject || cell?.teacher)) return true;
      }
    }
  }
  return false;
}

/** 학교 코드가 틀리면 사이트가 빈 자료를 준다. 파서의 알 수 없는 오류 대신 원인을 남긴다. */
function noTimetableData(): Error {
  return Object.assign(new Error('컴시간에서 이 학교의 시간표 자료를 받지 못했습니다'), { code: 'NO_TIMETABLE_DATA' });
}

/** 컴시간 검색 주소는 학교 이름을 EUC-KR로 받는다. 파서가 함께 설치한 변환기를 쓴다. */
function eucKrPercent(text: string): string {
  const iconv = require(require.resolve('iconv-lite', { paths: [path.dirname(require.resolve('comcigan-parser'))] }));
  let out = '';
  for (const byte of iconv.encode(text, 'euc-kr')) out += `%${byte.toString(16).padStart(2, '0')}`;
  return out;
}

function getText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`컴시간 응답 오류 (${res.statusCode})`));
        return;
      }
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.setTimeout(SEARCH_TIMEOUT_MS, () => req.destroy(new Error('컴시간 응답 없음')));
    req.on('error', reject);
  });
}

class ComciganService {
  private timetable: any = null;
  private userId: string | null = null;
  private config: ComciganConfig | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private cachedData: ComciganTimetableData | null = null;
  private mainWindow: BrowserWindow | null = null;
  private gridCache = new Map<number, ComciganSchoolGrid>();
  private gridPending = new Map<number, Promise<ComciganSchoolGrid>>();

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  /** 로그인한 사람의 설정을 바로 읽는다. 로그아웃하면 null로 불러 앞 사람의 시간표를 비운다 */
  setUser(userId: string | null): void {
    if (userId === this.userId) return;
    this.userId = userId;
    this.config = userId ? loadConfigFromDisk(userId) : null;
    this.timetable = null;
    this.cachedData = null;
    if (this.config) this.startAutoRefresh();
    else this.stopAutoRefresh();
  }

  /**
   * 파서를 초기화해 준비된 인스턴스만 this.timetable에 둔다. 실패하면 throw.
   * 초기화 도중 설정이 바뀌었으면(학교 변경/해제) 옛 설정의 인스턴스는 버린다.
   */
  private async initTimetable(config: ComciganConfig): Promise<void> {
    const timetable = new Timetable();
    await withTimeout(timetable.init({ maxGrade: config.maxGrade || 3 }), '초기화');
    timetable.setSchool(config.schoolCode);
    if (this.config === config) this.timetable = timetable;
  }

  /** 앱 시작 때 조금 늦게 부른다. 네트워크가 무거워 조회만 늦추고, 설정은 setUser가 바로 읽는다 */
  async init(): Promise<void> {
    if (this.config && Timetable) {
      this.fetchTimetable().catch((err) => console.warn('[Comcigan] Initial fetch failed:', err));
      this.startAutoRefresh();
    }
  }

  async searchSchool(name: string): Promise<ComciganSchool[]> {
    if (!Timetable) throw new Error('comcigan-parser 모듈을 찾을 수 없습니다');
    const t = new Timetable();
    await withTimeout(t.init({ maxGrade: 3 }), '초기화');
    // 파서의 search는 학교 코드가 아닌 열을 읽어 빈 시간표를 받게 된다. 초기화로 찾은 같은 주소를 직접 읽는다.
    const schools = parseSchoolSearch(await getText(`${t._baseUrl}${t._extractCode}${eucKrPercent(name)}`));
    if (schools.length === 0) throw new Error('검색된 학교가 없습니다.');
    return schools;
  }

  async configure(config: ComciganConfig): Promise<void> {
    if (!Timetable) throw new Error('comcigan-parser 모듈을 찾을 수 없습니다');
    if (!this.userId) throw new Error('로그인한 뒤에 설정할 수 있습니다');
    this.config = config;
    saveConfigToDisk(this.userId, config);

    // 초기화가 실패해도 새 설정으로 옛 학교 시간표를 읽지 않도록 먼저 비운다
    this.timetable = null;
    await this.initTimetable(config);

    await this.fetchTimetable();
    this.startAutoRefresh();
  }

  async fetchTimetable(): Promise<ComciganTimetableData | null> {
    const config = this.config;
    if (!config) return null;

    try {
      // 앱 시작 때 네트워크가 없었거나 직전 조회가 실패했으면 여기서 다시 초기화한다
      if (!this.timetable) await this.initTimetable(config);
      const timetable = this.timetable;
      if (!timetable || this.config !== config) return this.cachedData; // 초기화 도중 설정이 바뀜

      const classTimes = await this.readClassTimes(timetable);
      const data = await withTimeout(timetable.getTimetable(), '시간표');
      // 사이트가 빈 자료를 주면 옛 시간표를 지우지 않는다
      if (!hasAnyClass(data, config.maxGrade || 3)) throw noTimetableData();
      // 받는 사이 로그아웃하거나 설정을 바꿨으면 버린다
      if (this.config !== config) return this.cachedData;

      const schedule = this.extractTeacherSchedule(data, config.teacherName, classTimes, config.teacherLabel);

      this.cachedData = {
        teacherSchedule: schedule,
        classTimes,
        lastUpdated: new Date().toISOString(),
        schoolName: config.schoolName,
      };

      // Push to renderer
      this.sendToRenderer('comcigan:updated', this.cachedData);
      return this.cachedData;
    } catch (err) {
      // 실행 중 사이트 식별 코드가 바뀌었을 수 있으므로 인스턴스를 버려 다음 갱신에서 다시 초기화한다
      console.warn('[Comcigan] Fetch failed, will re-init on next refresh:', err);
      if (this.config !== config) return this.cachedData;
      this.timetable = null;
      if ((err as { code?: string })?.code === 'NO_TIMETABLE_DATA' && await this.repairSchoolCode()) {
        return this.fetchTimetable();
      }
      return this.cachedData; // Return cached on error
    }
  }

  /** 시정표. 조회에 실패하면 빈 값으로 넘어가고, 자료 자체가 비었으면 오류를 낸다. */
  private async readClassTimes(timetable: any): Promise<string[]> {
    let times: unknown;
    try {
      times = await withTimeout(timetable.getClassTime(), '시정표');
    } catch (e) {
      console.warn('[Comcigan] getClassTime failed:', e);
      return [];
    }
    if (times === undefined) throw noTimetableData();
    return Array.isArray(times) ? times : [];
  }

  /**
   * 예전 파서는 학교 검색에서 코드가 아닌 열을 읽었다. 그때 연결한 PC는 틀린 코드를 저장하고 있어 빈 자료를 받는다.
   * 저장된 학교 이름으로 다시 찾아 코드만 바로잡는다. 이름이 정확히 하나로 맞을 때만 고치고, 고쳤으면 true.
   */
  private async repairSchoolCode(): Promise<boolean> {
    const config = this.config;
    if (!config) return false;
    try {
      const found = (await this.searchSchool(config.schoolName)).filter((s) => s.name === config.schoolName);
      if (found.length !== 1 || found[0].code === config.schoolCode) return false;
      if (this.config !== config) return false; // 찾는 동안 설정이 바뀜
      console.warn('[Comcigan] 저장된 학교 코드를 바로잡았습니다');
      this.config = { ...config, schoolCode: found[0].code };
      if (this.userId) saveConfigToDisk(this.userId, this.config);
      return true;
    } catch (err) {
      console.warn('[Comcigan] School code repair failed:', err);
      return false;
    }
  }

  /**
   * 학교 전체의 교사별 수업 칸. 회의 찾기와 연결표에 쓴다.
   * 내 시간표 설정과 별개로 학교 코드만으로 읽어, 다른 학교도 볼 수 있다.
   * 받지 못하면 전에 받은 값을 돌려주고, 받은 적이 없으면 오류를 낸다.
   */
  async getSchoolGrid(schoolCode: number, maxGrade: number, force = false): Promise<ComciganSchoolGrid> {
    if (!Timetable) throw new Error('comcigan-parser 모듈을 찾을 수 없습니다');
    const cached = this.gridCache.get(schoolCode);
    if (!force && cached && Date.now() - new Date(cached.fetchedAt).getTime() < GRID_TTL_MS) return cached;
    const pending = this.gridPending.get(schoolCode);
    if (pending) return pending;

    const load = (async () => {
      try {
        const timetable = new Timetable();
        await withTimeout(timetable.init({ maxGrade }), '초기화');
        timetable.setSchool(schoolCode);
        const classTimes = await this.readClassTimes(timetable);
        const data = await withTimeout(timetable.getTimetable(), '시간표');
        // 사이트가 빈 자료를 주면 모두 공강으로 잘못 나온다
        if (!hasAnyClass(data, maxGrade)) throw noTimetableData();
        const grid: ComciganSchoolGrid = {
          schoolCode,
          teachers: buildTeacherGrid(data, maxGrade),
          classTimes,
          fetchedAt: new Date().toISOString(),
        };
        this.gridCache.set(schoolCode, grid);
        return grid;
      } catch (err) {
        console.warn('[Comcigan] School grid failed:', err);
        if (cached) return cached;
        throw err;
      } finally {
        this.gridPending.delete(schoolCode);
      }
    })();
    this.gridPending.set(schoolCode, load);
    return load;
  }

  private extractTeacherSchedule(
    fullData: any,
    teacherName: string,
    classTimes: string[],
    teacherLabel?: string,
  ): TeacherPeriod[] {
    const schedule: TeacherPeriod[] = [];
    const maxGrade = this.config?.maxGrade || 3;
    // comcigan-parser truncates teacher names to 2 chars
    const namePrefix = teacherName.substring(0, 2);

    for (let grade = 1; grade <= maxGrade; grade++) {
      if (!fullData[grade]) continue;
      const classKeys = Object.keys(fullData[grade]).map(Number).filter((n) => n > 0);

      for (const classNum of classKeys) {
        const classData = fullData[grade][classNum];
        if (!classData) continue;

        // comcigan-parser weekday index: 0=Mon ~ 4=Fri
        for (let dayIdx = 0; dayIdx <= 4; dayIdx++) {
          const dayData = classData[dayIdx];
          if (!dayData || !Array.isArray(dayData)) continue;

          for (let periodIdx = 0; periodIdx < dayData.length; periodIdx++) {
            const cell = dayData[periodIdx];
            if (!cell) continue;

            const teacher = cell.teacher || '';
            const subject = cell.subject || '';
            // classTime이 있으면 사용, 없으면 배열 인덱스+1로 폴백
            const periodNum = cell.classTime || (periodIdx + 1);

            if (!teacher || !subject) continue;

            // 연결표로 확인한 표기가 있으면 그 값만 본다. 없으면 이름 앞 두 글자로 찾는다 (파서가 이름을 두 글자로 자른다).
            if (teacherLabel ? teacher === teacherLabel : teacher === namePrefix || teacher.includes(namePrefix)) {
              // weekday: store as 1=Mon~5=Fri for our internal use
              const weekday = dayIdx + 1;

              // Parse start time from classTimes
              let startTime: string | undefined;
              const ctEntry = classTimes[periodNum - 1];
              if (ctEntry) {
                const match = ctEntry.match(/\((\d{2}:\d{2})\)/);
                if (match) startTime = match[1];
              }

              schedule.push({
                grade,
                classNum,
                weekday,
                weekdayStr: WEEKDAY_STRINGS[dayIdx] || '',
                period: periodNum,
                subject,
                startTime,
              });
            }
          }
        }
      }
    }

    // Deduplicate: same weekday + period → keep first match only
    const seen = new Set<string>();
    const deduplicated = schedule.filter((s) => {
      const key = `${s.weekday}-${s.period}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by weekday, then period
    deduplicated.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
    return deduplicated;
  }

  startAutoRefresh(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    // Check every 5 minutes
    this.refreshTimer = setInterval(() => {
      if (this.isRefreshTime()) {
        this.fetchTimetable().catch(() => {});
      }
    }, 5 * 60 * 1000);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private isRefreshTime(): boolean {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    const hour = now.getHours();
    const min = now.getMinutes();
    const timeInMin = hour * 60 + min; // 07:30 = 450, 17:00 = 1020
    return day >= 1 && day <= 5 && timeInMin >= 450 && timeInMin <= 1020;
  }

  getCachedData(): ComciganTimetableData | null {
    return this.cachedData;
  }

  getConfig(): ComciganConfig | null {
    return this.config;
  }

  clearConfig(): void {
    this.config = null;
    this.cachedData = null;
    this.timetable = null;
    if (this.userId) saveConfigToDisk(this.userId, null);
    this.stopAutoRefresh();
  }

  private sendToRenderer(channel: string, data: any): void {
    try {
      this.mainWindow?.webContents.send(channel, data);
    } catch {}
  }
}

export const comciganService = new ComciganService();

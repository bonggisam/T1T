/**
 * 나이스 교육정보 개방 포털의 학교 시간표.
 *
 * 학년, 반, 교시, 과목만 있고 교사 이름은 없다. 누가 어느 칸을 가르치는지는
 * 담당 학급 표(teachingAssignments)와 맞춰서 찾는다.
 */
import { addDays, format, startOfWeek } from 'date-fns';
import type { School } from '@shared/types';
import { fetchWithTimeout, getNeisConfig } from './neisSchedule';

export interface NeisCell {
  /** 1=월 ~ 5=금 */
  weekday: number;
  period: number;
  grade: number;
  classNum: number;
  subject: string;
}

export type NeisErrorCode = 'no_key' | 'no_school' | 'network' | 'server';

export class NeisTimetableError extends Error {
  code: NeisErrorCode;

  constructor(code: NeisErrorCode, message: string) {
    super(message);
    this.name = 'NeisTimetableError';
    this.code = code;
  }
}

const ENDPOINTS: Record<string, string> = {
  taeseong_middle: 'misTimetable',
  taeseong_high: 'hisTimetable',
};

/** 전교 한 주가 1,000칸 안팎이다. 키가 있으면 한 쪽에 1,000칸까지 받는다 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const FETCH_TIMEOUT_MS = 20 * 1000;

/**
 * 나이스 시간표를 다시 받는 시각. 매일 8시부터 16시까지 정각마다 받는다.
 * 학교가 그날 바꾼 수업을 나이스에 넣으면 다음 정각에 반영된다. 그 밖의 시간에는 이 PC에 둔 값을 쓴다.
 */
export const NEIS_SYNC_FIRST_HOUR = 8;
export const NEIS_SYNC_LAST_HOUR = 16;
export const NEIS_SYNC_LABEL = `매일 ${NEIS_SYNC_FIRST_HOUR}시부터 ${NEIS_SYNC_LAST_HOUR}시까지 정각마다`;

/** now 또는 그 앞의 가장 가까운 받기 시각. 8시 전이면 전날 16시다 */
export function lastSyncSlot(now: Date = new Date()): Date {
  const hour = now.getHours();
  if (hour < NEIS_SYNC_FIRST_HOUR) return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, NEIS_SYNC_LAST_HOUR);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.min(hour, NEIS_SYNC_LAST_HOUR));
}

/** now 뒤의 다음 받기 시각. 16시가 지나면 다음 날 8시다 */
export function nextSyncSlot(now: Date = new Date()): Date {
  const hour = now.getHours();
  if (hour < NEIS_SYNC_FIRST_HOUR) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), NEIS_SYNC_FIRST_HOUR);
  if (hour >= NEIS_SYNC_LAST_HOUR) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, NEIS_SYNC_FIRST_HOUR);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour + 1);
}

/** 그 받기 시각의 바로 앞 받기 시각. 8시의 앞은 전날 16시다 */
export function previousSyncSlot(slot: Date): Date {
  return lastSyncSlot(new Date(slot.getTime() - 1));
}

/** 마지막 받기 시각 뒤에 받은 값인가. 시계를 되돌려 앞날에 받은 값으로 보이면 새로 받는다 */
export function isNeisFresh(fetchedAt: string, now: Date = new Date()): boolean {
  const at = new Date(fetchedAt).getTime();
  return !Number.isNaN(at) && at >= lastSyncSlot(now).getTime() && at <= now.getTime() + 60 * 1000;
}

function neisKey(): string {
  return String(import.meta.env.VITE_NEIS_KEY ?? '').trim();
}

/** 받을 주의 월요일. 주말에는 다음 주를 본다 */
export function timetableWeekStart(now: Date = new Date()): Date {
  const day = now.getDay();
  const base = day === 0 || day === 6 ? addDays(now, 7) : now;
  return startOfWeek(base, { weekStartsOn: 1 });
}

function weekdayOf(ymd: string): number {
  const date = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  return date.getDay();
}

/** 나이스 응답의 행을 칸으로 바꾼다. 같은 칸이 여러 번 오면 하나만 남긴다 */
export function parseNeisRows(rows: unknown): NeisCell[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const cells: NeisCell[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const subject = String(row?.ITRT_CNTNT ?? '').trim();
    const period = Number(row?.PERIO);
    const grade = Number(row?.GRADE);
    const classNum = Number(row?.CLASS_NM);
    const weekday = weekdayOf(String(row?.ALL_TI_YMD ?? ''));
    if (!subject || subject === '-') continue;
    if (!Number.isInteger(period) || !Number.isInteger(grade) || !Number.isInteger(classNum)) continue;
    if (period <= 0 || grade <= 0 || classNum <= 0 || weekday < 1 || weekday > 5) continue;
    const key = `${weekday}|${period}|${grade}|${classNum}|${subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push({ weekday, period, grade, classNum, subject });
  }
  return cells;
}

/**
 * 학교 전체의 한 주 시간표를 받는다. 방학처럼 자료가 없는 주는 빈 배열이다.
 * @throws NeisTimetableError 키가 없거나 받지 못하면
 */
export async function fetchNeisWeek(school: School, monday: Date): Promise<NeisCell[]> {
  const endpoint = ENDPOINTS[school];
  const codes = getNeisConfig(school);
  if (!endpoint || !codes) throw new NeisTimetableError('no_school', '나이스 시간표를 쓸 수 없는 학교입니다');
  const key = neisKey();
  // 키가 없으면 앞의 5칸만 온다. 일부만 받아 수업이 빠져 보이는 것보다 받지 않는 편이 낫다
  if (!key) throw new NeisTimetableError('no_key', '나이스 인증키가 없어 시간표를 받지 못했습니다');

  const rows: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      KEY: key,
      Type: 'json',
      pIndex: String(page),
      pSize: String(PAGE_SIZE),
      ATPT_OFCDC_SC_CODE: codes.education,
      SD_SCHUL_CODE: codes.school,
      TI_FROM_YMD: format(monday, 'yyyyMMdd'),
      TI_TO_YMD: format(addDays(monday, 4), 'yyyyMMdd'),
    });
    let body: any;
    try {
      const res = await fetchWithTimeout(`https://open.neis.go.kr/hub/${endpoint}?${params}`, FETCH_TIMEOUT_MS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (err) {
      console.warn('[NeisTimetable] fetch failed:', err);
      throw new NeisTimetableError('network', '나이스에서 시간표를 받지 못했습니다');
    }

    const list = body?.[endpoint];
    if (!Array.isArray(list)) {
      const code = String(body?.RESULT?.CODE ?? '');
      if (code === 'INFO-200') return []; // 해당 자료 없음
      console.warn('[NeisTimetable] unexpected result:', code);
      throw new NeisTimetableError('server', `나이스에서 시간표를 받지 못했습니다 (${code || '응답 오류'})`);
    }
    const pageRows = list[1]?.row;
    if (Array.isArray(pageRows)) rows.push(...pageRows);
    const total = Number(list[0]?.head?.[0]?.list_total_count) || 0;
    if (!Array.isArray(pageRows) || pageRows.length === 0 || rows.length >= total) break;
  }
  return parseNeisRows(rows);
}

export interface NeisWeek {
  school: School;
  weekStart: string;
  fetchedAt: string;
  cells: NeisCell[];
}

function weekCacheKey(school: School): string {
  return `t1t-neis-week-${school}`;
}

function readWeekCache(school: School, weekStart: string): NeisWeek | null {
  try {
    const raw = localStorage.getItem(weekCacheKey(school));
    const week = raw ? (JSON.parse(raw) as NeisWeek) : null;
    return week && week.weekStart === weekStart && Array.isArray(week.cells) ? week : null;
  } catch (e) {
    console.warn('[NeisTimetable] cache read failed:', e);
    return null;
  }
}

function writeWeekCache(week: NeisWeek): void {
  try {
    localStorage.setItem(weekCacheKey(week.school), JSON.stringify(week));
  } catch (e) {
    console.warn('[NeisTimetable] cache write failed:', e);
  }
}

/**
 * 이번 주 학교 시간표. 저장본을 마지막 받기 시각(매일 8~16시 정각) 뒤에 받았으면 그것을 쓴다.
 * 받지 못하면 같은 주의 저장본을 돌려주고, 저장본도 없으면 오류를 던진다.
 * @param force 새로고침 단추처럼 사람이 눌렀을 때
 */
export async function loadNeisWeek(school: School, force = false): Promise<NeisWeek & { error?: NeisTimetableError }> {
  const now = new Date();
  const monday = timetableWeekStart(now);
  const weekStart = format(monday, 'yyyy-MM-dd');
  const saved = readWeekCache(school, weekStart);
  if (!force && saved && isNeisFresh(saved.fetchedAt, now)) return saved;
  try {
    const cells = await fetchNeisWeek(school, monday);
    // 사이트가 잠깐 빈 값을 주어도 같은 주에 받아 둔 시간표를 지우지 않는다
    const week: NeisWeek = {
      school,
      weekStart,
      fetchedAt: new Date().toISOString(),
      cells: cells.length === 0 && saved ? saved.cells : cells,
    };
    writeWeekCache(week);
    return week;
  } catch (err) {
    if (saved && err instanceof NeisTimetableError) return { ...saved, error: err };
    throw err;
  }
}

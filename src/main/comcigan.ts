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

import type { ComciganConfig, ComciganSchool, ComciganTimetableData, TeacherPeriod } from '../shared/types';
import { BrowserWindow } from 'electron';

// Simple JSON file persistence (avoid electron-store ESM issues)
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const CONFIG_PATH = path.join(app.getPath('userData'), 'comcigan-config.json');

function loadConfigFromDisk(): ComciganConfig | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveConfigToDisk(config: ComciganConfig | null): void {
  try {
    if (config) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config), 'utf-8');
    } else {
      if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
    }
  } catch {}
}

const WEEKDAY_STRINGS = ['', '월', '화', '수', '목', '금'];

class ComciganService {
  private timetable: any = null;
  private config: ComciganConfig | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private cachedData: ComciganTimetableData | null = null;
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  async init(): Promise<void> {
    this.config = loadConfigFromDisk();
    if (this.config && Timetable) {
      try {
        this.timetable = new Timetable();
        await this.timetable.init({ maxGrade: this.config.maxGrade || 3 });
        this.timetable.setSchool(this.config.schoolCode);
        // Initial fetch (non-blocking)
        this.fetchTimetable().catch(() => {});
      } catch {
        // comcigan may be unreachable — will retry on next refresh
      }
    }
    this.startAutoRefresh();
  }

  async searchSchool(name: string): Promise<ComciganSchool[]> {
    if (!Timetable) throw new Error('comcigan-parser 모듈을 찾을 수 없습니다');
    const t = new Timetable();
    await t.init({ maxGrade: 3 });
    const results = await t.search(name);
    return results.map((r: any) => ({
      code: r.code,
      name: r.name,
      region: r.region,
    }));
  }

  async configure(config: ComciganConfig): Promise<void> {
    if (!Timetable) throw new Error('comcigan-parser 모듈을 찾을 수 없습니다');
    this.config = config;
    saveConfigToDisk(config);

    this.timetable = new Timetable();
    await this.timetable.init({ maxGrade: config.maxGrade || 3 });
    this.timetable.setSchool(config.schoolCode);

    await this.fetchTimetable();
    this.startAutoRefresh();
  }

  async fetchTimetable(): Promise<ComciganTimetableData | null> {
    if (!this.timetable || !this.config) return null;

    try {
      const data = await this.timetable.getTimetable();
      let classTimes: string[] = [];
      try {
        classTimes = await this.timetable.getClassTime();
      } catch {}

      const schedule = this.extractTeacherSchedule(data, this.config.teacherName, classTimes);

      this.cachedData = {
        teacherSchedule: schedule,
        classTimes,
        lastUpdated: new Date().toISOString(),
        schoolName: this.config.schoolName,
      };

      // Push to renderer
      this.sendToRenderer('comcigan:updated', this.cachedData);
      return this.cachedData;
    } catch {
      return this.cachedData; // Return cached on error
    }
  }

  private extractTeacherSchedule(
    fullData: any,
    teacherName: string,
    classTimes: string[],
  ): TeacherPeriod[] {
    const schedule: TeacherPeriod[] = [];
    const maxGrade = this.config?.maxGrade || 3;

    for (let grade = 1; grade <= maxGrade; grade++) {
      if (!fullData[grade]) continue;
      const classKeys = Object.keys(fullData[grade]).map(Number).filter((n) => n > 0);

      for (const classNum of classKeys) {
        const classData = fullData[grade][classNum];
        if (!classData) continue;

        // weekday: 1=Mon ~ 5=Fri
        for (let weekday = 1; weekday <= 5; weekday++) {
          const dayData = classData[weekday];
          if (!dayData || !Array.isArray(dayData)) continue;

          for (let period = 0; period < dayData.length; period++) {
            const cell = dayData[period];
            if (!cell) continue;

            const teacher = cell.teacher || '';
            const subject = cell.subject || '';

            if (teacher && teacher.includes(teacherName)) {
              // Parse start time from classTimes
              let startTime: string | undefined;
              const ctEntry = classTimes[period];
              if (ctEntry) {
                const match = ctEntry.match(/\((\d{2}:\d{2})\)/);
                if (match) startTime = match[1];
              }

              schedule.push({
                grade,
                classNum,
                weekday,
                weekdayStr: WEEKDAY_STRINGS[weekday] || '',
                period: period + 1,
                subject,
                startTime,
              });
            }
          }
        }
      }
    }

    // Sort by weekday, then period
    schedule.sort((a, b) => a.weekday - b.weekday || a.period - b.period);
    return schedule;
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
    saveConfigToDisk(null);
    this.stopAutoRefresh();
  }

  private sendToRenderer(channel: string, data: any): void {
    try {
      this.mainWindow?.webContents.send(channel, data);
    } catch {}
  }
}

export const comciganService = new ComciganService();

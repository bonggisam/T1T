import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import type { CalendarEvent } from '@shared/types';
import type { CustomDDay } from '../store/widgetStore';

/** 학사일정 중 D-Day로 자동 표시할 일정 키워드 */
const AUTO_DDAY_PATTERN = /(고사|시험|학력평가|방학|개학|수능|졸업|입학|체육대회|축제|수학여행|수련회|체험학습)/;
const AUTO_DDAY_RANGE_DAYS = 180;

export interface DDayItem {
  key: string; // `제목|YYYY-MM-DD`
  title: string;
  date: Date;
  days: number; // 0 = 오늘
  customId?: string;
}

export function formatDDay(days: number): string {
  return days === 0 ? 'D-Day' : `D-${days}`;
}

export function collectDDays(
  events: CalendarEvent[],
  customDDays: CustomDDay[],
  hiddenAutoKeys: string[],
  now: Date = new Date(),
): DDayItem[] {
  const today = startOfDay(now);
  const hidden = new Set(hiddenAutoKeys);
  const byKey = new Map<string, DDayItem>();

  for (const e of events) {
    const title = e.title.trim();
    if (!AUTO_DDAY_PATTERN.test(title)) continue;
    const date = startOfDay(new Date(e.startDate));
    const days = differenceInCalendarDays(date, today);
    if (days < 0 || days > AUTO_DDAY_RANGE_DAYS) continue;
    const key = `${title}|${format(date, 'yyyy-MM-dd')}`;
    // 양교 공통 학사일정이 두 번 들어와도 한 번만 표시
    if (hidden.has(key) || byKey.has(key)) continue;
    byKey.set(key, { key, title, date, days });
  }

  for (const c of customDDays) {
    const date = startOfDay(parseISO(c.date));
    const days = differenceInCalendarDays(date, today);
    if (Number.isNaN(days) || days < 0) continue;
    byKey.set(`custom|${c.id}`, { key: `custom|${c.id}`, title: c.title, date, days, customId: c.id });
  }

  return [...byKey.values()].sort((a, b) => a.days - b.days || a.title.localeCompare(b.title, 'ko'));
}

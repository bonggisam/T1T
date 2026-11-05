import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { RepeatConfig } from '@shared/types';
import { getHoliday } from './holidays';

/**
 * 반복 일정 계산.
 *
 * 회차마다 문서를 하나씩 만들므로 너무 많이 만들지 않도록 막는다.
 * 한 학년도 매주 일정이 52회, 평일 매일 한 학기가 100회 남짓이다.
 */
export const MAX_OCCURRENCES = 100;
/** 잘못 고른 종료일로 오래 도는 것을 막는 한도 */
const MAX_RANGE_DAYS = 800;

export interface Occurrence {
  start: Date;
  end: Date;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const NTH_LABELS = ['', '첫째', '둘째', '셋째', '넷째', '다섯째'];

function parseDay(ymd: string): Date | null {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? date : null;
}

/** 그 달의 몇째 그 요일인지 (1부터) */
export function nthOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/** 월요일 기준 주 번호. 격주 계산에 쓴다. */
function weekIndex(date: Date): number {
  const mondayBased = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayBased);
  // 일광절약시간이 있는 지역에서도 어긋나지 않도록 반올림한다
  return Math.round(monday.getTime() / (7 * 24 * 60 * 60 * 1000));
}

function matches(day: Date, first: Date, rule: RepeatConfig): boolean {
  switch (rule.type) {
    case 'weekdays':
      return day.getDay() >= 1 && day.getDay() <= 5;
    case 'weekly': {
      if (!(rule.daysOfWeek ?? []).includes(day.getDay())) return false;
      const interval = Math.max(1, rule.interval || 1);
      return (weekIndex(day) - weekIndex(first)) % interval === 0;
    }
    case 'monthly':
      return day.getDate() === first.getDate();
    case 'monthlyNth':
      return day.getDay() === first.getDay() && nthOfMonth(day) === nthOfMonth(first);
    default:
      return false;
  }
}

/**
 * 규칙에 맞는 회차를 시작일부터 종료일까지 계산한다.
 * 시작일이 규칙에 맞지 않거나 공휴일이어서 건너뛰면 첫 회차가 그 뒤로 밀린다.
 * @returns truncated가 true면 한도를 넘어 잘린 것이다. 저장하지 말고 종료일을 앞당기게 한다.
 */
export function expandOccurrences(
  start: Date,
  end: Date,
  rule: RepeatConfig,
): { occurrences: Occurrence[]; truncated: boolean } {
  const until = parseDay(rule.until);
  const occurrences: Occurrence[] = [];
  if (!until) return { occurrences, truncated: false };

  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const duration = Math.max(0, end.getTime() - start.getTime());

  for (let i = 0; i <= MAX_RANGE_DAYS; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    if (day > until) break;
    if (!matches(day, first, rule)) continue;
    if (rule.skipHolidays && getHoliday(day)) continue;
    if (occurrences.length === MAX_OCCURRENCES) return { occurrences, truncated: true };
    const occurrenceStart = new Date(
      day.getFullYear(), day.getMonth(), day.getDate(),
      start.getHours(), start.getMinutes(), start.getSeconds(),
    );
    occurrences.push({ start: occurrenceStart, end: new Date(occurrenceStart.getTime() + duration) });
  }
  return { occurrences, truncated: false };
}

/** 기본 종료일: 지금 학기의 끝. 1학기는 7월 말, 2학기는 다음 해 2월 말까지로 본다. */
export function defaultUntil(start: Date): string {
  const month = start.getMonth() + 1;
  const year = start.getFullYear();
  if (month >= 3 && month <= 7) return `${year}-07-31`;
  const endYear = month >= 8 ? year + 1 : year;
  return format(new Date(endYear, 2, 0), 'yyyy-MM-dd');
}

/** 매주 화·목, 2월 28일까지 */
export function describeRepeat(rule: RepeatConfig, start: Date): string {
  let what: string;
  switch (rule.type) {
    case 'weekdays':
      what = '평일 매일';
      break;
    case 'weekly': {
      const days = [...(rule.daysOfWeek ?? [])]
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => WEEKDAY_LABELS[d])
        .join('·');
      what = `${rule.interval === 2 ? '격주' : '매주'} ${days}`;
      break;
    }
    case 'monthly':
      what = `매월 ${start.getDate()}일`;
      break;
    case 'monthlyNth':
      what = `매월 ${NTH_LABELS[nthOfMonth(start)]} ${format(start, 'EEEE', { locale: ko })}`;
      break;
    default:
      what = '반복';
  }
  const until = parseDay(rule.until);
  return until ? `${what}, ${format(until, 'M월 d일')}까지` : what;
}

/** 회차를 묶는 값. Firestore 문서 ID와 같은 모양으로 만든다. */
export function newSeriesId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 's';
  for (let i = 0; i < 19; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/** 일정 전체를 옮길 때 요일 지정도 같은 날수만큼 옮긴다 */
export function shiftRepeatDays(rule: RepeatConfig, dayShift: number): RepeatConfig {
  if (rule.type !== 'weekly' || dayShift % 7 === 0) return rule;
  return { ...rule, daysOfWeek: (rule.daysOfWeek ?? []).map((d) => (((d + dayShift) % 7) + 7) % 7) };
}

/**
 * 반복 일정의 여러 회차를 고칠 때는 실제로 바꾼 칸만 보낸다.
 * 입력 창은 모든 칸을 넘기므로 그대로 쓰면 회차마다 따로 고친 제목과 설명이 덮인다.
 */
export function changedFields<T extends object>(before: T, updates: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(updates) as Array<keyof T>) {
    const value = updates[key];
    if (value === undefined) continue;
    const same = JSON.stringify(before[key] ?? null) === JSON.stringify(value ?? null);
    if (!same) out[key] = value;
  }
  return out;
}

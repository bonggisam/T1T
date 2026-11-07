import { addDays, format, getISOWeek, getISOWeekYear, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { ComciganTimetableData, TeacherPeriod } from '@shared/types';
import type { BaseChange } from './baseTimetable';
import { CLASS_DURATION_MIN } from './timetableOverlap';
import { getHoliday } from './holidays';
import { lastSyncSlot, previousSyncSlot } from './neisTimetable';

/** 컴시간 startTime이 없을 때 쓰는 교시별 시작 시각 (캘린더 뷰들과 동일한 기본값) */
const DEFAULT_PERIOD_START_HOURS: Record<number, number> = { 1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 15, 8: 16 };

/** 수업 시작 몇 분 전부터 수업 중으로 볼지. 교실에 들어가 화면을 켜는 시간이다. */
const CLASS_LEAD_MIN = 1;

export interface TimedPeriod extends TeacherPeriod {
  startMin: number; // 자정부터 분
  endMin: number;
}

export interface TimetableChange {
  /** 같은 칸의 변경을 하나로 합치는 키 */
  key: string;
  date: string; // yyyy-MM-dd
  period: number;
  before: string;
  after: string;
  /** 왜 바뀌었는지. 보강, 단축, 그 반에 들어간 과목 */
  note?: string;
}

export function formatClassLabel(p: TeacherPeriod): string {
  return `${p.period}교시 ${p.subject} (${p.grade}-${p.classNum})${p.moved ? ' · 교체' : ''}`;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** 1=월 … 7=일 */
export function weekdayMon1(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function startMinutesOf(entry: string): number | null {
  const m = entry.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * 교시 시작 간격으로 한 교시 길이를 어림한다. 쉬는 시간을 10분으로 보고 점심시간처럼 긴 간격은 뺀다.
 * 학교마다 달라서(중학교 45분, 고등학교 50분) 고정값으로 두면 수업 끝이 어긋난다.
 */
export function classDurationMin(classTimes: string[] | undefined): number {
  const starts = (classTimes ?? []).map(startMinutesOf).filter((m): m is number => m !== null);
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    if (gap > 0 && gap <= 70) gaps.push(gap);
  }
  if (gaps.length === 0) return CLASS_DURATION_MIN;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.min(50, Math.max(40, median - 10));
}

/** 해당 날짜의 내 수업을 시작 시각 순으로 반환 (주말·공휴일·미설정이면 빈 배열) */
export function getTimedPeriods(data: ComciganTimetableData | null, date: Date): TimedPeriod[] {
  if (!data) return [];
  const wd = weekdayMon1(date);
  if (wd > 5 || getHoliday(date)) return [];
  const duration = classDurationMin(data.classTimes);
  return data.teacherSchedule
    .filter((p) => p.weekday === wd)
    .map((p) => {
      let startMin: number;
      if (p.startTime) {
        const [h, m] = p.startTime.split(':').map(Number);
        startMin = (h || 0) * 60 + (m || 0);
      } else {
        const h = DEFAULT_PERIOD_START_HOURS[p.period];
        if (h === undefined) return null;
        startMin = h * 60;
      }
      return { ...p, startMin, endMin: startMin + duration };
    })
    .filter((p): p is TimedPeriod => p !== null)
    .sort((a, b) => a.startMin - b.startMin);
}

/** 지금 진행 중인 수업과 다음 수업 */
export function getCurrentAndNext(periods: TimedPeriod[], now: Date): {
  current: TimedPeriod | null;
  next: TimedPeriod | null;
  remaining: number; // 아직 시작 안 한 수업 수
} {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = periods.find((p) => p.startMin <= nowMin && nowMin < p.endMin) ?? null;
  const upcoming = periods.filter((p) => p.startMin > nowMin);
  return { current, next: upcoming[0] ?? null, remaining: upcoming.length };
}

/** 수업 화면 보호 기준의 수업 시간: 시작 1분 전부터 끝날 때까지 */
export function isInClass(periods: TimedPeriod[], now: Date): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return periods.some((p) => nowMin >= p.startMin - CLASS_LEAD_MIN && nowMin < p.endMin);
}

/**
 * 같은 주에 받은 두 시간표를 비교해 앞으로 남은 이번 주 교시 중 바뀐 것을 찾는다.
 * 주가 바뀌면 시간표 전체가 새로 오므로 비교하지 않는다.
 */
export function diffTimetable(
  prev: ComciganTimetableData | null,
  next: ComciganTimetableData | null,
  now: Date = new Date(),
): TimetableChange[] {
  if (!prev || !next || prev.schoolName !== next.schoolName) return [];
  // 조회가 잘못되어 빈 시간표가 온 경우를 "모든 수업이 사라짐"으로 알리지 않는다
  if (next.teacherSchedule.length === 0) return [];
  const prevAt = new Date(prev.lastUpdated);
  if (Number.isNaN(prevAt.getTime())) return [];
  if (getISOWeekYear(prevAt) !== getISOWeekYear(now) || getISOWeek(prevAt) !== getISOWeek(now)) return [];

  const today = weekdayMon1(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const duration = classDurationMin(next.classTimes);
  const isOver = (p: TeacherPeriod): boolean => {
    if (p.weekday < today) return true;
    if (p.weekday > today || !p.startTime) return false;
    const start = startMinutesOf(p.startTime);
    return start !== null && start + duration <= nowMin;
  };
  const slotMap = (data: ComciganTimetableData) => {
    const map = new Map<string, string>();
    for (const p of data.teacherSchedule) {
      if (isOver(p)) continue;
      const key = `${p.weekday}-${p.period}`;
      const label = `${p.subject}(${p.grade}-${p.classNum})`;
      map.set(key, map.has(key) ? [map.get(key), label].sort().join(', ') : label);
    }
    return map;
  };
  const a = slotMap(prev);
  const b = slotMap(next);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const monday = startOfWeek(now, { weekStartsOn: 1 });

  const changes: TimetableChange[] = [];
  for (const key of keys) {
    const before = a.get(key) ?? '없음';
    const after = b.get(key) ?? '없음';
    if (before === after) continue;
    const [wd, period] = key.split('-').map(Number);
    const date = format(addDays(monday, wd - 1), 'yyyy-MM-dd');
    changes.push({ key: `${date}-${period}`, date, period, before, after });
  }
  return changes;
}

/**
 * 새로 찾은 변경을 쌓인 목록에 합친다. 같은 칸이 또 바뀌면 처음 값과 마지막 값만 남기고,
 * 원래대로 돌아왔으면 지운다. 지난 날짜는 버린다.
 */
export function mergeTimetableChanges(
  existing: TimetableChange[],
  incoming: TimetableChange[],
  now: Date = new Date(),
): TimetableChange[] {
  const today = format(now, 'yyyy-MM-dd');
  const map = new Map(existing.filter((c) => c.date >= today).map((c) => [c.key, c]));
  for (const change of incoming) {
    const before = map.get(change.key)?.before ?? change.before;
    if (before === change.after) map.delete(change.key);
    else map.set(change.key, { ...change, before });
  }
  return [...map.values()].sort((x, y) => x.key.localeCompare(y.key)).slice(0, 20);
}

/** 11/6(금) 3교시: 국어(2-1) → 없음 (보강) */
export function formatTimetableChange(change: TimetableChange): string {
  const day = format(new Date(`${change.date}T00:00:00`), 'M/d(EEE)', { locale: ko });
  return `${day} ${change.period}교시: ${change.before} → ${change.after}${change.note ? ` (${change.note})` : ''}`;
}

const lessonLabel = (l: { subject: string; grade: number; classNum: number }) => `${l.subject}(${l.grade}-${l.classNum})`;

function noteOf(change: BaseChange): string | undefined {
  switch (change.reason) {
    case 'moved': return '교체';
    case 'covered': return '보강';
    case 'short': return '단축';
    case 'no_class': return '그 반 수업 없음';
    case 'unusual': return '평소와 다른 날';
    case 'replaced':
      if (change.after) return '교체';
      return change.label ? `그 반 ${change.label}` : undefined;
    default: return undefined;
  }
}

/**
 * 기초 시간표와 다른 내 수업을 칸마다 한 줄로 바꾼다. 같은 칸의 변경은 합친다.
 * @param weekStart 그 주 월요일 yyyy-MM-dd
 */
export function fromBaseChanges(changes: BaseChange[], weekStart: string): TimetableChange[] {
  const monday = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(monday.getTime())) return [];
  const bySlot = new Map<string, { weekday: number; period: number; before: string[]; after: string[]; note?: string }>();
  for (const change of changes) {
    const key = `${change.weekday}-${change.period}`;
    const slot = bySlot.get(key) ?? { weekday: change.weekday, period: change.period, before: [], after: [], note: noteOf(change) };
    if (change.before) slot.before.push(lessonLabel(change.before));
    if (change.after) slot.after.push(lessonLabel(change.after));
    bySlot.set(key, slot);
  }
  return [...bySlot.values()]
    .sort((a, b) => a.weekday - b.weekday || a.period - b.period)
    .map((slot) => {
      const date = format(addDays(monday, slot.weekday - 1), 'yyyy-MM-dd');
      return {
        key: `${date}-${slot.period}`,
        date,
        period: slot.period,
        before: slot.before.length > 0 ? slot.before.sort().join(', ') : '없음',
        after: slot.after.length > 0 ? slot.after.sort().join(', ') : '없음',
        ...(slot.note ? { note: slot.note } : {}),
      };
    });
}

/** 아직 끝나지 않은 칸의 변경만 남긴다. 공휴일은 뺀다 */
export function upcomingChanges(changes: TimetableChange[], classTimes: string[], now: Date = new Date()): TimetableChange[] {
  const today = format(now, 'yyyy-MM-dd');
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const duration = classDurationMin(classTimes);
  return changes.filter((change) => {
    if (change.date < today) return false;
    if (getHoliday(new Date(`${change.date}T00:00:00`))) return false;
    if (change.date > today) return true;
    const start = classTimes[change.period - 1] ? startMinutesOf(classTimes[change.period - 1]) : null;
    return start === null || start + duration > nowMin;
  });
}

/**
 * 평일 학교 시간에 시간표를 오래 확인하지 못했는가. 받은 적이 없는 경우는 따로 안내하므로 여기서 다루지 않는다.
 * 매일 8시부터 16시까지 정각마다 받으므로, 받기 시각을 두 번 넘게 놓쳤을 때만 알린다.
 */
export function isTimetableStale(lastUpdated: string, now: Date = new Date()): boolean {
  if (weekdayMon1(now) > 5 || getHoliday(now)) return false;
  const hour = now.getHours();
  if (hour < 7 || hour >= 18) return false;
  const at = new Date(lastUpdated).getTime();
  return Number.isNaN(at) || at < previousSyncSlot(lastSyncSlot(now)).getTime();
}

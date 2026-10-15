import { getISOWeek, getISOWeekYear } from 'date-fns';
import type { ComciganTimetableData, TeacherPeriod } from '@shared/types';
import { CLASS_DURATION_MIN } from './timetableOverlap';

/** 컴시간 startTime이 없을 때 쓰는 교시별 시작 시각 (캘린더 뷰들과 동일한 기본값) */
const DEFAULT_PERIOD_START_HOURS: Record<number, number> = { 1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 15, 8: 16 };

export interface TimedPeriod extends TeacherPeriod {
  startMin: number; // 자정부터 분
  endMin: number;
}

export function formatClassLabel(p: TeacherPeriod): string {
  return `${p.period}교시 ${p.subject} (${p.grade}-${p.classNum})`;
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

/** 해당 날짜의 내 수업을 시작 시각 순으로 반환 (주말·미설정이면 빈 배열) */
export function getTimedPeriods(data: ComciganTimetableData | null, date: Date): TimedPeriod[] {
  if (!data) return [];
  const wd = weekdayMon1(date);
  if (wd > 5) return [];
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
      return { ...p, startMin, endMin: startMin + CLASS_DURATION_MIN };
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

/**
 * 같은 주에 받은 두 시간표를 비교해 오늘 이후(이번 주) 바뀐 교시를 찾는다.
 * 주가 바뀌면 시간표 전체가 새로 오므로 비교하지 않는다.
 */
export function diffTimetable(
  prev: ComciganTimetableData | null,
  next: ComciganTimetableData | null,
  now: Date = new Date(),
): string[] {
  if (!prev || !next || prev.schoolName !== next.schoolName) return [];
  const prevAt = new Date(prev.lastUpdated);
  if (Number.isNaN(prevAt.getTime())) return [];
  if (getISOWeekYear(prevAt) !== getISOWeekYear(now) || getISOWeek(prevAt) !== getISOWeek(now)) return [];

  const today = weekdayMon1(now);
  const slotMap = (data: ComciganTimetableData) => {
    const map = new Map<string, string>();
    for (const p of data.teacherSchedule) {
      if (p.weekday < today) continue;
      const key = `${p.weekday}-${p.period}`;
      const label = `${p.subject}(${p.grade}-${p.classNum})`;
      map.set(key, map.has(key) ? [map.get(key), label].sort().join(', ') : label);
    }
    return map;
  };
  const a = slotMap(prev);
  const b = slotMap(next);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const WEEKDAYS = ['', '월', '화', '수', '목', '금', '토', '일'];

  const changes: string[] = [];
  for (const key of keys) {
    const before = a.get(key) ?? '없음';
    const after = b.get(key) ?? '없음';
    if (before === after) continue;
    const [wd, period] = key.split('-').map(Number);
    changes.push(`${WEEKDAYS[wd]} ${period}교시: ${before} → ${after}`);
  }
  return changes;
}

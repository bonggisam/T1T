import type { CalendarEvent, TeacherPeriod } from '@shared/types';

const CLASS_DURATION_MIN = 45; // 한 교시 길이 (분)

interface TimeRange {
  startMin: number; // 자정부터 분
  endMin: number;
}

function parseHHMM(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 주어진 날짜의 요일(1=Mon..5=Fri)에 해당하는 시간표 수업들과
 * 해당 일정이 시간적으로 겹치는지 확인.
 */
export function hasTimetableOverlap(
  event: CalendarEvent,
  periods: TeacherPeriod[],
): TeacherPeriod[] {
  if (event.allDay) return [];
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const weekday = start.getDay(); // 0=Sun..6=Sat
  const weekdayMon1 = weekday === 0 ? 7 : weekday; // 1=Mon..7=Sun
  if (weekdayMon1 < 1 || weekdayMon1 > 5) return [];

  // 이벤트가 같은 날이 아니면 복잡하므로 단일 날짜만 처리
  if (start.toDateString() !== end.toDateString()) return [];

  const evt: TimeRange = {
    startMin: start.getHours() * 60 + start.getMinutes(),
    endMin: end.getHours() * 60 + end.getMinutes(),
  };

  const overlapping: TeacherPeriod[] = [];
  for (const p of periods) {
    if (p.weekday !== weekdayMon1) continue;
    if (!p.startTime) continue;
    const pStart = parseHHMM(p.startTime);
    const pEnd = pStart + CLASS_DURATION_MIN;
    // 겹침 조건
    if (evt.startMin < pEnd && evt.endMin > pStart) {
      overlapping.push(p);
    }
  }
  return overlapping;
}

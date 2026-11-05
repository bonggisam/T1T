import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { format, isSameDay } from 'date-fns';
import type { ComciganTimetableData } from '@shared/types';
import { getTimedPeriods } from '../utils/classPeriods';

/** 수업도 일정도 없을 때 보여 줄 시각 (오전 8시) */
const DEFAULT_ANCHOR_MINUTE = 8 * 60;
/** 기준 시각을 스크롤 영역 위에서 이 비율만큼 내려 앞 시간도 조금 보이게 한다 */
const ANCHOR_POSITION = 0.25;

interface TimelineItem {
  allDay?: boolean;
  startDate: Date | string;
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * 타임라인을 열 때 기준으로 삼을 시각(자정부터 분).
 * - 오늘이 보이면 현재 시각. 단, 오늘 첫 수업(없으면 첫 일정) 전이면 그 시각.
 * - 오늘이 안 보이면 첫 수업, 없으면 첫 일정, 둘 다 없으면 오전 8시.
 */
function getTimelineAnchorMinute(
  dates: Date[],
  timetable: ComciganTimetableData | null,
  items: TimelineItem[],
  now: Date,
): number {
  const today = dates.find((d) => isSameDay(d, now));
  const classStarts = (today ? [today] : dates)
    .flatMap((d) => getTimedPeriods(timetable, d).map((p) => p.startMin));
  const itemStarts = items
    .filter((item) => !item.allDay)
    .map((item) => minuteOfDay(new Date(item.startDate)))
    .filter(Number.isFinite);
  const starts = classStarts.length > 0 ? classStarts : itemStarts;
  const first = starts.length > 0 ? Math.min(...starts) : null;

  if (!today) return first ?? DEFAULT_ANCHOR_MINUTE;
  const nowMinute = minuteOfDay(now);
  return first !== null && nowMinute < first ? first : nowMinute;
}

/**
 * 시간 격자를 열 때 현재 시각이나 첫 수업 근처로 스크롤한다.
 * 격자의 시간 행에는 data-hour 속성이 있어야 한다. 행 높이가 일정 수에 따라 달라져도 실제 위치를 잰다.
 * 시간표와 일정이 늦게 도착하면 사용자가 스크롤하기 전까지 다시 맞추고, 보이는 날짜가 바뀌면 새로 연 것으로 본다.
 */
export function useTimelineScroll(
  scrollRef: RefObject<HTMLElement | null>,
  dates: Date[],
  timetable: ComciganTimetableData | null,
  items: TimelineItem[],
): void {
  const rangeKey = `${format(dates[0], 'yyyy-MM-dd')}/${dates.length}`;
  // 연 시각을 고정해, 열어 둔 채 시간이 흘러도 화면이 저절로 움직이지 않게 한다
  const openedAt = useMemo(() => new Date(), [rangeKey]);
  const anchorMinute = getTimelineAnchorMinute(dates, timetable, items, openedAt);
  const contentKey = `${items.length}/${timetable?.teacherSchedule.length ?? 0}`;

  const touchedRef = useRef(false);
  const lastRangeKeyRef = useRef(rangeKey);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const markTouched = () => { touchedRef.current = true; };
    el.addEventListener('wheel', markTouched, { passive: true });
    el.addEventListener('pointerdown', markTouched, { passive: true });
    el.addEventListener('keydown', markTouched);
    return () => {
      el.removeEventListener('wheel', markTouched);
      el.removeEventListener('pointerdown', markTouched);
      el.removeEventListener('keydown', markTouched);
    };
  }, [scrollRef]);

  useLayoutEffect(() => {
    if (lastRangeKeyRef.current !== rangeKey) {
      lastRangeKeyRef.current = rangeKey;
      touchedRef.current = false;
    }
    const el = scrollRef.current;
    if (!el || touchedRef.current) return;
    const row = el.querySelector<HTMLElement>(`[data-hour="${Math.floor(anchorMinute / 60)}"]`);
    if (!row) return;
    const rowTop = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const anchorY = rowTop + (row.offsetHeight * (anchorMinute % 60)) / 60;
    el.scrollTop = anchorY - el.clientHeight * ANCHOR_POSITION; // 0~최댓값 범위는 브라우저가 맞춘다
  }, [scrollRef, rangeKey, anchorMinute, contentKey]);
}

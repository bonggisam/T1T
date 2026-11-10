import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import type { School, TeacherPeriod } from '@shared/types';
import { useAuthStore } from '../store/authStore';
import { useComciganStore } from '../store/comciganStore';
import { timetableMonday } from '../utils/classPeriods';
import type { BaseChange, BaseOffDay } from '../utils/baseTimetable';
import {
  loadNeisWeekAt, peekNeisWeekAt, type NeisTimetableError, type NeisWeek,
} from '../utils/neisTimetable';
import { lessonsOfWeek, teacherKey, usesBaseTimetable } from '../utils/teachingAssignments';

/** 앞뒤 주를 빠르게 넘길 때 지나가는 주마다 나이스에 묻지 않게 조금 기다린다 */
const FETCH_DELAY_MS = 250;

export type WeekLessonsStatus =
  /** 수업 표시를 껐다 */
  | 'off'
  /** 학교가 정해지지 않은 계정이다 */
  | 'noschool'
  /** 담당 학급 표에도 기초 시간표에도 이름이 없다 */
  | 'unlinked'
  | 'loading'
  | 'error'
  | 'ready';

export interface WeekLessonsView {
  status: WeekLessonsStatus;
  lessons: TeacherPeriod[];
  /** 기초 시간표와 다른 내 수업. 기초 시간표로 대조할 때만 있다 */
  changes: BaseChange[];
  /** 학교가 쉬는 요일. 기초 시간표로 대조할 때만 있다 */
  offDays: BaseOffDay[];
  basis?: 'base';
  /** 정각마다 받는 주라 내 시간표를 그대로 보여 준다. 수업 변경 알림과 수업 화면 보호도 이 값을 쓴다 */
  fromStore: boolean;
  /** 그 주 나이스에 학교 시간표가 없다. 방학이거나 학교가 아직 넣지 않았다 */
  noSchoolData: boolean;
  /** 받은 시각 */
  fetchedAt?: string;
  /** 받지 못한 까닭. 전에 받아 둔 같은 주를 보여 줄 때도 채운다 */
  error?: string;
}

const NONE: Omit<WeekLessonsView, 'status'> = { lessons: [], changes: [], offDays: [], fromStore: false, noSchoolData: false };

function schoolOf(school: unknown): School | null {
  return school === 'taeseong_middle' || school === 'taeseong_high' ? school : null;
}

/**
 * 아무 주의 내 수업. 정각마다 받는 주(이번 주, 주말에는 다음 주)는 내 시간표를 그대로 쓰고,
 * 다른 주는 그 주 나이스 시간표를 받아 같은 방법(기초 시간표 대조나 담당 학급 표)으로 만든다.
 * @param monday 그 주 월요일
 * @param enabled false면 받지 않는다
 * @param reload 늘리면 다른 주를 다시 받는다 (새로고침 단추)
 */
export function useWeekLessons(monday: Date, enabled = true, reload = 0): WeekLessonsView {
  const user = useAuthStore((s) => s.user);
  const timetableData = useComciganStore((s) => s.timetableData);
  const assignment = useComciganStore((s) => s.assignment);
  const assignmentChecked = useComciganStore((s) => s.assignmentChecked);
  const base = useComciganStore((s) => s.base);
  const schoolClassTimes = useComciganStore((s) => s.schoolClassTimes);
  const weekChanges = useComciganStore((s) => s.weekChanges);
  const weekOffDays = useComciganStore((s) => s.weekOffDays);
  const storeError = useComciganStore((s) => s.error);

  const school = schoolOf(user?.school);
  const name = teacherKey(user?.name || '');
  const weekKey = format(monday, 'yyyy-MM-dd');
  const fromStore = !!timetableData && isSameDay(monday, timetableMonday(timetableData));
  const linked = !!name && (
    usesBaseTimetable(assignment?.source, base?.lessons, name)
    || (assignment?.items.length ?? 0) > 0
    || (assignment?.slots?.length ?? 0) > 0
  );
  const lastClassTimes = timetableData?.classTimes;
  const classTimes = useMemo(
    () => (schoolClassTimes.length > 0 ? schoolClassTimes : lastClassTimes ?? []),
    [schoolClassTimes, lastClassTimes],
  );
  const fetchKey = enabled && !fromStore && school && assignmentChecked && linked ? `${school}|${weekKey}|${reload}` : null;

  const [result, setResult] = useState<{ key: string; week?: NeisWeek & { error?: NeisTimetableError }; error?: string } | null>(null);
  const forcedRef = useRef(reload);

  useEffect(() => {
    if (!fetchKey || !school) return;
    let alive = true;
    // 새로고침을 누른 때만 저장본을 건너뛴다. 그 뒤에 다른 주로 넘기면 저장본을 쓴다
    const force = reload !== forcedRef.current;
    forcedRef.current = reload;
    const [y, m, d] = weekKey.split('-').map(Number);
    const timer = setTimeout(() => {
      loadNeisWeekAt(school, new Date(y, m - 1, d), force)
        .then((week) => { if (alive) setResult({ key: fetchKey, week }); })
        .catch((err) => {
          if (alive) setResult({ key: fetchKey, error: err?.message || '나이스에서 시간표를 받지 못했습니다' });
        });
    }, FETCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // fetchKey에 학교, 주, 새로고침이 모두 들어 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // 받아 둔 같은 주가 있으면 받는 동안에도 그것을 보여 준다. 앞뒤 주를 오갈 때 수업이 깜빡이지 않는다
  const peeked = useMemo(() => {
    if (!fetchKey || !school) return null;
    const [y, m, d] = weekKey.split('-').map(Number);
    return peekNeisWeekAt(school, new Date(y, m - 1, d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);
  const current = fetchKey && result?.key === fetchKey ? result : null;
  const shown: (NeisWeek & { error?: NeisTimetableError }) | null = current ? current.week ?? null : peeked;

  const computed = useMemo(
    () => (shown ? lessonsOfWeek(name, shown.cells, classTimes, assignment, base?.lessons) : null),
    [shown, name, classTimes, assignment, base],
  );

  if (!enabled) return { status: 'off', ...NONE };
  if (fromStore && timetableData) {
    const fromBase = timetableData.basis === 'base';
    return {
      status: 'ready',
      lessons: timetableData.teacherSchedule,
      changes: fromBase ? weekChanges : [],
      offDays: fromBase ? weekOffDays : [],
      basis: timetableData.basis,
      fromStore: true,
      noSchoolData: false,
      fetchedAt: timetableData.lastUpdated,
      error: storeError ?? undefined,
    };
  }
  if (!school) return { status: 'noschool', ...NONE };
  if (!assignmentChecked) return { status: 'loading', ...NONE };
  if (!linked) return { status: 'unlinked', ...NONE };
  if (!shown) return current?.error ? { status: 'error', ...NONE, error: current.error } : { status: 'loading', ...NONE };
  return {
    status: 'ready',
    lessons: computed?.lessons ?? [],
    changes: computed?.changes ?? [],
    offDays: computed?.offDays ?? [],
    basis: computed?.basis,
    fromStore: false,
    noSchoolData: shown.cells.length === 0,
    fetchedAt: shown.fetchedAt,
    error: shown.error?.message,
  };
}

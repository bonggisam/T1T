import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { School } from '@shared/types';
import { useComciganLinksStore } from '../store/comciganLinksStore';
import {
  loadNeisWeekAt, peekNeisWeekAt, type NeisTimetableError, type NeisWeek,
} from '../utils/neisTimetable';
import { lessonsOfWeek, teacherKey, usesBaseTimetable } from '../utils/teachingAssignments';
import type { WeekLessonsView } from './useWeekLessons';

/** 앞뒤 주나 선생님을 빠르게 넘길 때 지나가는 것마다 나이스에 묻지 않게 조금 기다린다 */
const FETCH_DELAY_MS = 250;

const NONE: Omit<WeekLessonsView, 'status'> = { lessons: [], changes: [], offDays: [], fromStore: false, noSchoolData: false };

/**
 * 다른 선생님의 한 주 수업. 학교의 담당 학급 표와 기초 시간표(승인된 교사 모두가 읽는다)를
 * 그 주 나이스 시간표와 맞춘다. 내 시간표(useWeekLessons)와 같은 방법이다.
 * 같은 학교, 같은 주의 나이스 시간표는 한 번만 받으므로 선생님을 바꿔도 다시 받지 않는다.
 * @param school 볼 학교
 * @param teacher 담당 학급 표의 이름
 * @param monday 그 주 월요일
 * @param enabled false면 받지 않는다
 * @param reload 늘리면 다시 받는다 (새로고침 단추)
 */
export function useTeacherWeek(school: School | null, teacher: string, monday: Date, enabled = true, reload = 0): WeekLessonsView {
  const rows = useComciganLinksStore((s) => (school ? s.assignments[school] : undefined));
  const base = useComciganLinksStore((s) => (school ? s.bases[school] : undefined));
  const classTimes = useComciganLinksStore((s) => (school ? s.classTimes[school] : undefined));
  const linksLoaded = useComciganLinksStore((s) => s.linksLoaded);

  const name = teacherKey(teacher);
  const assignment = useMemo(() => rows?.find((row) => teacherKey(row.name) === name) ?? null, [rows, name]);
  const linked = !!name && (
    usesBaseTimetable(assignment?.source, base?.lessons, name)
    || (assignment?.items.length ?? 0) > 0
    || (assignment?.slots?.length ?? 0) > 0
  );
  const weekKey = format(monday, 'yyyy-MM-dd');
  const fetchKey = enabled && school && linked ? `${school}|${weekKey}|${reload}` : null;

  const [result, setResult] = useState<{ key: string; week?: NeisWeek & { error?: NeisTimetableError }; error?: string } | null>(null);
  const forcedRef = useRef(reload);

  useEffect(() => {
    if (!fetchKey || !school) return;
    let alive = true;
    // 새로고침을 누른 때만 저장본을 건너뛴다
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

  const peeked = useMemo(() => {
    if (!fetchKey || !school) return null;
    const [y, m, d] = weekKey.split('-').map(Number);
    return peekNeisWeekAt(school, new Date(y, m - 1, d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);
  const current = fetchKey && result?.key === fetchKey ? result : null;
  const shown: (NeisWeek & { error?: NeisTimetableError }) | null = current ? current.week ?? null : peeked;

  const computed = useMemo(
    () => (shown ? lessonsOfWeek(name, shown.cells, classTimes ?? [], assignment, base?.lessons) : null),
    [shown, name, classTimes, assignment, base],
  );

  if (!enabled) return { status: 'off', ...NONE };
  if (!school) return { status: 'noschool', ...NONE };
  if (!linksLoaded) return { status: 'loading', ...NONE };
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

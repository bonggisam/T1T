/**
 * 학교 기초 시간표(관리자가 올린 컴시간 파일)를 그 주 나이스 시간표와 칸마다 대조해 바뀐 수업만 덧씌운다.
 * 기초 시간표는 그대로 두고, 대조 결과는 그 주에만 쓴다.
 *
 * 나이스에는 교사 이름이 없다. 기초 시간표로 그 반 그 과목을 누가 가르치는지 알고, 나이스로 이번 주 그 칸의 과목을 안다.
 * - 같은 칸에 같은 과목: 그대로 둔다.
 * - 같은 칸에 다른 과목이나 활동(교체, 동아리, 행사): 그 수업은 빠진다. 새 과목은 그 반에서 그 과목을 가르치는 선생님에게 넣는다.
 *   여럿이 나눠 가르치는 과목이면 같은 주 같은 반에서 맞바뀐 칸을 찾아 그 칸의 선생님에게 넣는다.
 * - [보강]과목: 원래 선생님 대신 다른 선생님이 들어간 칸이다. 원래 선생님 수업에서 빼고, 들어간 선생님은 나이스에 없어 모른다.
 * - 빈 칸: 평소와 같은 날이면 기초 시간표대로 둔다. 이동수업처럼 나이스에 칸이 없는 수업이 있다.
 *   학교가 일찍 끝나는 날의 뒤 교시나 시험, 행사처럼 평소와 다른 날의 빈 칸은 뺀다.
 * - 쉬는 날: 그 요일에 나이스 자료가 없거나, 거의 모든 칸이 한 이름(추석, 한글날, 재량휴업일)이다.
 * - 과목 이름을 못 맞춘 수업(스포츠클럽처럼 나이스가 다른 이름으로 적는 수업): 요일과 교시대로 둔다.
 *   컴시간은 학년을 섞은 모둠에 모둠 번호를 반 번호처럼 쓴다(1학년이 두 반인데 "103"). 나이스에 없는 반이면
 *   같은 시각 같은 학년의 다른 모둠 수업을 따른다.
 */
import type { BaseTimetableLesson } from '@shared/types';
import type { NeisCell } from './neisTimetable';

/** 나이스는 보강을 "[보강]국어"처럼 원래 과목 앞에 붙여 적는다 */
const COVER = /^\[\s*보강\s*\]\s*/;
/** 그날 학교 칸의 이만큼이 한 이름이면 쉬는 날이다 */
const DAY_OFF_SHARE = 0.8;
/** 그날 그 반에서 나이스와 견줄 수 있는 기초 칸 중 이만큼 같아야 평소와 같은 날로 본다 */
const USUAL_DAY_SHARE = 0.5;

export type BaseChangeReason =
  /** 나이스에서 내 과목이 이 칸으로 들어왔다 */
  | 'moved'
  /** 이 칸이 다른 과목이나 활동으로 바뀌었다 */
  | 'replaced'
  /** 다른 선생님이 보강으로 들어갔다 */
  | 'covered'
  /** 그날 수업이 이 교시 전에 끝난다 */
  | 'short'
  /** 그날 그 반의 나이스 시간표가 없다 */
  | 'no_class'
  /** 시험이나 행사처럼 평소와 다른 날이라 빈 칸을 기초 시간표로 채우지 않았다 */
  | 'unusual';

export interface LessonRef {
  grade: number;
  classNum: number;
  subject: string;
}

export interface AppliedLesson extends LessonRef {
  name: string;
  weekday: number;
  period: number;
  /** 기초 시간표에 없던 칸. 나이스에서 바뀌어 들어왔다 */
  moved?: boolean;
  /** 나이스에 칸이 없어 기초 시간표대로 두었다 */
  kept?: boolean;
}

export interface BaseChange {
  name: string;
  weekday: number;
  period: number;
  before: LessonRef | null;
  after: LessonRef | null;
  reason: BaseChangeReason;
  /** 빠진 칸에 나이스가 적은 과목이나 활동 */
  label?: string;
}

export interface BaseOffDay {
  weekday: number;
  /** 나이스가 그날 칸마다 적은 이름. 자료가 없으면 비어 있다 */
  label?: string;
}

export interface BaseWeekStats {
  /** 쉬는 날을 뺀 기초 시간표 수업 칸 */
  total: number;
  /** 나이스와 같은 칸 */
  same: number;
  /** 나이스에 칸이 없어 기초 시간표대로 둔 칸 */
  kept: number;
  /** 바뀌거나 단축되어 빠진 칸 */
  dropped: number;
  /** 다른 칸에서 바뀌어 들어간 수업 */
  moved: number;
  /** 과목 이름을 맞추지 못해 요일과 교시대로 둔 수업 */
  fixed: number;
  /** 여럿이 나눠 가르치는 과목이 옮겨 왔는데 누구 수업인지 정하지 못한 나이스 칸 */
  ambiguous: number;
  offDays: BaseOffDay[];
}

export interface AppliedBaseWeek {
  lessons: AppliedLesson[];
  changes: BaseChange[];
  stats: BaseWeekStats;
}

const norm = (subject: string) => subject.replace(/[\s·ㆍ・]/g, '');
const nameKey = (name: string) => name.trim();
const classKey = (grade: number, classNum: number) => `${grade}-${classNum}`;
const cellKey = (grade: number, classNum: number, weekday: number, period: number) => `${grade}-${classNum}|${weekday}-${period}`;
const refOf = (l: LessonRef): LessonRef => ({ grade: l.grade, classNum: l.classNum, subject: l.subject });
const byTime = (a: { weekday: number; period: number; grade: number; classNum: number }, b: typeof a) => (
  a.weekday - b.weekday || a.period - b.period || a.grade - b.grade || a.classNum - b.classNum
);

/** 기초 시간표에 이 선생님의 수업이 있는가 */
export function baseHasTeacher(base: BaseTimetableLesson[] | null | undefined, name: string): boolean {
  const key = nameKey(name);
  return !!key && !!base?.some((l) => nameKey(l.name) === key);
}

/**
 * 그 주 학교 전체를 대조한다. only를 주면 그 선생님의 수업과 변경만 돌려준다. 통계는 언제나 학교 전체다.
 * @param cells 그 주 나이스 칸. 자료가 없는 주(방학)는 빈 배열이고, 그러면 수업이 없다
 */
export function applyBaseWeek(base: BaseTimetableLesson[], cells: NeisCell[], only?: string): AppliedBaseWeek {
  const neisAt = new Map<string, string[]>();
  const classLast = new Map<string, number>();
  const gradeLast = new Map<string, number>();
  const schoolLast = new Map<number, number>();
  const neisClasses = new Set<string>();
  const dayLabels = new Map<number, Map<string, { label: string; count: number }>>();
  const dayCells = new Map<number, number>();
  for (const cell of cells) {
    const at = cellKey(cell.grade, cell.classNum, cell.weekday, cell.period);
    const here = neisAt.get(at);
    if (!here) neisAt.set(at, [cell.subject]);
    else if (!here.includes(cell.subject)) here.push(cell.subject);
    const classDay = `${classKey(cell.grade, cell.classNum)}|${cell.weekday}`;
    classLast.set(classDay, Math.max(classLast.get(classDay) ?? 0, cell.period));
    const gradeDay = `${cell.grade}|${cell.weekday}`;
    gradeLast.set(gradeDay, Math.max(gradeLast.get(gradeDay) ?? 0, cell.period));
    schoolLast.set(cell.weekday, Math.max(schoolLast.get(cell.weekday) ?? 0, cell.period));
    neisClasses.add(classKey(cell.grade, cell.classNum));
    const labels = dayLabels.get(cell.weekday) ?? new Map<string, { label: string; count: number }>();
    const tally = labels.get(norm(cell.subject)) ?? { label: cell.subject, count: 0 };
    tally.count += 1;
    labels.set(norm(cell.subject), tally);
    dayLabels.set(cell.weekday, labels);
    dayCells.set(cell.weekday, (dayCells.get(cell.weekday) ?? 0) + 1);
  }

  const baseAt = new Map<string, BaseTimetableLesson[]>();
  const byClass = new Map<string, BaseTimetableLesson[]>();
  const owners = new Map<string, Set<string>>();
  for (const lesson of base) {
    const at = cellKey(lesson.grade, lesson.classNum, lesson.weekday, lesson.period);
    baseAt.set(at, [...(baseAt.get(at) ?? []), lesson]);
    const cls = classKey(lesson.grade, lesson.classNum);
    byClass.set(cls, [...(byClass.get(cls) ?? []), lesson]);
    if (lesson.fixed) continue;
    const pair = `${cls}|${norm(lesson.subject)}`;
    owners.set(pair, (owners.get(pair) ?? new Set<string>()).add(nameKey(lesson.name)));
  }
  const taught = new Set([...owners.keys()].map((pair) => pair.slice(pair.indexOf('|') + 1)));
  const ownersOf = (grade: number, classNum: number, subject: string) => (
    owners.get(`${classKey(grade, classNum)}|${norm(subject.replace(COVER, ''))}`)
  );
  // 모둠 반: 이번 주 나이스에 없고 그 반 수업이 모두 이름을 못 맞춘 수업이다
  const isGroupClass = (grade: number, classNum: number) => {
    const cls = classKey(grade, classNum);
    return !neisClasses.has(cls) && (byClass.get(cls) ?? []).every((l) => l.fixed);
  };

  // 쉬는 날: 자료가 없거나, 가르치는 과목이 아닌 한 이름이 거의 모든 칸을 차지한다
  const offDays: BaseOffDay[] = [];
  for (let weekday = 1; weekday <= 5; weekday++) {
    const total = dayCells.get(weekday) ?? 0;
    if (total === 0) {
      offDays.push({ weekday });
      continue;
    }
    const top = [...(dayLabels.get(weekday)?.values() ?? [])].sort((a, b) => b.count - a.count)[0];
    if (top && top.count / total >= DAY_OFF_SHARE && !taught.has(norm(top.label.replace(COVER, '')))) {
      offDays.push({ weekday, label: top.label });
    }
  }
  const offSet = new Set(offDays.map((d) => d.weekday));

  // 평소와 같은 날인가: 그날 그 반에서 나이스와 견줄 수 있는 기초 칸 중 같은 칸의 비율
  const usual = new Map<string, { compared: number; same: number }>();
  for (const lesson of base) {
    if (lesson.fixed) continue;
    const here = neisAt.get(cellKey(lesson.grade, lesson.classNum, lesson.weekday, lesson.period));
    if (!here) continue;
    const classDay = `${classKey(lesson.grade, lesson.classNum)}|${lesson.weekday}`;
    const tally = usual.get(classDay) ?? { compared: 0, same: 0 };
    tally.compared += 1;
    if (here.some((s) => norm(s) === norm(lesson.subject))) tally.same += 1;
    usual.set(classDay, tally);
  }
  const isUsual = (classDay: string) => {
    const tally = usual.get(classDay);
    return !!tally && tally.same / tally.compared >= USUAL_DAY_SHARE;
  };

  const kept: AppliedLesson[] = [];
  const dropped: Array<{ lesson: BaseTimetableLesson; reason: BaseChangeReason; label?: string }> = [];
  /** 나이스에 있는 반의 이름 못 맞춘 수업이 빠진 까닭. 남았으면 null */
  const fixedResult = new Map<BaseTimetableLesson, { reason: BaseChangeReason; label?: string } | null>();
  const grouped: BaseTimetableLesson[] = [];
  let total = 0;
  let same = 0;
  let keptGaps = 0;
  let keptFixed = 0;
  const appliedOf = (lesson: BaseTimetableLesson): AppliedLesson => ({
    name: nameKey(lesson.name), weekday: lesson.weekday, period: lesson.period, grade: lesson.grade, classNum: lesson.classNum, subject: lesson.subject,
  });
  for (const lesson of base) {
    if (offSet.has(lesson.weekday)) continue;
    total += 1;
    const name = nameKey(lesson.name);
    const applied = appliedOf(lesson);
    const here = neisAt.get(cellKey(lesson.grade, lesson.classNum, lesson.weekday, lesson.period)) ?? [];
    const classDay = `${classKey(lesson.grade, lesson.classNum)}|${lesson.weekday}`;
    const last = classLast.get(classDay);
    const drop = (reason: BaseChangeReason, label?: string) => dropped.push({ lesson, reason, label });

    if (lesson.fixed) {
      if (isGroupClass(lesson.grade, lesson.classNum)) {
        grouped.push(lesson);
        continue;
      }
      // 과목 이름을 맞추지 못한 수업. 그 반 다른 선생님의 과목이 그 칸에 오면 바뀐 것으로 본다
      const other = here.find((s) => {
        const who = ownersOf(lesson.grade, lesson.classNum, s);
        return !!who && !who.has(name);
      });
      const result = last === undefined ? { reason: 'no_class' as const }
        : lesson.period > (schoolLast.get(lesson.weekday) ?? 0) ? { reason: 'short' as const }
          : other ? { reason: 'replaced' as const, label: other } : null;
      fixedResult.set(lesson, result);
      if (result) drop(result.reason, result.label);
      else {
        keptFixed += 1;
        kept.push(here.length === 0 ? { ...applied, kept: true } : applied);
      }
      continue;
    }
    if (here.some((s) => norm(s) === norm(lesson.subject))) {
      same += 1;
      kept.push(applied);
      continue;
    }
    if (here.length > 0) {
      const cover = here.find((s) => COVER.test(s) && norm(s.replace(COVER, '')) === norm(lesson.subject));
      drop(cover ? 'covered' : 'replaced', cover ?? here[0]);
      continue;
    }
    if (last === undefined) drop('no_class');
    else if (lesson.period > (schoolLast.get(lesson.weekday) ?? 0)) drop('short');
    else if (isUsual(classDay)) {
      keptGaps += 1;
      kept.push({ ...applied, kept: true });
    } else drop(lesson.period > last ? 'short' : 'unusual');
  }

  // 모둠 수업: 그날 그 학년 나이스를 보고, 같은 시각 같은 학년의 다른 모둠 수업이 모두 빠졌으면 함께 뺀다
  for (const lesson of grouped) {
    const lastOfGrade = gradeLast.get(`${lesson.grade}|${lesson.weekday}`);
    const siblings = base
      .filter((l) => l.grade === lesson.grade && l.weekday === lesson.weekday && l.period === lesson.period && fixedResult.has(l))
      .map((l) => fixedResult.get(l) ?? null);
    const allGone = siblings.length > 0 && siblings.every((s) => s !== null);
    const result = lastOfGrade === undefined ? { reason: 'no_class' as const }
      : lesson.period > lastOfGrade ? { reason: 'short' as const }
        : allGone ? siblings[0] : null;
    if (result) dropped.push({ lesson, reason: result.reason, label: result.label });
    else {
      keptFixed += 1;
      kept.push({ ...appliedOf(lesson), kept: true });
    }
  }

  // 바뀌어 들어온 수업: 기초 시간표와 다른 나이스 칸을 그 반에서 그 과목을 가르치는 선생님에게 넣는다
  const moved: AppliedLesson[] = [];
  let movedCells = 0;
  let ambiguous = 0;
  for (const cell of cells) {
    if (offSet.has(cell.weekday)) continue;
    const baseHere = baseAt.get(cellKey(cell.grade, cell.classNum, cell.weekday, cell.period)) ?? [];
    if (baseHere.some((l) => !l.fixed && norm(l.subject) === norm(cell.subject))) continue;
    const subject = cell.subject.replace(COVER, '').trim();
    // 원래 선생님 칸에 들어간 보강이다. 들어간 선생님은 나이스에 없다
    if (subject !== cell.subject.trim() && baseHere.some((l) => norm(l.subject) === norm(subject))) continue;
    const who = ownersOf(cell.grade, cell.classNum, subject);
    if (!who || who.size === 0) continue;
    let names = who.size === 1 ? [...who] : [];
    if (who.size > 1) {
      // 나눠 가르치는 과목: 이번 주 같은 반에서 그 과목이 빠지고 이 칸의 기초 과목이 들어간 칸을 찾는다
      const swappedWith = baseHere.filter((l) => !l.fixed).map((l) => norm(l.subject));
      const from = (byClass.get(classKey(cell.grade, cell.classNum)) ?? []).filter((y) => {
        if (y.fixed || offSet.has(y.weekday) || norm(y.subject) !== norm(subject) || !who.has(nameKey(y.name))) return false;
        const there = neisAt.get(cellKey(y.grade, y.classNum, y.weekday, y.period)) ?? [];
        return !there.some((s) => norm(s) === norm(subject)) && there.some((s) => swappedWith.includes(norm(s)));
      });
      const fromNames = new Set(from.map((y) => nameKey(y.name)));
      if (fromNames.size === 1) names = [...fromNames];
    }
    if (names.length === 0) {
      ambiguous += 1;
      continue;
    }
    movedCells += 1;
    for (const name of names) {
      moved.push({
        name, weekday: cell.weekday, period: cell.period, grade: cell.grade, classNum: cell.classNum, subject: cell.subject, moved: true,
      });
    }
  }

  // 사람마다 칸별 변경. 같은 칸에서 빠지고 들어온 수업은 한 줄로 잇는다
  const movedAt = new Map<string, AppliedLesson[]>();
  for (const lesson of moved) {
    const key = `${lesson.name}|${lesson.weekday}-${lesson.period}`;
    movedAt.set(key, [...(movedAt.get(key) ?? []), lesson]);
  }
  const paired = new Set<AppliedLesson>();
  const changes: BaseChange[] = [];
  for (const { lesson, reason, label } of dropped) {
    const name = nameKey(lesson.name);
    const after = (movedAt.get(`${name}|${lesson.weekday}-${lesson.period}`) ?? []).find((l) => !paired.has(l));
    if (after) paired.add(after);
    changes.push({
      name, weekday: lesson.weekday, period: lesson.period, before: refOf(lesson), after: after ? refOf(after) : null, reason, label,
    });
  }
  for (const lesson of moved) {
    if (paired.has(lesson)) continue;
    changes.push({ name: lesson.name, weekday: lesson.weekday, period: lesson.period, before: null, after: refOf(lesson), reason: 'moved' });
  }

  const who = only === undefined ? null : nameKey(only);
  const lessons = [...kept, ...moved].filter((l) => who === null || l.name === who).sort(byTime);
  return {
    lessons,
    changes: changes
      .filter((c) => who === null || c.name === who)
      .sort((a, b) => a.weekday - b.weekday || a.period - b.period || a.name.localeCompare(b.name, 'ko')),
    stats: { total, same, kept: keptGaps, dropped: dropped.length, moved: movedCells, fixed: keptFixed, ambiguous, offDays },
  };
}

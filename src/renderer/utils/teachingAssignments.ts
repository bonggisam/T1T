/**
 * 담당 학급 표. 나이스 시간표에는 교사 이름이 없어서, 이름과 학교로 찾는 이 표로 칸을 찾는다.
 *
 * 표는 세 곳에서 채워진다.
 * - 전에 컴시간에서 받은 내 시간표 (이 PC에 남아 있으면 앱이 자동으로 올린다. 교사별 시간의 유일한 근거다)
 * - 관리자가 붙여 넣은 표
 * - 본인이 직접 넣은 값
 */
import type {
  BaseTimetableLesson, ComciganSchoolGrid, ComciganTeacherSlots, TeacherPeriod, TeachingItem, TeachingSlot, TeachingSource,
} from '@shared/types';
import type { NeisCell } from './neisTimetable';
import { applyBaseWeek, baseHasTeacher, type AppliedLesson } from './baseTimetable';

const WEEKDAY_NAMES = ['월', '화', '수', '목', '금'];
const koCompare = (a: string, b: string) => a.localeCompare(b, 'ko');

function normalizeSubject(subject: string): string {
  return subject.replace(/[\s·ㆍ・]/g, '');
}

function sameSubject(a: string, b: string): boolean {
  return normalizeSubject(a) === normalizeSubject(b);
}

function itemKey(item: TeachingItem): string {
  return `${item.grade}-${item.classNum}|${normalizeSubject(item.subject)}`;
}

/** 표에서 사람을 찾는 이름. 앞뒤 공백만 뺀다 */
export function teacherKey(name: string): string {
  return name.trim();
}

/** a의 글자가 b에 순서대로 모두 들어 있는가 */
function inOrder(a: string, b: string): boolean {
  if (!a || !b) return false;
  let at = 0;
  for (const ch of b) {
    if (ch === a[at]) at += 1;
    if (at === a.length) return true;
  }
  return false;
}

/** Ⅰ, Ⅱ와 I, II를 숫자로 맞춘다. 컴시간은 영II, 화2, 미1로 쓰고 나이스는 영어Ⅱ, 화학Ⅱ, 미적분Ⅰ로 쓴다 */
function plainNumerals(subject: string): string {
  return subject
    .replace(/Ⅳ/g, '4').replace(/Ⅲ/g, '3').replace(/Ⅱ/g, '2').replace(/Ⅰ/g, '1')
    .replace(/(?<![A-Za-z])I{1,3}(?![A-Za-z])/g, (m) => String(m.length));
}

/**
 * 줄인 과목 이름인지 본다. 공통수학을 공수로, 미적분Ⅰ을 미적Ⅰ으로 쓰는 경우처럼
 * 글자 순서만 맞으면 같은 과목으로 친다. 영II와 영어Ⅱ처럼 로마 숫자를 다르게 쓴 것도 같게 본다.
 */
export function subjectMatches(short: string, full: string): boolean {
  const a = normalizeSubject(short);
  const b = normalizeSubject(full);
  return inOrder(a, b) || inOrder(plainNumerals(a), plainNumerals(b));
}

function dedupeItems(items: TeachingItem[]): TeachingItem[] {
  const seen = new Map<string, TeachingItem>();
  for (const item of items) {
    const key = itemKey(item);
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) => (
    koCompare(a.subject, b.subject) || a.grade - b.grade || a.classNum - b.classNum
  ));
}

function dedupeSlots(slots: TeachingSlot[]): TeachingSlot[] {
  const seen = new Map<string, TeachingSlot>();
  for (const slot of slots) seen.set(`${slot.weekday}-${slot.period}|${itemKey(slot)}`, slot);
  return [...seen.values()].sort((a, b) => a.weekday - b.weekday || a.period - b.period);
}

function slotKey(at: { weekday: number; period: number }): string {
  return `${at.weekday}-${at.period}`;
}

/** 나이스에 다섯 요일이 다 있는 주. 휴일이 끼면 그 요일의 칸이 보이지 않는다 */
function isFullWeek(cells: NeisCell[]): boolean {
  return new Set(cells.map((c) => c.weekday)).size >= 5;
}

function startTimeOf(classTimes: string[], period: number): string | undefined {
  const entry = classTimes[period - 1];
  return entry?.match(/(\d{2}:\d{2})/)?.[1];
}

/**
 * 담당 학급에 맞는 칸과 고정 수업 칸을 내 수업으로 바꾼다.
 * 고정 수업 칸은 그 요일에 학교 시간표가 있을 때만 넣는다. 휴일과 방학에는 수업이 없다.
 */
export function buildTeacherSchedule(
  cells: NeisCell[],
  items: TeachingItem[],
  classTimes: string[],
  slots: TeachingSlot[] = [],
): TeacherPeriod[] {
  const wanted = new Set(items.map(itemKey));
  const schoolDays = new Set(cells.map((c) => c.weekday));
  const matched = cells.filter((cell) => wanted.has(itemKey(cell)));
  const taken = new Set(matched.map((c) => `${c.weekday}-${c.period}`));
  const fixed = slots.filter((s) => schoolDays.has(s.weekday) && !taken.has(`${s.weekday}-${s.period}`));
  return [...matched, ...fixed]
    .sort((a, b) => a.weekday - b.weekday || a.period - b.period || a.grade - b.grade || a.classNum - b.classNum)
    .map((cell) => ({
      grade: cell.grade,
      classNum: cell.classNum,
      weekday: cell.weekday,
      weekdayStr: WEEKDAY_NAMES[cell.weekday - 1] ?? '',
      period: cell.period,
      subject: cell.subject,
      startTime: startTimeOf(classTimes, cell.period),
    }));
}

/**
 * 전에 받은 내 시간표를 표에 올릴 모양으로 나눈다. 이번 주 나이스 칸으로 다시 만들면 받은 시간표와 같아진다.
 * - 담당 학급: 그 학급 그 과목의 나이스 칸이 모두 내 수업이다. 혼자 가르치므로 나이스가 바뀌면 따라간다.
 * - 고정 수업 칸: 나머지는 요일과 교시를 그대로 둔다. 과목을 나눠 가르치거나, 나이스에 칸이 없거나, 이름을 맞출 수 없는 수업이다.
 * 휴일이 낀 주에는 혼자 가르치는지 알 수 없어 모두 고정 수업 칸으로 둔다.
 */
export function deriveItemsFromSchedule(
  schedule: TeacherPeriod[],
  cells: NeisCell[],
): { items: TeachingItem[]; slots: TeachingSlot[]; matched: number; total: number } {
  const toSlot = (period: TeacherPeriod, subject: string): TeachingSlot => ({
    subject,
    grade: period.grade,
    classNum: period.classNum,
    weekday: period.weekday,
    period: period.period,
  });
  const slots: TeachingSlot[] = [];
  const groups = new Map<string, { cell: NeisCell; periods: TeacherPeriod[] }>();
  let matched = 0;
  for (const period of schedule) {
    const here = cells.filter((c) => c.grade === period.grade && c.classNum === period.classNum);
    const cell = here.find((c) => slotKey(c) === slotKey(period) && subjectMatches(period.subject, c.subject));
    if (cell) {
      matched += 1;
      const group = groups.get(itemKey(cell)) ?? { cell, periods: [] };
      group.periods.push(period);
      groups.set(itemKey(cell), group);
    } else {
      const named = here.find((c) => subjectMatches(period.subject, c.subject));
      slots.push(toSlot(period, named?.subject ?? period.subject));
    }
  }
  const items: TeachingItem[] = [];
  for (const [key, { cell, periods }] of groups) {
    const mine = new Set(periods.map(slotKey));
    const alone = isFullWeek(cells) && cells.every((c) => itemKey(c) !== key || mine.has(slotKey(c)));
    if (alone) items.push({ subject: cell.subject, grade: cell.grade, classNum: cell.classNum });
    else slots.push(...periods.map((period) => toSlot(period, cell.subject)));
  }
  return { items: dedupeItems(items), slots: dedupeSlots(slots), matched, total: schedule.length };
}

/** 컴시간 기초 시간표의 수업 한 칸. timetableFile.ts의 FileLesson과 같은 모양이다 */
export interface BaseLesson {
  name: string;
  weekday: number;
  period: number;
  grade: number;
  classNum: number;
  subject: string;
}

export interface BaseAssignments {
  rows: AssignmentRow[];
  /** 학교 기초 시간표. 과목은 나이스 이름이다. 매일 나이스와 칸마다 대조한다 */
  lessons: BaseTimetableLesson[];
  /**
   * 나이스에서 이름을 찾지 못한 과목. 요일과 교시를 그대로 둔다.
   * inNeis는 이번 주 학교 나이스 어딘가에 비슷한 이름이 있다는 뜻이다. 없으면 스포츠클럽(나이스는 동아리활동)처럼
   * 나이스가 늘 다른 이름으로 적는 수업이라 어느 주에 올려도 맞추지 못한다
   */
  unresolved: Array<TeachingItem & { name: string; inNeis: boolean }>;
  /** 여럿이 나눠 가르쳐 요일과 교시로 둔 학급-과목 수 */
  shared: number;
  /** 기초 시간표의 칸 중 이번 주 나이스에도 같은 칸에 같은 과목이 있는 칸 */
  sameCells: number;
  /** 나이스와 견줄 수 있는 칸. 나이스에 비슷한 이름이 없는 과목의 칸은 뺀다 */
  comparable: number;
  total: number;
}

/**
 * 학교 전체의 기초 시간표(컴시간 파일)를 담당 학급 표로 바꾼다.
 * 과목 줄임말은 그 수업 칸들에 나이스가 적은 과목 이름으로 바꾼다. 칸에서 찾지 못하면 그 학급에 맞는 이름이 하나뿐일 때만 쓴다.
 * 학급의 한 과목을 혼자 가르치면 담당 학급으로 둔다. 나이스를 따라가므로 수업 교체가 저절로 반영된다.
 * 여럿이 나눠 가르치거나 이름을 맞추지 못한 수업은 요일과 교시를 고정 수업 칸으로 둔다.
 * 같은 이름으로 바꾼 학교 기초 시간표(lessons)도 돌려준다. 이 표로 연결된 앱은 담당 학급 대신 이것을 나이스와 칸마다 대조한다.
 */
export function assignmentsFromLessons(lessons: BaseLesson[], cells: NeisCell[]): BaseAssignments {
  const at = (weekday: number, period: number, grade: number, classNum: number) => `${weekday}-${period}|${grade}-${classNum}`;
  const atSlot = new Map<string, string[]>();
  const inClass = new Map<string, Map<string, number>>();
  for (const cell of cells) {
    const slot = at(cell.weekday, cell.period, cell.grade, cell.classNum);
    atSlot.set(slot, [...(atSlot.get(slot) ?? []), cell.subject]);
    const cls = `${cell.grade}-${cell.classNum}`;
    const counts = inClass.get(cls) ?? new Map<string, number>();
    counts.set(cell.subject, (counts.get(cell.subject) ?? 0) + 1);
    inClass.set(cls, counts);
  }
  const subjectsAt = (l: BaseLesson) => atSlot.get(at(l.weekday, l.period, l.grade, l.classNum)) ?? [];

  const groups = new Map<string, { name: string; grade: number; classNum: number; subject: string; lessons: BaseLesson[] }>();
  for (const lesson of lessons) {
    const name = teacherKey(lesson.name);
    if (!name) continue;
    const key = `${name}|${lesson.grade}-${lesson.classNum}|${lesson.subject}`;
    const group = groups.get(key) ?? { name, grade: lesson.grade, classNum: lesson.classNum, subject: lesson.subject, lessons: [] };
    group.lessons.push(lesson);
    groups.set(key, group);
  }

  const neisName = new Map<string, string | null>();
  for (const [key, group] of groups) {
    const tally = new Map<string, number>();
    for (const lesson of group.lessons) {
      for (const subject of subjectsAt(lesson)) {
        if (subjectMatches(group.subject, subject)) tally.set(subject, (tally.get(subject) ?? 0) + 1);
      }
    }
    let found = [...tally.entries()].sort((a, b) => b[1] - a[1] || koCompare(a[0], b[0]))[0]?.[0] ?? null;
    if (!found) {
      // 이번 주에 그 칸이 바뀌었으면 학급의 과목 중에서 찾는다. 후보가 여럿이면 주당 칸 수가 같은 하나만 쓴다
      const options = [...(inClass.get(`${group.grade}-${group.classNum}`) ?? new Map<string, number>()).entries()]
        .filter(([subject]) => subjectMatches(group.subject, subject));
      const sameCount = options.filter(([, n]) => n === group.lessons.length);
      if (options.length === 1) found = options[0][0];
      else if (sameCount.length === 1) found = sameCount[0][0];
    }
    neisName.set(key, found);
  }

  const pairOf = (key: string) => {
    const group = groups.get(key)!;
    return `${group.grade}-${group.classNum}|${normalizeSubject(neisName.get(key) ?? group.subject)}`;
  };
  const owners = new Map<string, Set<string>>();
  for (const [key, group] of groups) {
    const pair = pairOf(key);
    owners.set(pair, (owners.get(pair) ?? new Set<string>()).add(group.name));
  }

  const byName = new Map<string, ParsedLine>();
  const unresolved: Array<TeachingItem & { name: string; inNeis: boolean }> = [];
  const sharedPairs = new Set<string>();
  const baseLessons: BaseTimetableLesson[] = [];
  const neisSubjects = [...new Set(cells.map((c) => c.subject))];
  let sameCells = 0;
  let comparable = 0;
  let total = 0;
  for (const [key, group] of groups) {
    const found = neisName.get(key) ?? null;
    const subject = found ?? group.subject;
    const pair = pairOf(key);
    const shared = (owners.get(pair)?.size ?? 0) > 1;
    if (shared) sharedPairs.add(pair);
    const row = byName.get(group.name) ?? { items: [], slots: [] };
    if (found && !shared) {
      row.items.push({ subject, grade: group.grade, classNum: group.classNum });
    } else {
      row.slots.push(...group.lessons.map((l) => ({ subject, grade: l.grade, classNum: l.classNum, weekday: l.weekday, period: l.period })));
    }
    byName.set(group.name, row);
    for (const l of group.lessons) {
      baseLessons.push({
        name: group.name, weekday: l.weekday, period: l.period, grade: l.grade, classNum: l.classNum, subject, ...(found ? {} : { fixed: true }),
      });
    }
    if (!found) {
      const inNeis = neisSubjects.some((s) => subjectMatches(group.subject, s));
      unresolved.push({ name: group.name, subject: group.subject, grade: group.grade, classNum: group.classNum, inNeis });
      if (inNeis) comparable += group.lessons.length;
    } else {
      sameCells += group.lessons.filter((l) => subjectsAt(l).some((s) => sameSubject(s, found))).length;
      comparable += group.lessons.length;
    }
    total += group.lessons.length;
  }
  const rows = [...byName.entries()]
    .map(([name, row]) => ({ name, items: dedupeItems(row.items), slots: dedupeSlots(row.slots) }))
    .sort((a, b) => koCompare(a.name, b.name));
  baseLessons.sort((a, b) => (
    koCompare(a.name, b.name) || a.weekday - b.weekday || a.period - b.period || a.grade - b.grade || a.classNum - b.classNum
  ));
  return { rows, lessons: baseLessons, unresolved, shared: sharedPairs.size, sameCells, comparable, total };
}

/** 대조한 수업을 화면에 쓰는 모양으로 바꾼다 */
export function toTeacherPeriods(lessons: AppliedLesson[], classTimes: string[]): TeacherPeriod[] {
  return [...lessons]
    .sort((a, b) => a.weekday - b.weekday || a.period - b.period || a.grade - b.grade || a.classNum - b.classNum)
    .map((lesson) => ({
      grade: lesson.grade,
      classNum: lesson.classNum,
      weekday: lesson.weekday,
      weekdayStr: WEEKDAY_NAMES[lesson.weekday - 1] ?? '',
      period: lesson.period,
      subject: lesson.subject,
      startTime: startTimeOf(classTimes, lesson.period),
      ...(lesson.moved ? { moved: true } : {}),
    }));
}

/**
 * 이 선생님을 학교 기초 시간표로 대조할까. 관리자가 컴시간 파일로 올린 표이고 기초 시간표에 이름이 있어야 한다.
 * 선생님이 직접 고쳤거나 관리자가 붙여 넣은 표로 바꿨으면 그 표를 따른다.
 */
export function usesBaseTimetable(
  source: TeachingSource | undefined,
  base: BaseTimetableLesson[] | null | undefined,
  name: string,
): boolean {
  return source === 'file' && baseHasTeacher(base, name);
}

/** 표로 만든 이번 주 수업이 전에 받은 시간표와 같은가. 휴일이 낀 주에는 빠진 요일을 알 수 없어 다르다고 한다 */
export function assignmentMatchesSchedule(
  schedule: TeacherPeriod[],
  cells: NeisCell[],
  items: TeachingItem[],
  slots: TeachingSlot[],
): boolean {
  if (!isFullWeek(cells)) return false;
  const lessonKey = (p: TeacherPeriod) => `${slotKey(p)}|${p.grade}-${p.classNum}`;
  const want = new Set(schedule.map(lessonKey));
  const got = new Set(buildTeacherSchedule(cells, items, [], slots).map(lessonKey));
  return want.size === got.size && [...want].every((key) => got.has(key));
}

/** 이번 학기에 받은 값인가. 지난 학기 시간표는 내 수업으로 쓰지 않는다. 1학기는 3월, 2학기는 8월에 시작한다 */
export function isThisSemester(at: string | undefined, now: Date = new Date()): boolean {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 8 ? new Date(year, 7, 1) : month >= 3 ? new Date(year, 2, 1) : new Date(year - 1, 7, 1);
  const time = at ? new Date(at).getTime() : NaN;
  return !Number.isNaN(time) && time >= start.getTime();
}

/** 쓴 과목 이름을 그 학급의 나이스 이름으로 바꾼다. 못 찾은 항목은 따로 돌려준다 */
export function resolveItems(
  items: TeachingItem[],
  cells: NeisCell[],
): { items: TeachingItem[]; unknown: TeachingItem[] } {
  const resolved: TeachingItem[] = [];
  const unknown: TeachingItem[] = [];
  for (const item of items) {
    const here = cells.filter((c) => c.grade === item.grade && c.classNum === item.classNum);
    const cell = here.find((c) => sameSubject(c.subject, item.subject))
      ?? here.find((c) => subjectMatches(item.subject, c.subject));
    if (cell) resolved.push({ ...item, subject: cell.subject });
    else {
      resolved.push(item);
      unknown.push(item);
    }
  }
  return { items: dedupeItems(resolved), unknown };
}

/** 2-1, 2학년 1반, 2-1~4 를 학급 목록으로 바꾼다 */
function parseClassTokens(text: string): Array<{ grade: number; classNum: number }> {
  const found: Array<{ grade: number; classNum: number }> = [];
  const pattern = /(\d)\s*(?:-|학년)\s*(\d{1,2})(?:\s*반)?(?:\s*[~∼-]\s*(\d{1,2}))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const grade = Number(match[1]);
    const from = Number(match[2]);
    const to = match[3] ? Number(match[3]) : from;
    if (grade < 1 || from < 1 || to < from || to > 40) continue;
    for (let classNum = from; classNum <= to; classNum++) found.push({ grade, classNum });
  }
  return found;
}

export interface ParsedLine {
  items: TeachingItem[];
  slots: TeachingSlot[];
}

/**
 * "국어 2-1 2-3" 한 줄을 항목으로 바꾼다. 형식이 맞지 않으면 둘 다 비어 있다.
 * 나이스에 없는 수업은 요일과 교시를 함께 적는다. "문학 3-1 월4 수3"
 */
export function parseSubjectLine(line: string): ParsedLine {
  const firstClass = line.search(/\d\s*(?:-|학년)\s*\d/);
  if (firstClass <= 0) return { items: [], slots: [] };
  const subject = line.slice(0, firstClass).replace(/[\s,;:|]+$/g, '').trim();
  if (!subject) return { items: [], slots: [] };
  const rest = line.slice(firstClass);
  const classes = parseClassTokens(rest);
  const fixed = [...rest.matchAll(/([월화수목금])\s*(\d{1,2})(?:\s*교시)?/g)]
    .map((m) => ({ weekday: WEEKDAY_NAMES.indexOf(m[1]) + 1, period: Number(m[2]) }))
    .filter((f) => f.period >= 1 && f.period <= 12);
  if (fixed.length > 0 && classes.length > 0) {
    return { items: [], slots: fixed.map((f) => ({ subject, ...classes[0], ...f })) };
  }
  return { items: classes.map((c) => ({ subject, ...c })), slots: [] };
}

/** 본인이 넣은 글. 줄마다 "국어 2-1 2-3" 또는 "문학 3-1 월4 수3" */
export function parseOwnItems(text: string): ParsedLine & { badLines: string[] } {
  const items: TeachingItem[] = [];
  const slots: TeachingSlot[] = [];
  const badLines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseSubjectLine(line);
    if (parsed.items.length === 0 && parsed.slots.length === 0) badLines.push(line);
    items.push(...parsed.items);
    slots.push(...parsed.slots);
  }
  return { items: dedupeItems(items), slots: dedupeSlots(slots), badLines };
}

export interface AssignmentRow extends ParsedLine {
  name: string;
}

/**
 * 관리자가 붙여 넣은 표. 엑셀이나 한글에서 복사하면 칸 사이가 탭이다.
 * 줄마다 "이름 과목 2-1 2-3". 한 사람의 과목이 여럿이면 줄을 나눠 쓴다.
 */
export function parseAssignmentText(text: string): { rows: AssignmentRow[]; badLines: string[] } {
  const byName = new Map<string, ParsedLine>();
  const badLines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^([^\s,;|]+)[\s,;|]+(.+)$/);
    const parsed = match ? parseSubjectLine(match[2]) : { items: [], slots: [] };
    if (!match || (parsed.items.length === 0 && parsed.slots.length === 0)) {
      badLines.push(line);
      continue;
    }
    const name = teacherKey(match[1]);
    const row = byName.get(name) ?? { items: [], slots: [] };
    byName.set(name, { items: [...row.items, ...parsed.items], slots: [...row.slots, ...parsed.slots] });
  }
  const rows = [...byName.entries()]
    .map(([name, row]) => ({ name, items: dedupeItems(row.items), slots: dedupeSlots(row.slots) }))
    .sort((a, b) => koCompare(a.name, b.name));
  return { rows, badLines };
}

function describeItems(items: TeachingItem[], slots: TeachingSlot[], between: string, lineBreak: string): string {
  const bySubject = new Map<string, string[]>();
  for (const item of dedupeItems(items)) {
    bySubject.set(item.subject, [...(bySubject.get(item.subject) ?? []), `${item.grade}-${item.classNum}`]);
  }
  const parts = [...bySubject.entries()].map(([subject, classes]) => `${subject} ${classes.join(between)}`);
  const fixed = new Map<string, string[]>();
  for (const slot of dedupeSlots(slots)) {
    const key = `${slot.subject} ${slot.grade}-${slot.classNum}`;
    fixed.set(key, [...(fixed.get(key) ?? []), `${WEEKDAY_NAMES[slot.weekday - 1] ?? ''}${slot.period}`]);
  }
  for (const [key, when] of fixed) parts.push(`${key} ${when.join(between)}`);
  return parts.join(lineBreak);
}

/** "국어 2-1, 2-3 · 독서 1-2 · 문학 3-1 월4, 수3" */
export function formatItems(items: TeachingItem[], slots: TeachingSlot[] = []): string {
  return describeItems(items, slots, ', ', ' · ');
}

/** 고치기 칸에 넣을 글. parseOwnItems가 그대로 다시 읽는다 */
export function formatOwnText(items: TeachingItem[], slots: TeachingSlot[] = []): string {
  return describeItems(items, slots, ' ', '\n');
}

/** 시각만 차례로 적은 글을 시정표로 바꾼다. "08:40 09:35 ..." */
export function parseClassTimesText(text: string): string[] {
  const times = text.match(/\d{1,2}:\d{2}/g) ?? [];
  return times.map((time, i) => `${i + 1}(${time.padStart(5, '0')})`);
}

export function formatClassTimes(classTimes: string[]): string {
  return classTimes
    .map((entry) => entry.match(/\d{1,2}:\d{2}/)?.[0])
    .filter(Boolean)
    .join(' ');
}

/**
 * 학교 시간표와 표를 합쳐 회의 찾기에 쓰는 사람별 수업 칸을 만든다.
 * 컴시간 파일로 올린 선생님은 학교 기초 시간표를 나이스와 대조한 수업을 쓴다. 내 시간표와 같은 방법이다.
 */
export function buildSchoolGrid(
  schoolCode: number,
  cells: NeisCell[],
  assignments: Array<AssignmentRow & { source?: TeachingSource }>,
  classTimes: string[],
  base?: BaseTimetableLesson[] | null,
): ComciganSchoolGrid {
  const teachers: Record<string, ComciganTeacherSlots> = {};
  const schoolDays = new Set(cells.map((c) => c.weekday));
  const applied = base && base.length > 0 ? applyBaseWeek(base, cells).lessons : [];
  for (const { name, items, slots, source } of assignments) {
    const wanted = new Set(items.map(itemKey));
    const fromBase = usesBaseTimetable(source, base, name);
    const mine: Array<TeachingItem & { weekday: number; period: number }> = fromBase
      ? applied.filter((lesson) => lesson.name === teacherKey(name))
      : [
        ...cells.filter((cell) => wanted.has(itemKey(cell))),
        ...(slots ?? []).filter((slot) => schoolDays.has(slot.weekday)),
      ];
    if (mine.length === 0) continue;
    teachers[name] = {
      slots: [...new Set(mine.map((c) => `${c.weekday}-${c.period}`))].sort(),
      subjects: [...new Set(mine.map((c) => c.subject))].sort(koCompare),
      grades: [...new Set(mine.map((c) => c.grade))].sort((a, b) => a - b),
    };
  }
  return { schoolCode, teachers, classTimes, fetchedAt: new Date().toISOString() };
}

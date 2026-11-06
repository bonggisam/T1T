/**
 * 담당 학급 표. 나이스 시간표에는 교사 이름이 없어서, 이름과 학교로 찾는 이 표로 칸을 찾는다.
 *
 * 표는 세 곳에서 채워진다.
 * - 전에 컴시간에서 받은 내 시간표 (이 PC에 남아 있으면 앱이 자동으로 올린다. 교사별 시간의 유일한 근거다)
 * - 관리자가 붙여 넣은 표
 * - 본인이 직접 넣은 값
 */
import type { ComciganSchoolGrid, ComciganTeacherSlots, TeacherPeriod, TeachingItem, TeachingSlot } from '@shared/types';
import type { NeisCell } from './neisTimetable';

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

/**
 * 줄인 과목 이름인지 본다. 공통수학을 공수로, 미적분Ⅰ을 미적Ⅰ으로 쓰는 경우처럼
 * 글자 순서만 맞으면 같은 과목으로 친다.
 */
export function subjectMatches(short: string, full: string): boolean {
  const a = normalizeSubject(short);
  const b = normalizeSubject(full);
  if (!a || !b) return false;
  let at = 0;
  for (const ch of b) {
    if (ch === a[at]) at += 1;
    if (at === a.length) return true;
  }
  return false;
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

/** 학교 시간표와 표를 합쳐 회의 찾기에 쓰는 사람별 수업 칸을 만든다 */
export function buildSchoolGrid(
  schoolCode: number,
  cells: NeisCell[],
  assignments: AssignmentRow[],
  classTimes: string[],
): ComciganSchoolGrid {
  const teachers: Record<string, ComciganTeacherSlots> = {};
  const schoolDays = new Set(cells.map((c) => c.weekday));
  for (const { name, items, slots } of assignments) {
    const wanted = new Set(items.map(itemKey));
    const mine: Array<TeachingItem & { weekday: number; period: number }> = [
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

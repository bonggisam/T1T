/**
 * 회의 시간 찾기 계산.
 *
 * 입력은 컴시간 전교 시간표와 학교 공유 일정 두 가지뿐이다. 개인 일정과 구글 일정은 입력이 아니다.
 * 바쁨 표시만으로도 그 시간에 개인 약속이 있다는 사실이 드러나기 때문이다.
 * 이 파일은 개인 일정 모듈을 가져오면 안 되며 scripts/check-personal-isolation.cjs 가 이를 검사한다.
 *
 * 결과에는 수업 중인 사람의 이름을 넣지 않고 인원수만 넣는다. 왜 안 되는지보다 언제 되는지를 보여 준다.
 */
import { addDays, format } from 'date-fns';
import type { CalendarEvent, ComciganLinkDoc, ComciganSchoolGrid, School } from '@shared/types';
import { classDurationMin } from './classPeriods';
import { getHoliday } from './holidays';
import { buildPeriodRows } from './periodRows';

export type SchoolGrids = Partial<Record<School, ComciganSchoolGrid>>;
export type SchoolLinks = Partial<Record<School, ComciganLinkDoc>>;

export interface FinderLabel {
  school: School;
  label: string;
  subjects: string[];
  grades: number[];
}

export interface FinderPerson {
  /** 연결된 교사는 u:계정, 아니면 l:학교:표기 */
  key: string;
  /** 연결 전에는 컴시간 표기 */
  name: string;
  userId: string | null;
  labels: FinderLabel[];
}

export interface FinderFilter {
  school?: School | null;
  grade?: number | null;
  subject?: string | null;
  query?: string;
}

export interface FinderRow {
  key: string;
  label: string;
  time: string;
  startMin: number;
  endMin: number;
  kind: 'period' | 'after';
}

/** 계산에 쓰는 공유 일정 값. 개인 일정 타입이 들어오지 못하게 필요한 값만 받는다. */
export type SharedEventInput = Pick<CalendarEvent, 'id' | 'title' | 'school' | 'startDate' | 'endDate' | 'allDay' | 'category'>;

export type FinderCellState = 'free' | 'busy' | 'conflict' | 'past' | 'off';

export interface FinderCell {
  key: string;
  date: string;
  rowKey: string;
  start: Date;
  end: Date;
  /** 수업이 있는 인원수. 누구인지는 넘기지 않는다 */
  busy: number;
  total: number;
  conflicts: Array<{ id: string; title: string }>;
  state: FinderCellState;
}

export interface FinderSuggestion {
  cell: FinderCell;
  row: FinderRow;
  /** 공강 말고 맞지 않는 조건. 화면에 그대로 보여 준다 */
  misses: string[];
}

export interface FinderDay {
  date: Date;
  dateStr: string;
  /** 쉬는 날이면 그 이름 */
  offReason: string | null;
  allDayTitles: string[];
  /** 그 시간을 묶는 종일 일정. 마감과 공지는 빠진다 */
  blockingAllDayTitles: string[];
}

export interface FinderWeek {
  days: FinderDay[];
  cells: Record<string, FinderCell>;
  /** 모두 되는 칸. 빠른 순 */
  free: FinderCell[];
}

const AFTER_SCHOOL_GAP_MIN = 10;
const AFTER_SCHOOL_LENGTH_MIN = 60;
/** 시각이 있어도 사람을 묶어 두지 않는 일정 */
const NON_BLOCKING_CATEGORIES = new Set(['deadline', 'notice']);
/** 관리자가 공유 일정으로 올리는 임시 휴일 */
const DAY_OFF_RE = /재량\s*휴업|휴업일|임시\s*휴일|개교\s*기념일|방학/;

/** 추천 기준. 앞쪽일수록 먼저 따진다 */
export const FINDER_CONDITIONS = ['모두 공강', '공유 일정 없음', '종일 일정 없는 날', '수업 시간 안', '연속 공강'] as const;
export const SUGGESTION_LIMIT = 5;
/** 조건이 같으면 여러 날에 고르게 고른다 */
const MAX_SUGGESTIONS_PER_DAY = 2;
/** 이 안에서 이어지면 연속 공강으로 친다. 점심시간은 넘지 않는다 */
const CONTINUOUS_GAP_MIN = 15;

const koCompare = (a: string, b: string) => a.localeCompare(b, 'ko');

export function cellKey(dateStr: string, rowKey: string): string {
  return `${dateStr}|${rowKey}`;
}

/** 시간표에 있는 표기와 연결표를 합쳐 고를 수 있는 교사 목록을 만든다. 겸임 교사는 한 사람으로 합친다. */
export function buildPeople(grids: SchoolGrids, links: SchoolLinks): FinderPerson[] {
  const people = new Map<string, FinderPerson>();
  for (const school of Object.keys(grids) as School[]) {
    const grid = grids[school];
    if (!grid) continue;
    const entries = links[school]?.entries ?? [];
    for (const [label, slots] of Object.entries(grid.teachers)) {
      const entry = entries.find((e) => e.label === label);
      const key = entry ? `u:${entry.userId}` : `l:${school}:${label}`;
      const person = people.get(key) ?? { key, name: entry?.name ?? label, userId: entry?.userId ?? null, labels: [] };
      person.labels.push({ school, label, subjects: slots.subjects, grades: slots.grades });
      people.set(key, person);
    }
  }
  return [...people.values()].sort((a, b) => (
    Number(!a.userId) - Number(!b.userId) || koCompare(a.name, b.name)
  ));
}

export function matchesFilter(person: FinderPerson, filter: FinderFilter): boolean {
  const query = filter.query?.trim();
  if (query && !person.name.includes(query)) return false;
  return person.labels.some((label) => (
    (!filter.school || label.school === filter.school)
    && (!filter.grade || label.grades.includes(filter.grade))
    && (!filter.subject || label.subjects.includes(filter.subject))
  ));
}

/** 이 학교들에 있는 과목 이름 */
export function subjectOptions(people: FinderPerson[], school?: School | null): string[] {
  const subjects = new Set<string>();
  for (const person of people) {
    for (const label of person.labels) {
      if (!school || label.school === school) label.subjects.forEach((s) => subjects.add(s));
    }
  }
  return [...subjects].sort(koCompare);
}

function usedLastPeriod(grid: ComciganSchoolGrid): number {
  let last = 0;
  for (const slots of Object.values(grid.teachers)) {
    for (const slot of slots.slots) last = Math.max(last, Number(slot.split('-')[1]) || 0);
  }
  return last;
}

/**
 * 격자의 줄: 실제로 쓰는 교시까지와 방과후. 점심은 넣지 않는다.
 * 시정표가 너무 짧으면 null. 시각을 모르면 다른 학교와 견줄 수 없다.
 */
export function buildFinderRows(grid: ComciganSchoolGrid): FinderRow[] | null {
  const periods = buildPeriodRows(grid.classTimes);
  if (!periods) return null;
  const last = usedLastPeriod(grid) || Number.MAX_SAFE_INTEGER;
  const rows: FinderRow[] = periods
    .filter((r) => r.kind === 'period' && r.period <= last)
    .map((r) => ({ key: `p${r.period}`, label: r.label, time: r.time, startMin: r.startMin, endMin: r.endMin, kind: 'period' }));
  if (rows.length === 0) return null;
  const startMin = rows[rows.length - 1].endMin + AFTER_SCHOOL_GAP_MIN;
  rows.push({
    key: 'after',
    label: '방과후',
    time: `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`,
    startMin,
    endMin: startMin + AFTER_SCHOOL_LENGTH_MIN,
    kind: 'after',
  });
  return rows;
}

type Interval = [number, number];

/** 한 교사의 요일별 수업 시간. 학교마다 시정표가 달라 교시 번호가 아니라 시각으로 견준다. */
function busyByWeekday(person: FinderPerson, grids: SchoolGrids): Map<number, Interval[]> {
  const out = new Map<number, Interval[]>();
  for (const { school, label } of person.labels) {
    const grid = grids[school];
    const slots = grid?.teachers[label];
    if (!grid || !slots) continue;
    const duration = classDurationMin(grid.classTimes);
    const starts = new Map<number, number>();
    grid.classTimes.forEach((entry, i) => {
      const m = entry.match(/(\d{1,2}):(\d{2})/);
      if (m) starts.set(i + 1, Number(m[1]) * 60 + Number(m[2]));
    });
    for (const slot of slots.slots) {
      const [weekday, period] = slot.split('-').map(Number);
      const start = starts.get(period);
      if (start === undefined) continue;
      out.set(weekday, [...(out.get(weekday) ?? []), [start, start + duration]]);
    }
  }
  return out;
}

function overlaps(a: Interval[], startMin: number, endMin: number): boolean {
  return a.some(([s, e]) => s < endMin && startMin < e);
}

function at(day: Date, minute: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d;
}

export interface FinderInput {
  monday: Date;
  rows: FinderRow[];
  people: FinderPerson[];
  grids: SchoolGrids;
  events: SharedEventInput[];
  now: Date;
}

/** 한 주의 칸마다 몇 명이 수업 중인지와 겹치는 공유 일정을 계산한다 */
export function computeFinderWeek({ monday, rows, people, grids, events, now }: FinderInput): FinderWeek {
  const schools = new Set<School>();
  people.forEach((p) => p.labels.forEach((l) => schools.add(l.school)));
  const relevant = events.filter((e) => e.school === 'all' || schools.has(e.school as School));
  const busy = people.map((p) => busyByWeekday(p, grids));

  const days: FinderDay[] = [];
  const cells: Record<string, FinderCell> = {};
  const free: FinderCell[] = [];

  for (let i = 0; i < 5; i++) {
    const date = addDays(monday, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayStart = at(date, 0).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const today = relevant.filter((e) => (
      new Date(e.startDate).getTime() < dayEnd && new Date(e.endDate).getTime() >= dayStart
    ));
    const allDay = today.filter((e) => e.allDay);
    const offEvent = allDay.find((e) => DAY_OFF_RE.test(e.title));
    const offReason = getHoliday(date) ?? offEvent?.title ?? null;
    days.push({
      date,
      dateStr,
      offReason,
      allDayTitles: allDay.map((e) => e.title),
      blockingAllDayTitles: allDay.filter((e) => !NON_BLOCKING_CATEGORIES.has(e.category)).map((e) => e.title),
    });

    const timed = today.filter((e) => !e.allDay && !NON_BLOCKING_CATEGORIES.has(e.category));
    for (const row of rows) {
      const start = at(date, row.startMin);
      const end = at(date, row.endMin);
      const busyCount = busy.filter((byDay) => overlaps(byDay.get(i + 1) ?? [], row.startMin, row.endMin)).length;
      const conflicts = timed
        .filter((e) => new Date(e.startDate) < end && new Date(e.endDate) > start)
        .map((e) => ({ id: e.id, title: e.title }));
      let state: FinderCellState = 'free';
      if (offReason) state = 'off';
      else if (start <= now) state = 'past';
      else if (busyCount > 0) state = 'busy';
      else if (conflicts.length > 0) state = 'conflict';
      const cell: FinderCell = {
        key: cellKey(dateStr, row.key),
        date: dateStr,
        rowKey: row.key,
        start,
        end,
        busy: busyCount,
        total: people.length,
        conflicts,
        state,
      };
      cells[cell.key] = cell;
      if (state === 'free') free.push(cell);
    }
  }
  free.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { days, cells, free };
}

function firstWithMore(titles: string[]): string {
  return titles.length > 1 ? `${titles[0]} 외 ${titles.length - 1}건` : titles[0];
}

/**
 * 고른 요일에서 공강 추천을 고른다. FINDER_CONDITIONS 순서로 따지고, 같으면 빠른 시간을 앞에 둔다.
 * 모두 되는 시간이 모자라면 가장 많이 되는 시간으로 채운다. 아무도 되지 않는 칸은 넣지 않는다.
 * 수업 중인 사람은 인원수만 쓴다. 누구인지는 넘기지 않는다.
 */
export function suggestSlots(
  week: FinderWeek,
  rows: FinderRow[],
  weekdays: ReadonlySet<number>,
  limit: number = SUGGESTION_LIMIT,
): FinderSuggestion[] {
  const ranked: Array<FinderSuggestion & { order: number[] }> = [];
  week.days.forEach((day, dayIndex) => {
    if (!weekdays.has(dayIndex + 1)) return;
    rows.forEach((row, rowIndex) => {
      const cell = week.cells[cellKey(day.dateStr, row.key)];
      if (!cell || cell.state === 'past' || cell.state === 'off' || cell.busy >= cell.total) return;
      const isFree = (other?: FinderRow) => !!other && week.cells[cellKey(day.dateStr, other.key)]?.state === 'free';
      const before = rows[rowIndex - 1];
      const after = rows[rowIndex + 1];
      const continuous = cell.busy === 0 && (
        (isFree(before) && row.startMin - before.endMin <= CONTINUOUS_GAP_MIN)
        || (isFree(after) && after.startMin - row.endMin <= CONTINUOUS_GAP_MIN)
      );
      const misses: string[] = [];
      if (cell.conflicts.length > 0) misses.push(`일정 겹침: ${firstWithMore(cell.conflicts.map((c) => c.title))}`);
      if (day.blockingAllDayTitles.length > 0) misses.push(`종일 일정: ${firstWithMore(day.blockingAllDayTitles)}`);
      if (row.kind === 'after') misses.push('방과후');
      if (!continuous) misses.push('연속 공강 아님');
      ranked.push({
        cell,
        row,
        misses,
        order: [
          cell.busy,
          Number(cell.conflicts.length > 0),
          Number(day.blockingAllDayTitles.length > 0),
          Number(row.kind === 'after'),
          Number(!continuous),
          cell.start.getTime(),
        ],
      });
    });
  });
  ranked.sort((a, b) => {
    const at = a.order.findIndex((value, i) => value !== b.order[i]);
    return at < 0 ? 0 : a.order[at] - b.order[at];
  });

  // 수업 인원과 일정 겹침이 같은 칸끼리는 한 날에 몰리지 않게 고른다
  const picked: FinderSuggestion[] = [];
  const perDay = new Map<string, number>();
  for (let i = 0; i < ranked.length && picked.length < limit;) {
    let end = i;
    while (end < ranked.length && ranked[end].order[0] === ranked[i].order[0] && ranked[end].order[1] === ranked[i].order[1]) end++;
    const held: FinderSuggestion[] = [];
    for (const item of ranked.slice(i, end)) {
      const count = perDay.get(item.cell.date) ?? 0;
      if (count < MAX_SUGGESTIONS_PER_DAY) {
        picked.push(item);
        perDay.set(item.cell.date, count + 1);
      } else {
        held.push(item);
      }
    }
    picked.push(...held);
    i = end;
  }
  return picked.slice(0, limit).map(({ cell, row, misses }) => ({ cell, row, misses }));
}

/**
 * 감독·당직 표에서 내 차례를 찾아 달력에 그릴 모양으로 바꾼다.
 * 개인 일정과 상관없는 학교 업무 자료이며, 달력에 그리는 값은 저장하지 않는다.
 */
import type { CalendarEvent, DutyEntry, DutyTable, School } from '@shared/types';

export interface DutyMe {
  id: string;
  name: string;
  school?: string;
}

export interface DutyLabelLinks {
  /** 내게 연결된 표기 (학교별) */
  mine: Partial<Record<School, string[]>>;
  /** 다른 사람에게 연결된 표기. 같은 두 글자라도 내가 아니다 */
  others: Set<string>;
}

export interface MyDuty {
  table: DutyTable;
  entry: DutyEntry;
}

function normalize(name: string): string {
  return name.replace(/\s+/g, '').replace(/(선생님|교사|쌤)$/, '');
}

function isOwnSchoolTable(table: DutyTable, me: DutyMe, links: DutyLabelLinks): boolean {
  if (table.school === 'all') return true;
  if (me.school !== 'taeseong_middle' && me.school !== 'taeseong_high') return true; // 전체 관리자는 학교가 없을 수 있다
  return table.school === me.school || (links.mine[table.school]?.length ?? 0) > 0;
}

/**
 * 표의 이름이 나인가. 전체 이름이 같으면 나이고, 두 글자 표기면 연결표로 가른다.
 * 연결표에 없는 두 글자는 내 이름 앞 두 글자와 같을 때 나로 본다.
 */
export function isMyEntry(entry: Pick<DutyEntry, 'name'>, me: DutyMe, links: DutyLabelLinks): boolean {
  const name = normalize(entry.name);
  const mine = normalize(me.name);
  if (!name || !mine) return false;
  if (name === mine) return true;
  if (name.length !== 2) return false;
  const myLabels = Object.values(links.mine).flat() as string[];
  if (myLabels.includes(name)) return true;
  if (links.others.has(name)) return false;
  return mine.startsWith(name);
}

export function findMyDuties(tables: DutyTable[], me: DutyMe | null, links: DutyLabelLinks): MyDuty[] {
  if (!me) return [];
  const out: MyDuty[] = [];
  for (const table of tables) {
    if (!isOwnSchoolTable(table, me, links)) continue;
    for (const entry of table.entries) {
      if (isMyEntry(entry, me, links)) out.push({ table, entry });
    }
  }
  return out.sort((a, b) => (
    a.entry.date.localeCompare(b.entry.date) || (a.entry.startMin ?? -1) - (b.entry.startMin ?? -1)
  ));
}

export function dutyPeriodLabel(entry: Pick<DutyEntry, 'periods'>): string {
  const { periods } = entry;
  if (periods.length === 0) return '';
  if (periods.length === 1) return `${periods[0]}교시`;
  const sorted = [...periods].sort((a, b) => a - b);
  const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
  return contiguous ? `${sorted[0]}~${sorted[sorted.length - 1]}교시` : `${sorted.join(',')}교시`;
}

/** 칩에 쓰는 이름: 시험 감독 1-2 */
export function dutyTitle(entry: Pick<DutyEntry, 'kind' | 'place'>): string {
  return [entry.kind, entry.place].filter(Boolean).join(' ') || '감독·당직';
}

/** 2교시 09:55~10:45, 없으면 하루 종일 */
export function dutyWhenText(entry: Pick<DutyEntry, 'periods' | 'startMin' | 'endMin'>): string {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const period = dutyPeriodLabel(entry);
  if (entry.startMin === null) return period || '하루 종일';
  const time = entry.endMin !== null ? `${clock(entry.startMin)}~${clock(entry.endMin)}` : clock(entry.startMin);
  return period ? `${period} ${time}` : time;
}

function dateAt(date: string, minute: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minute / 60), minute % 60, 0, 0);
}

export function dutyStart(entry: Pick<DutyEntry, 'date' | 'startMin'>): Date {
  return dateAt(entry.date, entry.startMin ?? 0);
}

/** 달력의 일정과 같은 모양으로 바꾼다. 화면에 그리기만 하고 저장하거나 구글로 보내지 않는다. */
export function dutyToEvent({ table, entry }: MyDuty): CalendarEvent {
  const hasTime = entry.startMin !== null;
  const start = dateAt(entry.date, entry.startMin ?? 0);
  const end = hasTime
    ? dateAt(entry.date, entry.endMin ?? (entry.startMin as number) + 60)
    : dateAt(entry.date, 23 * 60 + 59);
  return {
    id: `duty:${table.id}:${entry.id}`,
    title: dutyTitle(entry),
    description: '',
    startDate: start,
    endDate: end,
    allDay: !hasTime,
    category: 'other',
    school: table.school,
    createdBy: table.createdBy,
    adminName: table.createdByName,
    adminColor: '#0E7490',
    repeat: null,
    seriesId: null,
    responseType: null,
    duty: {
      tableId: table.id,
      entryId: entry.id,
      tableTitle: table.title,
      kind: entry.kind,
      place: entry.place,
      periods: entry.periods,
    },
    attachments: [],
    checklist: [],
    readBy: {},
    createdAt: table.createdAt ?? start,
    updatedAt: table.updatedAt ?? start,
  };
}

/** 표를 고치고 지울 수 있는 사람: 만든 사람과 관리자 */
export function canManageDutyTable(
  table: Pick<DutyTable, 'createdBy'>,
  user: { id: string; role?: string } | null | undefined,
): boolean {
  if (!user) return false;
  return user.id === table.createdBy || user.role === 'admin' || user.role === 'super_admin';
}

/** 담당자에게만 보여 주는 교사별 횟수. 많은 순 */
export function countByTeacher(entries: Array<Pick<DutyEntry, 'name'>>): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const { name } of entries) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

/** 날짜별로 묶는다. 날짜 순 */
export function groupByDate<T extends { date: string }>(entries: T[]): Array<{ date: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const entry of entries) map.set(entry.date, [...(map.get(entry.date) ?? []), entry]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items }));
}

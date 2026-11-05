/**
 * 시험 감독표와 당직표를 붙여 넣으면 "누가, 언제, 어디서"를 읽어 낸다.
 *
 * 학교마다 표 모양이 달라 아래 네 가지를 찾아 읽는다. 틀릴 수 있으므로 저장 전에 담당자가 고치는 초안이다.
 *  1. 목록: 날짜 | 교시 | 장소 | 이름 (열 머리글이 없어도 칸 내용으로 짐작한다)
 *  2. 날짜·교시가 열: 첫 열이 고사실이면 칸에 이름, 첫 열이 이름이면 칸에 고사실이나 표시
 *  3. 교시가 열: 첫 열이 날짜, 칸에 이름
 *  4. 날짜만 있는 줄 아래에 교시와 이름이 이어지는 묶음
 *
 * PC 안에서 규칙으로만 읽고 원문은 저장하지 않는다.
 */
import { format } from 'date-fns';
import { classDurationMin } from './classPeriods';
import { findTime, guessYear, makeDate, periodStartsOf } from './pasteEventParser';

export interface DutyDraft {
  id: string;
  date: string;
  periods: number[];
  startMin: number | null;
  endMin: number | null;
  name: string;
  kind: string;
  place: string;
  /** 어느 줄에서 읽었는지 (확인용, 저장하지 않음) */
  source: string;
}

export type DutyTableShape = 'list' | 'date-columns' | 'period-columns' | 'none';

export interface DutyParseResult {
  rows: DutyDraft[];
  /** 내용은 있는데 읽지 못한 줄 */
  skipped: string[];
  shape: DutyTableShape;
}

export interface DutyParseOptions {
  base?: Date;
  classTimes?: string[];
  /** 연결표의 표기 → 이름. 두 글자 표기로 된 표를 이름으로 바꾼다 */
  labelNames?: Record<string, string>;
  /** 이미 아는 이름 (드문 성씨도 이름으로 읽는다) */
  knownNames?: string[];
}

interface DateHit {
  date: string;
  /** 날짜 뒤에 남은 글 */
  rest: string;
}

const DATE_FULL_RE = /^(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?\.?/;
const DATE_KOR_RE = /^(\d{1,2})월(\d{1,2})일/;
const DATE_NUM_RE = /^(\d{1,2})[./](\d{1,2})(?![\d/%])\.?/;
const WEEKDAY_TAIL_RE = /^\s*\(?\s*[일월화수목금토](?:요일)?\s*\)?/;
const DATE_START_RE = /^(?:20\d{2}[년.\-/]|\d{1,2}월\d{1,2}일|\d{1,2}[./]\d{1,2})/;
const DATE_ANY_RE = /(?:^|\s)(?:20\d{2}[년.\-/]\s*\d{1,2}|\d{1,2}월\d{1,2}일|\d{1,2}[./]\d{1,2})/g;

const PERIOD_RE = /^(\d{1,2})(?:\s*[,~∼〜\-·]\s*(\d{1,2}))*\s*교시$/;
const PERIOD_RANGE_RE = /^(\d{1,2})\s*[~∼〜\-]\s*(\d{1,2})\s*교시$/;
const TIME_HINT_RE = /\d{1,2}:\d{2}|\d{1,2}\s*시/;

const DATE_HEADER_RE = /^(날짜|일자|일시|월일|시험일|고사일|근무일|당직일|날)$/;
const WHEN_HEADER_RE = /^(교시|시간|시각|시간대|근무\s*시간)$/;
const NAME_HEADER_RE = /(이름|성명|교사|감독|당직|일직|숙직|담당|근무자|지도|선생)/;
const PLACE_HEADER_RE = /(장소|고사실|시험실|교실|구역|위치|학급|층|^반$)/;
const KIND_HEADER_RE = /^(구분|종류|업무|역할|유형)$/;
const IGNORE_HEADER_RE = /^(과목|교과|시험\s*과목|비고|요일|연번|번호|순번|no\.?|확인|서명|인|횟수|계|합계)$/i;
/** 사람을 가리킬 뿐 일의 이름은 아닌 열 머리글. 담당자가 고른 기본 종류를 쓴다 */
const GENERIC_NAME_HEADER_RE = /^(이름|성명|교사|담당|담당자|담당교사|근무자|선생님?|감독|감독자|감독교사)$/;
/** 사람을 가리키는 꼴이지만 일의 이름을 알 수 있는 열 머리글 */
const DUTY_WORD_HEADER_RE = /^(당직|일직|숙직)(자|교사)?$/;

/** 이름처럼 보여도 사람이 아닌 말 */
const NOT_NAMES = new Set([
  '구분', '비고', '합계', '소계', '요일', '날짜', '일자', '일시', '교시', '시간', '이름', '성명', '교사', '감독', '담당', '담당자',
  '장소', '교실', '고사실', '시험실', '학년', '위치', '역할', '종류', '업무', '없음', '휴업', '공휴일', '방학', '토요일', '일요일',
  '미정', '예비', '본부', '복도', '정감독', '부감독', '복도감독', '당직', '일직', '숙직', '오전', '오후', '점심', '방과후', '주간', '야간',
  '월요일', '화요일', '수요일', '목요일', '금요일', '국어', '수학', '영어', '사회', '과학', '역사', '도덕', '음악', '미술', '체육', '기술',
  '가정', '기가', '한문', '정보', '진로', '일본어', '중국어', '물리', '화학', '생물', '지구과학', '지리', '윤리', '경제', '정치',
]);
const SURNAMES = new Set([...'김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구나민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용']);
const LONG_SURNAMES = ['남궁', '황보', '제갈', '선우', '서문', '독고', '사공'];
/** 칸의 표시만 있는 경우: 이름 행렬에서 그 시간에 들어간다는 뜻 */
const MARK_RE = /^[○◯●oOvV✓√※*]$/;

const ROOM_RE = /(\d\s*-\s*\d|\d\s*학년|\d\s*반|\d\s*층|\d+\s*실|[가-힣]+실$|[가-힣]+관$|[가-힣]+반$)/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 칸 맨 앞의 날짜를 읽는다. 뒤에 "(월) 1교시"가 붙어도 된다. */
function readDate(cell: string, base: Date): DateHit | null {
  const text = cell.trim();
  let year: number;
  let month: number;
  let day: number;
  let used: number;
  const full = text.match(DATE_FULL_RE);
  const kor = text.match(DATE_KOR_RE);
  const num = text.match(DATE_NUM_RE);
  if (full) {
    [year, month, day] = [Number(full[1]), Number(full[2]), Number(full[3])];
    used = full[0].length;
  } else if (kor) {
    [month, day] = [Number(kor[1]), Number(kor[2])];
    year = guessYear(month, day, base);
    used = kor[0].length;
  } else if (num) {
    [month, day] = [Number(num[1]), Number(num[2])];
    year = guessYear(month, day, base);
    used = num[0].length;
  } else {
    return null;
  }
  const date = makeDate(year, month, day);
  if (!date) return null;
  const rest = text.slice(used).replace(WEEKDAY_TAIL_RE, '').trim();
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, rest };
}

interface When {
  periods: number[];
  startMin: number | null;
  endMin: number | null;
}

/** "2교시", "1,2교시", "1~3교시", "17:00~21:00", "오후 5시~9시" */
function readWhen(cell: string): When | null {
  const text = cell.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (PERIOD_RE.test(text)) {
    const range = text.match(PERIOD_RANGE_RE);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (to >= from && to - from < 10) {
        return { periods: Array.from({ length: to - from + 1 }, (_, i) => from + i), startMin: null, endMin: null };
      }
    }
    return { periods: [...text.matchAll(/\d{1,2}/g)].map((m) => Number(m[0])), startMin: null, endMin: null };
  }
  if (TIME_HINT_RE.test(text) && !/[가-힣]{2,}/.test(text.replace(/오전|오후|부터|까지/g, ''))) {
    const time = findTime(text, new Map());
    if (time) return { periods: [], startMin: time.startMin, endMin: time.endMin ?? time.startMin + 60 };
  }
  return null;
}

function cleanName(cell: string): { name: string; mark: string } {
  let text = cell.trim();
  let mark = '';
  const tagged = text.match(/^(.+?)\s*[(（[]\s*(정|부|주|보조|정감독|부감독)\s*[)）\]]$/);
  if (tagged) {
    text = tagged[1];
    mark = tagged[2];
  }
  text = text.replace(/\s*(선생님|교사|쌤|T)$/, '').replace(/\s+/g, '');
  const withoutTitle = text.replace(/선생$/, '');
  if (withoutTitle.length >= 2) text = withoutTitle;
  return { name: text, mark };
}

function hasSurname(name: string): boolean {
  return SURNAMES.has(name[0]) || LONG_SURNAMES.some((s) => name.startsWith(s));
}

function isNameLike(cell: string, known: Set<string>, strict = true): boolean {
  const { name } = cleanName(cell);
  if (known.has(name)) return true;
  if (!/^[가-힣]{2,5}$/.test(name) || NOT_NAMES.has(name)) return false;
  if (!strict) return true;
  return name.length <= 4 && hasSurname(name);
}

function isRoomLike(cell: string): boolean {
  const text = cell.trim();
  return !!text && ROOM_RE.test(text) && !readWhen(text);
}

function namesIn(cell: string, known: Set<string>, strict: boolean): Array<{ name: string; mark: string }> {
  const parts = cell.split(/[,/·、;]|\s+및\s+|\s+/).map((p) => p.trim()).filter(Boolean);
  const out: Array<{ name: string; mark: string }> = [];
  for (const part of parts) {
    if (isNameLike(part, known, strict)) out.push(cleanName(part));
  }
  return out;
}

function kindOfMark(mark: string, kind: string): string {
  if (mark === '정') return '정감독';
  if (mark === '부') return '부감독';
  if (mark === '주') return kind || '주감독';
  return mark || kind;
}

/** 공백 때문에 칸이 갈리지 않도록 날짜·교시·반 표현을 붙인다 */
function tidyLine(line: string): string {
  return line
    .replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, '$1월$2일')
    .replace(/(\d{1,2})\s*교시/g, '$1교시')
    .replace(/(\d)\s*학년\s*(\d{1,2})\s*반/g, '$1학년$2반')
    .replace(/(오전|오후)\s+(\d)/g, '$1$2')
    .replace(/\s*[(（]\s*([일월화수목금토])(?:요일)?\s*[)）]/g, '($1)')
    .replace(/(\d{1,2}:\d{2})\s*[~∼〜\-–—]\s*(\d{1,2}:\d{2})/g, '$1~$2')
    .replace(/(\d{1,2}시(?:\s*\d{1,2}분)?)\s*[~∼〜\-–—]\s*((?:오전|오후)?\d{1,2}시)/g, '$1~$2')
    .replace(/(\d)\s*[,~∼〜]\s*(\d)교시/g, '$1~$2교시');
}

function splitLines(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hasTab = lines.some((l) => l.includes('\t'));
  const hasPipe = !hasTab && lines.some((l) => l.includes('|'));
  return lines.map((raw) => {
    const line = tidyLine(raw);
    if (hasTab) return line.split('\t').map((c) => c.trim());
    if (hasPipe) {
      const cells = line.split('|').map((c) => c.trim());
      return cells.filter((c, i) => c || (i > 0 && i < cells.length - 1));
    }
    const trimmed = line.trim();
    // "11/5 김철수  11/6 이영희"처럼 날짜로 시작해 날짜가 이어지면 낱말로 나눈다. 뒤에서 날짜마다 끊는다.
    if (DATE_START_RE.test(trimmed) && (trimmed.match(DATE_ANY_RE)?.length ?? 0) > 1) return trimmed.split(/\s+/);
    const wide = trimmed.split(/\s{2,}/);
    if (wide.length > 1) return wide;
    if (trimmed.includes(',') && !/\s/.test(trimmed)) return trimmed.split(',');
    return trimmed.split(/\s+/);
  });
}

function rangeOfPeriods(periods: number[], classTimes: string[]): { startMin: number | null; endMin: number | null } {
  if (periods.length === 0) return { startMin: null, endMin: null };
  const starts = periodStartsOf(classTimes);
  const first = starts.get(Math.min(...periods));
  const last = starts.get(Math.max(...periods));
  if (first === undefined || last === undefined) return { startMin: null, endMin: null };
  return { startMin: first, endMin: last + classDurationMin(classTimes) };
}

class Collector {
  rows: DutyDraft[] = [];
  private seen = new Set<string>();

  constructor(private options: DutyParseOptions) {}

  add(input: { date: string; when: When | null; name: string; kind: string; place: string; source: string }): void {
    const name = this.options.labelNames?.[input.name] ?? input.name;
    const periods = input.when?.periods ?? [];
    const range = input.when && input.when.startMin !== null
      ? { startMin: input.when.startMin, endMin: input.when.endMin }
      : rangeOfPeriods(periods, this.options.classTimes ?? []);
    const key = [input.date, periods.join(','), range.startMin, name, input.kind, input.place].join('|');
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.rows.push({
      id: `r${this.rows.length}`,
      date: input.date,
      periods,
      startMin: range.startMin,
      endMin: range.endMin,
      name,
      kind: input.kind,
      place: input.place,
      source: input.source.length > 70 ? `${input.source.slice(0, 69)}…` : input.source,
    });
  }
}

interface ColumnHead {
  date?: string;
  when?: When;
}

/** 위쪽 줄에서 날짜·교시가 열로 놓인 머리글을 찾는다 */
function findMatrixHead(rows: string[][], base: Date): { heads: Map<number, ColumnHead>; dataFrom: number; firstColumn: number } | null {
  for (let top = 0; top < Math.min(rows.length, 3); top++) {
    const row = rows[top];
    const heads = new Map<number, ColumnHead>();
    row.forEach((cell, col) => {
      const hit = readDate(cell, base);
      if (hit) {
        const when = readWhen(hit.rest);
        heads.set(col, { date: hit.date, when: when ?? undefined });
        return;
      }
      const when = readWhen(cell);
      if (when) heads.set(col, { when });
    });
    if (heads.size < 2) continue;
    const firstColumn = Math.min(...heads.keys());
    if (firstColumn === 0) continue; // 줄 머리가 없으면 표가 아니라 목록의 한 줄이다

    // 날짜 칸이 바로 아래 줄에도 있으면 머리글이 아니라 날짜가 여럿 적힌 목록이다
    const next = rows[top + 1] ?? [];
    const dates = [...heads.entries()].filter(([, h]) => h.date);
    if (dates.length > 0 && dates.every(([col]) => readDate(next[col] ?? '', base))) continue;

    let dataFrom = top + 1;
    if (dates.length > 0 && dates.every(([, h]) => !h.when)) {
      // 바로 아래에 교시 줄이 있으면 합친다. 병합된 날짜 칸은 빈칸으로 오므로 앞 날짜를 잇는다.
      const whens = new Map<number, When>();
      next.forEach((cell, col) => {
        const when = readWhen(cell);
        if (when) whens.set(col, when);
      });
      if (whens.size >= 1) {
        let date = '';
        const merged = new Map<number, ColumnHead>();
        const last = Math.max(row.length, next.length);
        for (let col = firstColumn; col < last; col++) {
          date = heads.get(col)?.date ?? date;
          const when = whens.get(col);
          if (date && when) merged.set(col, { date, when });
        }
        if (merged.size >= 1) {
          return { heads: merged, dataFrom: top + 2, firstColumn };
        }
      }
    }
    if (dataFrom >= rows.length) return null;
    return { heads, dataFrom, firstColumn };
  }
  return null;
}

function parseMatrix(
  rows: string[][],
  head: { heads: Map<number, ColumnHead>; dataFrom: number; firstColumn: number },
  defaultKind: string,
  known: Set<string>,
  base: Date,
  out: Collector,
  skipped: string[],
): DutyTableShape {
  const hasDates = [...head.heads.values()].some((h) => h.date);
  let previousHeader = '';
  for (const row of rows.slice(head.dataFrom)) {
    const source = row.filter(Boolean).join(' ');
    let header = row.slice(0, head.firstColumn).filter(Boolean).join(' ');
    // 병합된 첫 칸은 빈칸으로 온다
    if (!header && !hasDates) header = previousHeader;
    if (!header && hasDates) header = previousHeader;
    previousHeader = header;
    let found = 0;

    // 교시만 열이면 줄 머리가 날짜다
    const rowDate = hasDates ? null : readDate(header, base)?.date ?? null;
    if (!hasDates && !rowDate) {
      if (source) skipped.push(source);
      continue;
    }
    const headerIsName = hasDates && isNameLike(header, known);

    for (const [col, columnHead] of head.heads) {
      const cell = (row[col] ?? '').trim();
      if (!cell) continue;
      const date = columnHead.date ?? rowDate;
      if (!date) continue;
      if (headerIsName) {
        const { name, mark } = cleanName(header);
        const isMark = MARK_RE.test(cell) || cell === '정' || cell === '부';
        out.add({
          date,
          when: columnHead.when ?? null,
          name,
          kind: kindOfMark(mark || (cell === '정' || cell === '부' ? cell : ''), defaultKind),
          place: isMark ? '' : cell,
          source,
        });
        found += 1;
        continue;
      }
      for (const person of namesIn(cell, known, false)) {
        out.add({
          date,
          when: columnHead.when ?? null,
          name: person.name,
          kind: kindOfMark(person.mark, defaultKind),
          place: hasDates ? header : '',
          source,
        });
        found += 1;
      }
    }
    if (found === 0 && source) skipped.push(source);
  }
  return hasDates ? 'date-columns' : 'period-columns';
}

interface ListColumns {
  date: number | null;
  when: number | null;
  place: number | null;
  kind: number | null;
  /** 이름 열과 그 열이 말하는 일의 이름 */
  names: Array<{ col: number; kind: string; place: string }>;
  dataFrom: number;
  strictNames: boolean;
}

function headerColumns(rows: string[][], known: Set<string>, base: Date): ListColumns | null {
  for (let top = 0; top < Math.min(rows.length, 3); top++) {
    const row = rows[top];
    const columns: ListColumns = { date: null, when: null, place: null, kind: null, names: [], dataFrom: top + 1, strictNames: false };
    let hits = 0;
    let blocked = false;
    row.forEach((raw, col) => {
      const cell = raw.trim();
      if (!cell) return;
      if (readDate(cell, base)) { blocked = true; return; }
      if (DATE_HEADER_RE.test(cell)) { columns.date = col; hits += 1; return; }
      if (WHEN_HEADER_RE.test(cell)) { columns.when = col; hits += 1; return; }
      if (KIND_HEADER_RE.test(cell)) { columns.kind = col; hits += 1; return; }
      if (IGNORE_HEADER_RE.test(cell)) { hits += 1; return; }
      if (NAME_HEADER_RE.test(cell)) {
        const dutyWord = cell.match(DUTY_WORD_HEADER_RE);
        if (dutyWord || GENERIC_NAME_HEADER_RE.test(cell)) {
          columns.names.push({ col, kind: dutyWord ? dutyWord[1] : '', place: '' });
          hits += 1;
          return;
        }
        // "1층 당직"처럼 장소가 함께 적히면 나누어 둔다
        const placeOnly = cell.replace(/\s*(당직|일직|숙직|감독|담당|교사|지도)\s*/g, '').trim();
        const place = placeOnly && PLACE_HEADER_RE.test(placeOnly) ? placeOnly : '';
        columns.names.push({ col, kind: place ? cell.replace(place, '').trim() : cell, place });
        hits += 1;
        return;
      }
      if (PLACE_HEADER_RE.test(cell)) { columns.place = col; hits += 1; return; }
      if (isNameLike(cell, known)) blocked = true;
    });
    if (!blocked && hits >= 2 && columns.names.length > 0) return columns;
  }
  return null;
}

/** 머리글이 없으면 칸 내용으로 열의 뜻을 짐작한다 */
function inferColumns(rows: string[][], known: Set<string>, base: Date): ListColumns {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const score = (test: (cell: string) => boolean) => Array.from({ length: width }, (_, col) => {
    const filled = rows.map((r) => (r[col] ?? '').trim()).filter(Boolean);
    return filled.length ? filled.filter(test).length / filled.length : 0;
  });
  const bestColumn = (scores: number[], except: Array<number | null>): number | null => {
    let best: number | null = null;
    scores.forEach((s, col) => {
      if (s >= 0.5 && !except.includes(col) && (best === null || s > scores[best])) best = col;
    });
    return best;
  };
  const date = bestColumn(score((c) => !!readDate(c, base)), []);
  const when = bestColumn(score((c) => !!readWhen(c)), [date]);
  const nameScores = score((c) => namesIn(c, known, true).length > 0);
  const names = nameScores
    .map((s, col) => ({ s, col }))
    .filter(({ s, col }) => s >= 0.5 && col !== date && col !== when)
    .map(({ col }) => ({ col, kind: '', place: '' }));
  const place = bestColumn(score(isRoomLike), [date, when, ...names.map((n) => n.col)]);
  return { date, when, place, kind: null, names, dataFrom: 0, strictNames: true };
}

function parseList(
  rows: string[][],
  columns: ListColumns,
  defaultKind: string,
  known: Set<string>,
  base: Date,
  out: Collector,
  skipped: string[],
): void {
  let currentDate: string | null = null;
  let currentWhen: When | null = null;
  for (const row of rows.slice(columns.dataFrom)) {
    const filled = row.filter((c) => c.trim());
    const source = filled.join(' ');
    if (filled.length === 0) continue;

    // 날짜만 있는 줄은 아래 줄들의 날짜다
    if (filled.length === 1) {
      const section = readDate(filled[0], base);
      if (section && !section.rest) {
        currentDate = section.date;
        currentWhen = null;
        continue;
      }
    }

    let date: string | null = currentDate;
    let when: When | null = currentWhen;
    if (columns.date !== null) {
      const hit = readDate(row[columns.date] ?? '', base);
      if (hit) {
        date = hit.date;
        currentDate = hit.date;
        const inline = readWhen(hit.rest);
        if (inline) when = inline;
      } else if ((row[columns.date] ?? '').trim()) {
        skipped.push(source);
        continue;
      }
    }
    if (columns.when !== null) {
      const hit = readWhen(row[columns.when] ?? '');
      // 병합된 칸은 빈칸으로 오므로 위 줄 값을 잇는다
      if (hit) when = hit;
      else if (columns.date !== null && (row[columns.date] ?? '').trim()) when = null;
    }
    currentWhen = when;
    if (!date) {
      skipped.push(source);
      continue;
    }

    const place = columns.place !== null ? (row[columns.place] ?? '').trim() : '';
    const kindCell = columns.kind !== null ? (row[columns.kind] ?? '').trim() : '';
    let found = 0;
    for (const nameColumn of columns.names) {
      for (const person of namesIn(row[nameColumn.col] ?? '', known, columns.strictNames)) {
        out.add({
          date,
          when,
          name: person.name,
          kind: kindOfMark(person.mark, kindCell || nameColumn.kind || defaultKind),
          place: place || nameColumn.place,
          source,
        });
        found += 1;
      }
    }
    if (found === 0) skipped.push(source);
  }
}

/** 한 줄에 "날짜 이름"이 여러 번 이어지는 명단을 날짜마다 나눈다 */
function splitRepeatedDates(rows: string[][], base: Date): string[][] {
  const out: string[][] = [];
  for (const row of rows) {
    const at = row.map((c, i) => (readDate(c, base) ? i : -1)).filter((i) => i >= 0);
    if (at.length < 2) {
      out.push(row);
      continue;
    }
    at.forEach((from, i) => out.push(row.slice(from, at[i + 1] ?? row.length)));
  }
  return out;
}

export function parseDutyTable(text: string, defaultKind: string, options: DutyParseOptions = {}): DutyParseResult {
  const base = options.base ?? new Date();
  const out = new Collector(options);
  const skipped: string[] = [];
  if (!text.trim()) return { rows: [], skipped: [], shape: 'none' };

  const known = new Set<string>([...(options.knownNames ?? []), ...Object.keys(options.labelNames ?? {})]);
  const rows = splitLines(text);

  const matrix = findMatrixHead(rows, base);
  if (matrix) {
    const shape = parseMatrix(rows, matrix, defaultKind, known, base, out, skipped);
    if (out.rows.length > 0) return { rows: out.rows, skipped, shape };
    skipped.length = 0;
  }

  const prepared = splitRepeatedDates(rows, base);
  const columns = headerColumns(prepared, known, base) ?? inferColumns(prepared.filter((r) => r.filter(Boolean).length > 1), known, base);
  if (columns.names.length === 0) {
    return { rows: [], skipped: prepared.map((r) => r.filter(Boolean).join(' ')).filter(Boolean), shape: 'none' };
  }
  parseList(prepared, columns, defaultKind, known, base, out, skipped);
  return { rows: out.rows, skipped, shape: out.rows.length ? 'list' : 'none' };
}

/** 표 저장 전에 교시 시각을 고칠 때 쓴다. 시험 교시는 수업 시정표와 다를 수 있다. */
export function collectPeriods(rows: Array<{ periods: number[] }>): number[] {
  return [...new Set(rows.flatMap((r) => r.periods))].sort((a, b) => a - b);
}

export function minutesText(min: number | null): string {
  if (min === null) return '';
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function parseMinutes(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? minutes : null;
}

export function formatDutyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'M/d');
}

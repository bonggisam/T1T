/**
 * 시험 감독표와 당직표를 붙여 넣으면 "누가, 언제, 어디서"를 읽어 낸다.
 *
 * 학교마다 표 모양이 달라 칸마다 날짜, 교시, 고사실, 이름 중 무엇인지 보고 머리글과 왼쪽 칸에서 값을 모은다.
 * 틀릴 수 있으므로 저장 전에 담당자가 고치는 초안이다.
 *  1. 행렬: 위쪽 머리글(날짜, 교시, 고사실)과 왼쪽 칸(날짜, 교시, 고사실, 정·부, 이름)의 어떤 조합이든 읽는다.
 *     머리글은 두세 줄로 나뉘어도 되고, 표가 날짜별로 나뉘거나 머리글이 되풀이되어도 된다.
 *  2. 목록: 날짜 | 교시 | 장소 | 이름 (열 머리글이 없어도 칸 내용으로 짐작한다)
 *  3. 날짜만 있는 줄 아래에 교시와 이름이 이어지는 묶음
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

export type DutyTableShape = 'list' | 'date-columns' | 'period-columns' | 'room-columns' | 'none';

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

/** 일과 요일만 적은 날짜: "16(월)", "16일(월)". 요일이 맞는 가까운 달을 찾는다 */
const DAY_WEEKDAY_RE = /^(\d{1,2})\s*일?\s*[(（]\s*([일월화수목금토])(?:요일)?\s*[)）]?/;
/** 날짜 앞에 붙는 차수와 기호: "◎ 1일차: ", "제2일 ", "【" */
const DATE_PREFIX_RE = /^[\s◎○●■□▣▶▷◆◇※☆★·•\-–—【[<〈(（]*(?:제?\s*\d+\s*일(?:차)?\s*[:：\-–—)\]】>〉.]*\s*)?[[(（【<〈]*\s*/;
const REST_EDGE_RE = /^[\])）】>〉\s:：.\-–—]+|[[(（【<〈\s:：.\-–—]+$/g;
/** 글 안의 날짜를 찾는다. 표 앞의 날짜 줄을 읽을 때 쓴다 */
const DATE_INSIDE_RE = /20\d{2}\s*[년.\-/]\s*\d{1,2}\s*[월.\-/]\s*\d{1,2}\s*일?|\d{1,2}월\s*\d{1,2}일|(?<![\d\-.])\d{1,2}[./]\d{1,2}(?![\d/%.])/g;

const PERIOD_IN_RE = /(\d{1,2}(?:\s*[,~∼〜\-·]\s*\d{1,2})*)\s*교시/;
const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*[~∼〜\-–—]\s*(\d{1,2}):(\d{2})/;
const TIME_HINT_RE = /\d{1,2}:\d{2}|\d{1,2}\s*시/;

const DATE_HEADER_RE = /^(날짜|일자|일시|월일|시험일|고사일|근무일|당직일|날)$/;
const WHEN_HEADER_RE = /^(교시|시간|시각|시간대|근무\s*시간)$/;
const NAME_HEADER_RE = /(이름|성명|교사|감독|당직|일직|숙직|담당|근무자|지도|선생)/;
const PLACE_HEADER_RE = /(장소|고사실|시험실|교실|구역|위치|학급|층|^반$)/;
const KIND_HEADER_RE = /^(구분|종류|업무|역할|유형)$/;
const IGNORE_HEADER_RE = /^(과목|교과|시험\s*과목|비고|요일|연번|번호|순번|no\.?|확인|서명|인|횟수|계|합계)$/i;
/** 표 왼쪽 위에 놓이는 말. 이 말 옆의 칸이 날짜나 교시면 칸이 하나여도 머리글이다 */
const LEFT_HEAD_RE = /^(날짜|일자|일시|월일|시험일|고사일|교시|시간|시각|구분|종류|성명|이름|교사|감독|감독교사|담당|고사실|시험실|교실|장소|학급|반|과목|요일|연번|번호|순번)$/;
/** 사람이 아닌 줄의 왼쪽 칸 */
const SKIP_ROW_RE = /^(계|합계|소계|비고|확인|결재|서명|인|과목|교과|시험\s*과목|교장|교감|부장|담당)$/;
const MARK_WORD = '정감독|부감독|주감독|보조감독|보조|정|부|주';
const MARK_ONLY_RE = new RegExp(`^(?:${MARK_WORD})$`);
/** 낱말 하나로 된 정·부 표시: "정", "(부)", "정:" */
const MARK_TOKEN_RE = new RegExp(`^[(（[]?(${MARK_WORD})[)）\\]:：.]?$`);
const MARK_FRONT_RE = new RegExp(`^[(（[]?\\s*(${MARK_WORD})\\s*[)）\\]:：.]\\s*(.+)$`);
const MARK_TAIL_RE = new RegExp(`^(.+?)\\s*[(（[]\\s*(${MARK_WORD})\\s*[)）\\]]$`);
const PERIOD_HEAD_RE = /^(교시|시간)$/;
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
  '독서', '문학', '작문', '화법', '언어', '매체', '미적분', '기하', '확률', '통계', '한국사', '세계사', '동아시아사', '통합사회', '통합과학',
  '공통국어', '공통수학', '공통영어', '영어회화', '기술가정', '보건', '환경', '선생님', '선생', '쌤', '시험', '고사', '지필', '평가', '지필평가',
  '수행평가', '중간고사', '기말고사', '중간', '기말', '감독표', '배정표', '배치표', '감독자', '감독교사', '정감독자', '부감독자', '결재', '교장',
  '교감', '부장', '확인', '서명', '작성', '유의', '유의사항', '대기', '자습', '학급', '담임', '과목', '교과', '시정', '일차', '기간', '담당교사',
]);
const SURNAMES = new Set([...'김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구나민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용']);
const LONG_SURNAMES = ['남궁', '황보', '제갈', '선우', '서문', '독고', '사공'];
/** 칸의 표시만 있는 경우: 이름 행렬에서 그 시간에 들어간다는 뜻 */
const MARK_RE = /^[○◯●oOvV✓√※*]$/;

const ROOM_RE = /(\d\s*-\s*\d|\d\s*학년|\d\s*반|\d\s*층|\d+\s*실|[가-힣]+실$|[가-힣]+관$|[가-힣]+반$)/;
/** 머리글이나 왼쪽 칸 전체가 고사실인 말 */
const ROOM_HEAD_RE = /^(?:\d\s*-\s*\d{1,2}|제?\s*\d+\s*(?:고사실|시험실|실)|\d\s*학년(?:\s*\d{1,2}\s*반)?|\d{1,2}\s*반|\d{3}\s*호?|[가-힣A-Za-z0-9]{1,8}(?:실|관|강당)|(?:복도|본부|대기|예비)(?:감독)?(?:\s*\d)?|[1-9]층)$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateText(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  return { date: dateText(date), rest };
}

/** "16(월)"은 요일이 맞는 가장 가까운 달로 읽는다 */
function readDayWithWeekday(text: string, base: Date): DateHit | null {
  const match = text.match(DAY_WEEKDAY_RE);
  if (!match) return null;
  const day = Number(match[1]);
  const weekday = '일월화수목금토'.indexOf(match[2]);
  for (const offset of [0, 1, -1, 2, -2, 3, -3, 4, 5, 6]) {
    const candidate = new Date(base.getFullYear(), base.getMonth() + offset, day);
    if (candidate.getDate() === day && candidate.getDay() === weekday) {
      return { date: dateText(candidate), rest: text.slice(match[0].length).trim() };
    }
  }
  return null;
}

/** 머리글과 왼쪽 칸의 날짜를 읽는다. 앞에 "1일차" 같은 말이나 기호가 있어도 된다 */
function readLooseDate(cell: string, base: Date): DateHit | null {
  const text = cell.trim();
  if (!text) return null;
  const direct = readDate(text, base) ?? readDayWithWeekday(text, base);
  if (direct) return { ...direct, rest: direct.rest.replace(REST_EDGE_RE, '') };
  const stripped = text.replace(DATE_PREFIX_RE, '');
  if (stripped === text) return null;
  const hit = readDate(stripped, base) ?? readDayWithWeekday(stripped, base);
  return hit && { ...hit, rest: hit.rest.replace(REST_EDGE_RE, '') };
}

/** 글 안의 날짜를 모두 찾는다 */
function datesInside(text: string, base: Date): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(DATE_INSIDE_RE)) {
    const hit = readDate(match[0], base);
    if (hit) found.add(hit.date);
  }
  return [...found];
}

interface When {
  periods: number[];
  startMin: number | null;
  endMin: number | null;
}

function periodsOf(expr: string): number[] {
  const range = expr.match(/^(\d{1,2})\s*[~∼〜\-]\s*(\d{1,2})$/);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    if (to >= from && to - from < 10) return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return [...expr.matchAll(/\d{1,2}/g)].map((m) => Number(m[0]));
}

/** "2교시", "1,2교시", "1~3교시", "1교시(국어)", "1교시 09:00~09:45", "17:00~21:00", "오후 5시~9시" */
function readWhen(cell: string): When | null {
  const text = cell.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const period = text.match(PERIOD_IN_RE);
  const time = text.match(TIME_RANGE_RE);
  if (period || time) {
    const rest = text.replace(PERIOD_IN_RE, '').replace(TIME_RANGE_RE, '').replace(/[()（）[\]\s,·:：]|^제/g, '');
    if (rest.length <= 10) {
      const startMin = time ? Number(time[1]) * 60 + Number(time[2]) : null;
      const endMin = time ? Number(time[3]) * 60 + Number(time[4]) : null;
      return { periods: period ? periodsOf(period[1]) : [], startMin, endMin };
    }
  }
  if (TIME_HINT_RE.test(text) && !/[가-힣]{2,}/.test(text.replace(/오전|오후|부터|까지/g, ''))) {
    const found = findTime(text, new Map());
    if (found) return { periods: [], startMin: found.startMin, endMin: found.endMin ?? found.startMin + 60 };
  }
  return null;
}

function mergeWhen(upper: When | null | undefined, lower: When | null | undefined): When | null {
  if (!upper) return lower ?? null;
  if (!lower) return upper;
  return {
    periods: lower.periods.length ? lower.periods : upper.periods,
    startMin: lower.startMin ?? upper.startMin,
    endMin: lower.endMin ?? upper.endMin,
  };
}

function cleanName(cell: string): { name: string; mark: string } {
  let text = cell.trim();
  let mark = '';
  const front = text.match(MARK_FRONT_RE);
  if (front) {
    mark = front[1];
    text = front[2];
  }
  const tagged = text.match(MARK_TAIL_RE);
  if (tagged) {
    text = tagged[1];
    mark = tagged[2];
  }
  // "김철수(국어)"처럼 이름 뒤의 설명과 앞뒤 기호를 뗀다
  text = text.replace(/\s*[(（[][^)）\]]*[)）\]]\s*$/, '');
  text = text.replace(/^[○◯●◎◇◆□■※*★☆▶·•\-]+/, '').replace(/[*※①-⑳]+$/, '').replace(/(?<=[가-힣])\d+$/, '');
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

function isRoomHead(cell: string): boolean {
  const text = cell.trim();
  return !!text && !LEFT_HEAD_RE.test(text) && ROOM_HEAD_RE.test(text);
}

function namesIn(cell: string, known: Set<string>, strict: boolean): Array<{ name: string; mark: string }> {
  const out: Array<{ name: string; mark: string }> = [];
  const parts = cell.split(/[,/·、;\n]|\s+및\s+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    let pending = '';
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i];
      const markToken = token.match(MARK_TOKEN_RE);
      if (markToken && !known.has(token)) {
        pending = markToken[1];
        continue;
      }
      // 한글 문서에서 흔한 "김 철 수", "김 철수"처럼 띄어 쓴 이름을 잇는다
      if (/^[가-힣]$/.test(token)) {
        let next = i + 1;
        while (next < tokens.length && /^[가-힣]$/.test(tokens[next]) && token.length < 4) token += tokens[next++];
        if (token.length === 1 && next < tokens.length && /^[가-힣]{2,3}$/.test(tokens[next]) && hasSurname(token)) token += tokens[next++];
        i = next - 1;
      }
      if (isNameLike(token, known, strict)) {
        const person = cleanName(token);
        out.push({ name: person.name, mark: person.mark || pending });
        pending = '';
      }
    }
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
    .replace(/(20\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/g, '$1.$2.$3')
    .replace(/(?<![\d.\-])(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?(?=\s*(?:[(（]|[일월화수목금토]요일|$|\s))/g, '$1/$2')
    .replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, '$1월$2일')
    .replace(/(\d{1,2})\s*교시/g, '$1교시')
    .replace(/(\d)\s*학년\s*(\d{1,2})\s*반/g, '$1학년$2반')
    .replace(/(오전|오후)\s+(\d)/g, '$1$2')
    .replace(/\s*[(（]\s*([일월화수목금토])(?:요일)?\s*[)）]/g, '($1)')
    .replace(/(\d{1,2}:\d{2})\s*[~∼〜\-–—]\s*(\d{1,2}:\d{2})/g, '$1~$2')
    .replace(/(\d{1,2}시(?:\s*\d{1,2}분)?)\s*[~∼〜\-–—]\s*((?:오전|오후)?\d{1,2}시)/g, '$1~$2')
    .replace(/(\d)\s*([,~∼〜])\s*(\d)교시/g, '$1$2$3교시')
    .replace(/(\d)\s*-\s*(\d{1,2})(?![\d:])/g, '$1-$2');
}

/** 엑셀에서 복사한 글을 칸으로 나눈다. 칸 안에 줄바꿈이 있으면 큰따옴표로 묶여 온다 */
function parseTabbed(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch === '\n' || ch === '\r' ? ' ' : ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  // 따옴표가 닫히지 않았으면 칸을 묶은 따옴표가 아니다
  if (quoted) return text.split(/\r?\n/).map((line) => line.split('\t'));
  row.push(cell);
  rows.push(row);
  return rows;
}

function splitLines(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hasTab = lines.some((l) => l.includes('\t'));
  if (hasTab) {
    return parseTabbed(text)
      .map((cells) => cells.map((c) => tidyLine(c).trim()))
      .filter((cells) => cells.some(Boolean));
  }
  const hasPipe = lines.some((l) => l.includes('|'));
  return lines.map((raw) => {
    const line = tidyLine(raw);
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
    // "1교시 09:00~09:45 2교시 10:05~10:50"은 교시와 시각을 한 칸으로 묶는다
    const merged: string[] = [];
    for (const token of trimmed.split(/\s+/)) {
      if (TIME_RANGE_RE.test(token) && merged.length > 0 && /교시$/.test(merged[merged.length - 1])) {
        merged[merged.length - 1] += ` ${token}`;
      } else {
        merged.push(token);
      }
    }
    return merged;
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

interface Axis {
  date?: string;
  when?: When;
  room?: string;
}

interface MatrixHead {
  columns: Map<number, Axis>;
  /** 데이터가 시작하는 열. 그 왼쪽은 줄 머리다 */
  first: number;
  dataFrom: number;
  /** 머리글 줄의 왼쪽 칸 글 ("교시", "구분" 등) */
  leftHeads: string[];
  /** 머리글 줄 왼쪽에 적힌 날짜 */
  date: string | null;
}

function axisOf(cell: string, base: Date): Axis | null {
  const text = cell.trim();
  if (!text) return null;
  const date = readLooseDate(text, base);
  if (date) return { date: date.date, when: readWhen(date.rest) ?? undefined };
  const when = readWhen(text);
  if (when) return { when };
  if (isRoomHead(text)) return { room: text.replace(/\s+/g, ' ') };
  return null;
}

function mergeAxis(upper: Axis | undefined, lower: Axis): Axis {
  return {
    date: lower.date ?? upper?.date,
    when: mergeWhen(upper?.when, lower.when) ?? undefined,
    room: upper?.room && lower.room ? `${upper.room} ${lower.room}` : lower.room ?? upper?.room,
  };
}

/** 이 줄이 표의 머리글이면 열의 뜻을 돌려준다 */
function readMatrixHead(rows: string[][], start: number, base: Date, known: Set<string>): MatrixHead | null {
  const row = rows[start];
  const axes = row.map((cell) => axisOf(cell, base));
  // 이름이 보이면 머리글이 아니라 데이터 줄이다
  if (row.some((cell, col) => cell && !axes[col] && isNameLike(cell, known))) return null;

  const timeCols = axes.flatMap((axis, col) => (axis && (axis.date || axis.when) ? [col] : []));
  const roomCols = axes.flatMap((axis, col) => (axis?.room ? [col] : []));
  const labelled = LEFT_HEAD_RE.test((row[0] ?? '').trim());

  let first: number;
  let byRoom = false;
  if (roomCols.length >= 2 && roomCols.length >= timeCols.length) {
    first = roomCols[0];
    byRoom = true;
  } else if (timeCols.length >= 2 || (labelled && timeCols.length >= 1)) {
    first = timeCols[0];
  } else {
    return null;
  }
  if (first === 0) return null; // 줄 머리가 없으면 표가 아니라 목록의 한 줄이다

  // 날짜 칸이 바로 아래 줄에도 있으면 머리글이 아니라 날짜가 여럿 적힌 목록이다
  const below = rows[start + 1] ?? [];
  const dateCols = timeCols.filter((col) => axes[col]?.date && col >= first);
  if (dateCols.length > 0 && dateCols.every((col) => readLooseDate(below[col] ?? '', base))) return null;

  let columns = new Map<number, Axis>();
  row.forEach((cell, col) => {
    if (col < first) return;
    const text = cell.trim();
    if (byRoom) {
      // 고사실 표에서는 "시청각"처럼 모르는 말도 장소다. 비고 같은 열만 뺀다
      if (!text || IGNORE_HEADER_RE.test(text) || WHEN_HEADER_RE.test(text) || DATE_HEADER_RE.test(text)) return;
      columns.set(col, axes[col]?.room ? { room: axes[col]!.room } : { room: text });
    } else if (axes[col] && (axes[col]!.date || axes[col]!.when)) {
      columns.set(col, axes[col]!);
    }
  });

  // 아래 줄에 교시나 반이 이어지면 합친다. 병합된 칸은 빈칸으로 오므로 앞 칸을 잇는다.
  let dataFrom = start + 1;
  for (let level = 0; level < 2 && dataFrom < rows.length; level++) {
    const sub = rows[dataFrom];
    const subAxes = new Map<number, Axis>();
    sub.forEach((cell, col) => {
      const axis = col >= first ? axisOf(cell, base) : null;
      if (axis) subAxes.set(col, axis);
    });
    if (subAxes.size === 0) break;
    if (sub.some((cell, col) => cell && !subAxes.has(col) && isNameLike(cell, known))) break;
    if (sub.slice(0, first).some((cell) => cell.trim() && !LEFT_HEAD_RE.test(cell.trim()))) break;
    const merged = new Map<number, Axis>();
    let carry: Axis | undefined;
    const last = Math.max(sub.length, ...[...columns.keys()].map((col) => col + 1));
    for (let col = first; col < last; col++) {
      const upper = columns.get(col);
      if (upper) carry = upper;
      const lower = subAxes.get(col);
      if (lower) merged.set(col, mergeAxis(carry, lower));
      else if (upper) merged.set(col, upper);
    }
    columns = merged;
    dataFrom += 1;
  }
  if (columns.size === 0 || dataFrom >= rows.length) return null;

  const leftDate = axes.slice(0, first).find((axis) => axis?.date)?.date ?? null;
  return { columns, first, dataFrom, leftHeads: row.slice(0, first).map((c) => c.trim()), date: leftDate };
}

/** 표 앞에 있는 날짜 줄이면 그 날짜를 돌려준다 */
function sectionDate(rows: string[][], index: number, base: Date, known: Set<string>): string | null {
  const filled = rows[index].filter((c) => c.trim());
  if (filled.length === 0 || filled.length > 3) return null;
  const text = filled.join(' ');
  if (text.length > 40 || /[~∼〜]|작성|결재|제출|공고|배부|인쇄|기간/.test(text)) return null;
  const dates = datesInside(text, base);
  const day = dates.length === 0 ? readLooseDate(text, base)?.date : null;
  if (dates.length > 1 || (dates.length === 0 && !day)) return null;
  const date = dates[0] ?? day!;
  if (filled.length === 1) {
    const rest = text.replace(DATE_INSIDE_RE, ' ').replace(/[(（]\s*[일월화수목금토](?:요일)?\s*[)）]/g, ' ');
    return namesIn(rest, known, true).length > 0 ? null : date;
  }
  // 칸이 여럿이면 바로 아래가 머리글일 때만 날짜 줄이다
  return index + 1 < rows.length && readMatrixHead(rows, index + 1, base, known) ? date : null;
}

/** 칸에 고사실이나 교시, 표시가 적힌 교사별 표의 한 칸 */
function personCellEntries(cell: string): Array<{ when: When | null; place: string; mark: string }> {
  if (MARK_RE.test(cell.trim())) return [{ when: null, place: '', mark: '' }];
  return cell.split(/[,、;\n]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const { name: text, mark } = cleanName(part);
    if (MARK_ONLY_RE.test(part)) return { when: null, place: '', mark: part };
    const when = readWhen(text);
    const place = when ? text.replace(PERIOD_IN_RE, '').replace(TIME_RANGE_RE, '').replace(/[()（）]/g, '').trim() : text;
    return { when, place, mark };
  });
}

function parseMatrix(
  rows: string[][],
  defaultKind: string,
  known: Set<string>,
  base: Date,
  out: Collector,
  skipped: string[],
): DutyTableShape {
  let head: MatrixHead | null = null;
  let section: string | null = null;
  let left: string[] = [];
  let shape: DutyTableShape = 'none';

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const nextHead = readMatrixHead(rows, index, base, known);
    if (nextHead) {
      head = nextHead;
      if (nextHead.date) section = nextHead.date;
      left = [];
      index = nextHead.dataFrom - 1;
      continue;
    }
    const nextSection = sectionDate(rows, index, base, known);
    if (nextSection) {
      section = nextSection;
      head = null;
      continue;
    }
    if (!head) continue;

    const source = row.filter(Boolean).join(' ');
    // 병합된 왼쪽 칸은 빈칸으로 온다. 앞 칸이 바뀌면 그 뒤 칸의 값은 잇지 않는다.
    for (let col = 0; col < head.first; col++) {
      const value = (row[col] ?? '').trim();
      if (value) {
        left[col] = value;
        left.length = col + 1;
      }
    }
    if (left.some((label) => label && SKIP_ROW_RE.test(label))) continue;

    let rowDate: string | null = null;
    let rowWhen: When | null = null;
    let rowKind = '';
    let rowPlace = '';
    let person: { name: string; mark: string } | null = null;
    const others: string[] = [];
    for (let col = 0; col < head.first; col++) {
      const label = left[col];
      if (!label) continue;
      const leftHead = head.leftHeads[col] ?? '';
      if (IGNORE_HEADER_RE.test(leftHead)) continue;
      const date = readLooseDate(label, base);
      if (date) {
        rowDate = date.date;
        rowWhen = mergeWhen(rowWhen, readWhen(date.rest));
        continue;
      }
      const when = readWhen(label) ?? (PERIOD_HEAD_RE.test(leftHead) && /^\d{1,2}$/.test(label)
        ? { periods: [Number(label)], startMin: null, endMin: null }
        : null);
      if (when) {
        rowWhen = mergeWhen(rowWhen, when);
        continue;
      }
      if (MARK_ONLY_RE.test(label)) {
        rowKind = kindOfMark(label, defaultKind);
        continue;
      }
      if (KIND_HEADER_RE.test(leftHead)) {
        rowKind = label;
        continue;
      }
      if (isRoomHead(label) || PLACE_HEADER_RE.test(leftHead)) {
        rowPlace = rowPlace ? `${rowPlace} ${label}` : label;
        continue;
      }
      if (isNameLike(label, known)) {
        person = cleanName(label);
        continue;
      }
      others.push(label);
    }

    let found = 0;
    for (const [col, axis] of head.columns) {
      const cell = (row[col] ?? '').trim();
      if (!cell) continue;
      const date = axis.date ?? rowDate ?? section;
      if (!date) continue;
      const when = mergeWhen(rowWhen, axis.when);
      const place = axis.room ?? (rowPlace || others.join(' '));
      if (person && !isNameLike(cell, known)) {
        for (const entry of personCellEntries(cell)) {
          out.add({
            date,
            when: mergeWhen(when, entry.when),
            name: person.name,
            kind: kindOfMark(person.mark || entry.mark, rowKind || defaultKind),
            place: axis.room ?? entry.place,
            source,
          });
          found += 1;
        }
        continue;
      }
      for (const name of namesIn(cell, known, false)) {
        out.add({ date, when, name: name.name, kind: kindOfMark(name.mark, rowKind || defaultKind), place, source });
        found += 1;
      }
    }
    // 칸이 하나뿐인 줄은 표 아래의 안내문이다
    if (found === 0 && row.filter(Boolean).length > 1) skipped.push(source);
    if (found > 0) {
      const axes = [...head.columns.values()];
      shape = axes.some((a) => a.date) ? 'date-columns' : axes.some((a) => a.room) ? 'room-columns' : 'period-columns';
    }
  }
  return shape;
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

/** 머리글을 찾을 때 볼 줄 수. 제목과 결재 칸이 위에 몇 줄 있어도 된다 */
const HEAD_SEARCH_ROWS = 14;

function headerColumns(rows: string[][], known: Set<string>, base: Date): ListColumns | null {
  for (let top = 0; top < Math.min(rows.length, HEAD_SEARCH_ROWS); top++) {
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
      const whenCell = (row[columns.when] ?? '').trim();
      const hit = readWhen(whenCell) ?? (/^\d{1,2}$/.test(whenCell) ? { periods: [Number(whenCell)], startMin: null, endMin: null } : null);
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

  const shape = parseMatrix(rows, defaultKind, known, base, out, skipped);
  if (out.rows.length > 0) return { rows: out.rows, skipped, shape };
  skipped.length = 0;

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

/**
 * 쪽지나 공문을 붙여 넣으면 날짜가 있는 줄을 찾아 일정 초안을 만든다.
 *
 * PC 안에서 규칙으로만 처리하고 어디로도 보내지 않는다. 원문은 저장하지 않는다.
 * 틀릴 수 있으므로 저장 전에 교사가 고치고 고르는 초안으로만 쓴다.
 */

export interface ParsedDraft {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** 어느 줄에서 찾았는지 (확인용) */
  source: string;
  /** 이미 지난 날짜면 true. 기본으로 선택하지 않는다 */
  past: boolean;
}

const WEEKDAY_INDEX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

/** 날짜 뒤에 붙는 "(목)", "(목요일)" */
const DOW = String.raw`(?:\s*[(（]\s*[일월화수목금토](?:요일)?\s*[)）])?`;
/** 날짜 하나: 2026년 11월 12일, 2026.11.12., 11월 12일, 11.12., 11/12 */
const FULL = String.raw`(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?\.?`;
const MD_KOR = String.raw`(\d{1,2})\s*월\s*(\d{1,2})\s*일`;
/** 숫자 뒤에 단위가 붙으면 날짜가 아니다: 95.5%, 10.5점, 1.5시간 */
const NOT_UNIT = String.raw`(?![\d/%]|점|배|명|개|원|시간|학점|회|세|kg|km|cm|mm)`;
const MD_NUM = String.raw`(?<![\d.\-/])(\d{1,2})\s*[./]\s*(\d{1,2})${NOT_UNIT}\.?`;
const DATE_RE = new RegExp(String.raw`${FULL}${DOW}|${MD_KOR}${DOW}|${MD_NUM}${DOW}`, 'g');
/** 범위를 잇는 말 */
const RANGE_SEP = String.raw`\s*[~∼〜\-–—]\s*|\s*부터\s*`;
const RANGE_ONLY_RE = new RegExp(String.raw`^(?:${RANGE_SEP})$`);
/** 범위 뒤쪽이 일만 있는 표현: "11월 16일~18일" */
const TAIL_DAY_RE = new RegExp(String.raw`^(?:${RANGE_SEP})(\d{1,2})\s*일${DOW}`);

/** 내일모레가 내일로 읽히지 않도록 긴 말부터 본다 */
const REL_WORDS: Array<[RegExp, number]> = [[/내일\s*모레|모레/, 2], [/내일/, 1], [/오늘/, 0]];
const WEEK_WORD_RE = /(이번\s*주|금주|다음\s*주|차주|담주)\s*([일월화수목금토])요일/;
const BARE_WEEKDAY_RE = /([일월화수목금토])요일/;
const DAY_ONLY_RE = /(?<![\d.\-/월])(\d{1,2})\s*일\s*(?:\(\s*[일월화수목금토](?:요일)?\s*\)\s*)?(?=까지|마감|오전|오후|\d{1,2}시)/;

const TIME_COLON_RANGE_RE = /(오전|오후)?\s*(\d{1,2}):(\d{2})\s*[~∼〜\-–—]\s*(오전|오후)?\s*(\d{1,2}):(\d{2})/;
const TIME_KOR_RANGE_RE = /(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*[~∼〜\-–—]\s*(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/;
const TIME_COLON_RE = /(오전|오후)?\s*(\d{1,2}):(\d{2})/;
const TIME_KOR_RE = /(오전|오후)?\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/;
const PERIOD_RE = /(\d)\s*교시/;

/** 줄 머리표: 1. 2) (3) 가. ① - * • */
const BULLET_RE = /^(?:\s*(?:\d{1,2}[.)](?!\d)|\(\d{1,2}\)|[가-힣][.)]|[①-⑳]|[-–—*•·○●◦◎□■▶▷▪※☞>#]+))+\s*/;
/** 때를 가리키는 말만 남으면 머리말이 곧 제목이다 */
const WHEN_ONLY_RE = /^(일시|일자|일정|날짜|때|시간|기간|행사일)?$/;
/** 머리말과 합쳐야 무슨 일인지 알 수 있는 말 */
const NEEDS_HEADING_RE = /^(마감|마감일|제출|제출일|제출\s*기한|기한|신청|신청\s*기간|신청\s*기한|접수|접수\s*기간|입력|입력\s*기간|운영|운영\s*기간)$/;
const MAX_TITLE = 40;

function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day ? d : null;
}

/** 연도 없는 날짜의 연도: 두 달 넘게 지났으면 내년 일정으로 본다 */
function guessYear(month: number, day: number, base: Date): number {
  const thisYear = makeDate(base.getFullYear(), month, day);
  if (!thisYear) return base.getFullYear();
  const twoMonthsAgo = new Date(base.getFullYear(), base.getMonth() - 2, base.getDate());
  return thisYear < twoMonthsAgo ? base.getFullYear() + 1 : base.getFullYear();
}

interface FoundDate {
  date: Date;
  end?: Date;
  /** 줄에서 날짜 표현이 차지하는 위치 */
  from: number;
  to: number;
}

function startOfDay(base: Date, addDays = 0): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + addDays);
}

function findNumericDates(line: string, base: Date): FoundDate[] {
  const out: FoundDate[] = [];
  const re = new RegExp(DATE_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    // 시각이나 더 긴 숫자의 일부는 날짜가 아니다
    const before = line.slice(Math.max(0, m.index - 1), m.index);
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (/[\d:]/.test(before) || /[\d:]/.test(after)) continue;

    let date: Date | null = null;
    if (m[1]) {
      date = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    } else if (m[4]) {
      date = makeDate(guessYear(Number(m[4]), Number(m[5]), base), Number(m[4]), Number(m[5]));
    } else if (m[6]) {
      // "1.5"처럼 한 자리끼리 점으로 이어지고 뒤에 점도 요일도 없으면 소수로 본다. "1.5."와 "1.5(월)"은 날짜다.
      if (/^\d\s*\.\s*\d$/.test(m[0].trim())) continue;
      date = makeDate(guessYear(Number(m[6]), Number(m[7]), base), Number(m[6]), Number(m[7]));
    }
    if (date) out.push({ date, from: m.index, to: m.index + m[0].length });
  }

  // 범위 합치기: 앞 날짜 바로 뒤에 "~ 다음 날짜"가 오면 하나의 기간으로 본다
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (RANGE_ONLY_RE.test(line.slice(a.to, b.from)) && b.date >= a.date) {
      a.end = b.date;
      a.to = b.to;
      out.splice(i + 1, 1);
    }
  }
  // "11월 16일~18일"처럼 뒤쪽이 일만 있는 범위
  for (const found of out) {
    if (found.end) continue;
    const tail = line.slice(found.to).match(TAIL_DAY_RE);
    if (!tail) continue;
    const end = makeDate(found.date.getFullYear(), found.date.getMonth() + 1, Number(tail[1]));
    if (end && end >= found.date) {
      found.end = end;
      found.to += tail[0].length;
    }
  }
  return out;
}

/** 숫자 날짜가 없을 때만 본다: 다음 주 금요일, 내일, 12일까지, 금요일까지 */
function findRelativeDate(line: string, base: Date): FoundDate | null {
  const at = (match: RegExpMatchArray, date: Date): FoundDate => ({
    date,
    from: match.index ?? 0,
    to: (match.index ?? 0) + match[0].length,
  });

  const weekWord = line.match(WEEK_WORD_RE);
  if (weekWord) {
    const nextWeek = /다음|차주|담주/.test(weekWord[1]);
    const toMonday = -((base.getDay() + 6) % 7);
    const fromMonday = (WEEKDAY_INDEX[weekWord[2]] + 6) % 7;
    return at(weekWord, startOfDay(base, toMonday + fromMonday + (nextWeek ? 7 : 0)));
  }
  for (const [re, days] of REL_WORDS) {
    const word = line.match(re);
    if (word) return at(word, startOfDay(base, days));
  }
  const dayOnly = line.match(DAY_ONLY_RE);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    let date = makeDate(base.getFullYear(), base.getMonth() + 1, day);
    if (date && date < startOfDay(base)) date = makeDate(base.getFullYear(), base.getMonth() + 2, day);
    if (date) return at(dayOnly, date);
  }
  const bare = line.match(BARE_WEEKDAY_RE);
  if (bare) {
    const ahead = (WEEKDAY_INDEX[bare[1]] - base.getDay() + 7) % 7;
    return at(bare, startOfDay(base, ahead));
  }
  return null;
}

function findDates(line: string, base: Date): FoundDate[] {
  const numeric = findNumericDates(line, base);
  if (numeric.length > 0) return numeric;
  const relative = findRelativeDate(line, base);
  return relative ? [relative] : [];
}

function to24(hour: number, ampm: string | undefined): number {
  if (ampm === '오후' && hour < 12) return hour + 12;
  if (ampm === '오전' && hour === 12) return 0;
  // 오전, 오후 표시가 없는 1~6시는 학교 일과상 오후로 본다
  if (!ampm && hour >= 1 && hour <= 6) return hour + 12;
  return hour;
}

function validMinutes(hour: number, minute: number): boolean {
  return hour < 24 && minute < 60;
}

interface FoundTime {
  startMin: number;
  endMin?: number;
  text: string;
}

function rangeTime(
  startAmpm: string | undefined, sh: string, sm: string | undefined,
  endAmpm: string | undefined, eh: string, em: string | undefined,
  text: string,
): FoundTime | null {
  const startHour = to24(Number(sh), startAmpm);
  let endHour = to24(Number(eh), endAmpm ?? startAmpm);
  const startMin = startHour * 60 + Number(sm || 0);
  // "오전 11시~1시"처럼 끝이 시작보다 이르면 오후로 넘어간 것이다
  if (endHour * 60 + Number(em || 0) <= startMin && endHour < 12) endHour += 12;
  if (!validMinutes(startHour, Number(sm || 0)) || !validMinutes(endHour, Number(em || 0))) return null;
  return { startMin, endMin: endHour * 60 + Number(em || 0), text };
}

function findTime(line: string, periodStarts: Map<number, number>): FoundTime | null {
  const colonRange = line.match(TIME_COLON_RANGE_RE);
  if (colonRange) {
    const found = rangeTime(colonRange[1], colonRange[2], colonRange[3], colonRange[4], colonRange[5], colonRange[6], colonRange[0]);
    if (found) return found;
  }
  const korRange = line.match(TIME_KOR_RANGE_RE);
  if (korRange) {
    const found = rangeTime(korRange[1], korRange[2], korRange[3], korRange[4], korRange[5], korRange[6], korRange[0]);
    if (found) return found;
  }
  const colon = line.match(TIME_COLON_RE);
  if (colon) {
    const h = to24(Number(colon[2]), colon[1]);
    if (validMinutes(h, Number(colon[3]))) return { startMin: h * 60 + Number(colon[3]), text: colon[0] };
  }
  const kor = line.match(TIME_KOR_RE);
  if (kor) {
    const h = to24(Number(kor[2]), kor[1]);
    const min = kor[4] ? 30 : Number(kor[3] || 0);
    if (validMinutes(h, min)) return { startMin: h * 60 + min, text: kor[0] };
  }
  const period = line.match(PERIOD_RE);
  if (period) {
    const start = periodStarts.get(Number(period[1]));
    if (start !== undefined) return { startMin: start, text: period[0] };
  }
  return null;
}

/** 날짜·시각을 뺀 나머지에서 머리표와 꾸밈을 지운 글 */
function cleanTitle(text: string): string {
  return text
    .trim()
    .replace(BULLET_RE, '')
    .replace(/\s*(까지|부터)\s*/g, ' ')
    .replace(/[()（）[\]【】<>「」『』:：~∼〜,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(text: string): string {
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text;
}

function titleFrom(rest: string, heading: string): string {
  if (WHEN_ONLY_RE.test(rest)) return heading || rest || '새 일정';
  if (NEEDS_HEADING_RE.test(rest) && heading) {
    // "성적 입력" + "입력 기간"이 "성적 입력 입력 기간"이 되지 않게 겹치는 말을 뺀다
    const lastWord = heading.split(' ').pop();
    const words = rest.split(/\s+/);
    return `${heading} ${(words[0] === lastWord && words.length > 1 ? words.slice(1) : words).join(' ')}`;
  }
  return rest;
}

function periodStartsOf(classTimes: string[]): Map<number, number> {
  const periodStarts = new Map<number, number>();
  classTimes.forEach((entry, i) => {
    const m = entry.match(/(\d{1,2}):(\d{2})/);
    if (m) periodStarts.set(i + 1, Number(m[1]) * 60 + Number(m[2]));
  });
  return periodStarts;
}

/**
 * 칸에 바로 입력한 글에서 시각을 뽑는다. "3시 회의", "3교시 공개수업", "회의"
 * @returns startMin이 null이면 시각이 없는 종일 일정이다
 */
export function parseInlineTitle(
  text: string,
  classTimes: string[] = [],
): { title: string; startMin: number | null; endMin: number | null } {
  const time = findTime(text, periodStartsOf(classTimes));
  if (!time) return { title: text.trim(), startMin: null, endMin: null };
  const title = cleanTitle(text.replace(time.text, ' ')) || text.trim();
  return { title, startMin: time.startMin, endMin: time.endMin ?? time.startMin + 60 };
}

/**
 * @param classTimes 컴시간 교시 시각 ("1교시(09:00)"). "3교시" 같은 표현을 시각으로 바꾸는 데 쓴다.
 */
export function parseEventDrafts(text: string, base: Date = new Date(), classTimes: string[] = []): ParsedDraft[] {
  if (!text || !text.trim()) return [];
  const periodStarts = periodStartsOf(classTimes);

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // 제목 후보: 날짜가 없는 첫 줄. "[교무부] 성적 입력 안내" 같은 쪽지 머리말이다
  const headingLine = lines.find((l) => findDates(l, base).length === 0);
  // 앞의 [교무부] 같은 부서 표시와 끝의 "안내"는 일정 이름에 필요 없다
  const heading = headingLine
    ? cleanTitle(headingLine.replace(/^\s*[[【<〈(][^\]】>〉)]{1,10}[\]】>〉)]\s*/, '')).replace(/\s*안내\s*$/, '')
    : '';

  const today = startOfDay(base);
  const drafts: ParsedDraft[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const dates = findDates(line, base);
    if (dates.length === 0) continue;

    // 날짜가 있는 범위를 시각 찾기에서 빼서 "11.16."의 숫자가 시각으로 읽히지 않게 한다
    const withoutDates = dates.reduceRight(
      (acc, d) => acc.slice(0, d.from) + ' '.repeat(d.to - d.from) + acc.slice(d.to),
      line,
    );
    const time = findTime(withoutDates, periodStarts);
    const withoutTime = time ? withoutDates.replace(time.text, ' '.repeat(time.text.length)) : withoutDates;

    dates.forEach((found, index) => {
      // 한 줄에 날짜가 여럿이면 각 날짜 앞의 글이 그 일정의 이름이다: "예비소집 11월 18일, 시험 11월 19일"
      const segment = dates.length > 1
        ? cleanTitle(withoutTime.slice(index === 0 ? 0 : dates[index - 1].to, found.from))
        : '';
      const title = shorten(titleFrom(segment || cleanTitle(withoutTime), heading));

      const start = new Date(found.date);
      const end = new Date(found.end ?? found.date);
      if (!time) {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 0, 0);
      } else if (found.end && time.endMin === undefined) {
        // 여러 날에 시각 하나면 마지막 날의 마감이다: "11.16.~11.20. 16:00까지"
        start.setHours(0, 0, 0, 0);
        end.setHours(Math.floor(time.startMin / 60), time.startMin % 60, 0, 0);
      } else {
        const endMin = time.endMin ?? time.startMin + 60;
        start.setHours(Math.floor(time.startMin / 60), time.startMin % 60, 0, 0);
        end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
      }

      const dedupe = `${start.getTime()}|${end.getTime()}|${title}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      drafts.push({
        id: `d${drafts.length}`,
        title,
        start,
        end,
        allDay: !time,
        source: line.length > 80 ? `${line.slice(0, 79)}…` : line,
        past: (found.end ?? found.date) < today,
      });
    });
  }
  return drafts;
}

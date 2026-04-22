/**
 * 자연어 한국어 날짜/시간 파서.
 * 정규식 기반 간단 구현 — 100% 완벽 아님, 자주 쓰이는 패턴만 커버.
 *
 * 지원:
 * - "오늘", "내일", "모레", "글피"
 * - "다음주 월요일", "이번주 금요일"
 * - "N일 후", "N주 후"
 * - "3시", "오후 3시", "15시", "3시 30분", "3:30"
 * - 조합: "내일 3시", "다음주 월요일 오후 2시"
 */

const WEEKDAYS: Record<string, number> = {
  일요일: 0, 일: 0,
  월요일: 1, 월: 1,
  화요일: 2, 화: 2,
  수요일: 3, 수: 3,
  목요일: 4, 목: 4,
  금요일: 5, 금: 5,
  토요일: 6, 토: 6,
};

export interface ParsedDate {
  date: Date;
  hasTime: boolean;
  /** 입력에서 파서가 매치한 부분 — 나머지를 title로 사용 */
  matchedText: string;
}

export function parseNaturalDate(input: string, base: Date = new Date()): ParsedDate | null {
  if (!input || !input.trim()) return null;
  const text = input.trim();
  let date = new Date(base);
  date.setSeconds(0, 0);
  let dateMatched = false;
  let timeMatched = false;
  const matches: string[] = [];

  // 1. 상대 날짜 키워드
  const relMap: [RegExp, number][] = [
    [/오늘/, 0],
    [/내일/, 1],
    [/모레/, 2],
    [/글피/, 3],
  ];
  for (const [re, offset] of relMap) {
    const m = text.match(re);
    if (m) {
      date.setDate(date.getDate() + offset);
      dateMatched = true;
      matches.push(m[0]);
      break;
    }
  }

  // 2. "N일 후" / "N주 후"
  if (!dateMatched) {
    const daysAfter = text.match(/(\d+)\s*일\s*(후|뒤)/);
    if (daysAfter) {
      date.setDate(date.getDate() + Number(daysAfter[1]));
      dateMatched = true;
      matches.push(daysAfter[0]);
    } else {
      const weeksAfter = text.match(/(\d+)\s*주\s*(후|뒤)/);
      if (weeksAfter) {
        date.setDate(date.getDate() + Number(weeksAfter[1]) * 7);
        dateMatched = true;
        matches.push(weeksAfter[0]);
      }
    }
  }

  // 3. "이번주/다음주 + 요일"
  const weekWord = text.match(/(이번주|다음주|담주)\s*(일요일|월요일|화요일|수요일|목요일|금요일|토요일|[일월화수목금토])/);
  if (weekWord) {
    const base = new Date(date);
    const targetDow = WEEKDAYS[weekWord[2]];
    const currentDow = base.getDay();
    let diff = targetDow - currentDow;
    if (weekWord[1] === '다음주' || weekWord[1] === '담주') diff += 7;
    else if (diff < 0) diff += 7; // 이번주 지난 요일 → 이번주로 해석 불가시 다음주
    date = new Date(base);
    date.setDate(date.getDate() + diff);
    dateMatched = true;
    matches.push(weekWord[0]);
  }

  // 4. 시간 파싱
  // "오후 3시", "3시 30분", "15:30", "3:30"
  let amPm: 'am' | 'pm' | null = null;
  const apMatch = text.match(/(오전|오후|AM|PM|am|pm)/);
  if (apMatch) {
    amPm = /오후|PM|pm/.test(apMatch[0]) ? 'pm' : 'am';
  }

  const hmColon = text.match(/(\d{1,2}):(\d{2})/);
  const hmKor = text.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (hmColon) {
    let h = Number(hmColon[1]);
    const m = Number(hmColon[2]);
    if (amPm === 'pm' && h < 12) h += 12;
    if (amPm === 'am' && h === 12) h = 0;
    date.setHours(h, m, 0, 0);
    timeMatched = true;
    matches.push(hmColon[0]);
    if (apMatch) matches.push(apMatch[0]);
  } else if (hmKor) {
    let h = Number(hmKor[1]);
    const m = hmKor[2] ? Number(hmKor[2]) : 0;
    if (amPm === 'pm' && h < 12) h += 12;
    if (amPm === 'am' && h === 12) h = 0;
    date.setHours(h, m, 0, 0);
    timeMatched = true;
    matches.push(hmKor[0]);
    if (apMatch) matches.push(apMatch[0]);
  }

  if (!dateMatched && !timeMatched) return null;

  return {
    date,
    hasTime: timeMatched,
    matchedText: matches.join(' '),
  };
}

/**
 * 입력에서 매치된 날짜/시간 텍스트를 제거하여 순수 제목만 반환.
 */
export function stripDateText(input: string, matchedText: string): string {
  if (!matchedText) return input;
  const parts = matchedText.split(/\s+/);
  let out = input;
  for (const p of parts) {
    out = out.replace(p, '');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 학사일정 제목을 종류와 그림(이모지)으로 나누고, 한 달 화면에 맞게 묶는다.
 * 태성중 홈페이지는 여러 날 일정을 하루씩 따로 올리고(겨울방학, 지필평가), 토요휴업일을 매주 올린다.
 * 이모지는 Windows 10에서도 보이는 것(유니코드 11 이하, 국기 없음)만 쓴다.
 */
import { addDays, differenceInCalendarDays, endOfMonth, format, getDay, parseISO, startOfMonth, isValid } from 'date-fns';

export type SchCat =
  | 'exam' | 'holiday' | 'off' | 'vacation' | 'ceremony' | 'event' | 'trip'
  | 'edu' | 'parent' | 'career' | 'class' | 'club' | 'health' | 'notice' | 'etc';

export interface SchInfo { cat: SchCat; emoji: string }

type Rule = [RegExp, string, SchCat];

const RULES: Rule[] = [
  [/불허/, '🚫', 'notice'],
  [/예비소집/, '📋', 'exam'],
  [/(대학수학능력시험|수능)(?!.*(원서|모의))/, '✏️', 'exam'],
  [/원서/, '📮', 'career'],
  [/(지필|정기시험|고사|학력평가|모의평가|진단평가|성취도|시험)/, '📝', 'exam'],
  [/겨울방학/, '⛄', 'vacation'],
  [/여름방학/, '🏖️', 'vacation'],
  [/방학식/, '🎒', 'ceremony'],
  [/방학$/, '🏖️', 'vacation'],
  [/개학/, '🏫', 'ceremony'],
  [/입학식/, '🌸', 'ceremony'],
  [/졸업앨범/, '📸', 'event'],
  [/졸업/, '🎓', 'ceremony'],
  [/종업/, '🎊', 'ceremony'],
  [/(휴업|재량)/, '💤', 'off'],
  [/신정/, '🎍', 'holiday'],
  [/설날/, '🧧', 'holiday'],
  [/(3·1절|삼일절|3\.1절)/, '🕊️', 'holiday'],
  [/어린이날/, '🎈', 'holiday'],
  [/석가/, '🏮', 'holiday'],
  [/현충일/, '🌼', 'holiday'],
  [/제헌절/, '📜', 'holiday'],
  [/광복절/, '🎆', 'holiday'],
  [/추석/, '🌕', 'holiday'],
  [/개천절/, '🌄', 'holiday'],
  [/한글날/, '🔤', 'holiday'],
  [/(성탄|크리스마스)/, '🎄', 'holiday'],
  [/노동절/, '🛠️', 'holiday'],
  [/대체공휴일/, '🗓️', 'holiday'],
  [/학생회/, '🙋', 'event'],
  [/(지방선거|대통령선거|국회의원선거)/, '🗳️', 'holiday'],
  [/선거/, '🙋', 'event'],
  [/(상담)/, '💬', 'parent'],
  [/(학부모|총회)/, '👪', 'parent'],
  [/(안전교육|안전)/, '⛑️', 'edu'],
  [/(체험학습|수학여행|현장학습|현장체험)/, '🚌', 'trip'],
  [/(발표회|버스킹|공연|음악회)/, '🎤', 'event'],
  [/동아리/, '🎨', 'club'],
  [/(체육|PAPS|스포츠|운동회)/, '🏃', 'event'],
  [/(축제|동천제|한마당|학술제)/, '🎉', 'event'],
  [/캠프/, '⛺', 'edu'],
  [/(훈련|대피|소방|민방위)/, '🚨', 'edu'],
  [/예방/, '🛡️', 'edu'],
  [/심리검사/, '🧠', 'health'],
  [/(건강검진|검사|심폐소생)/, '🏥', 'health'],
  [/봉사/, '🤝', 'event'],
  [/(채플|부활절)/, '⛪', 'event'],
  [/추수감사/, '🌾', 'event'],
  [/(설명회|박람회|진로|입시|컨설팅|사관학교|대학교|멘토링)/, '🧭', 'career'],
  [/(\bAI\b|AI |반도체|과학)/, '🔬', 'edu'],
  [/(책의 날|독서|작가|도서)/, '📖', 'event'],
  [/스승/, '💐', 'event'],
  [/(다문화|세계시민|장애|양성평등)/, '🌏', 'edu'],
  [/(특강|강의|교육|연수|아카데미|탐구|프로젝트)/, '📚', 'edu'],
  [/(수업|시간표|교시|단축|등교|귀가|하교|오전)/, '⏰', 'class'],
  [/(자치|학급)/, '🙋', 'event'],
  [/(행사|날$|기념)/, '🎉', 'event'],
];

export function scheduleInfo(title: string): SchInfo {
  for (const [re, emoji, cat] of RULES) {
    if (re.test(title)) return { cat, emoji };
  }
  return { cat: 'etc', emoji: '📌' };
}

export interface SchSource { startDate: string; endDate: string; title: string; seq: string }

export interface SchItem {
  key: string;
  title: string;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  cat: SchCat;
  emoji: string;
  /** 매주 같은 요일에 되풀이되는 일정(토요휴업일)을 한 줄로 묶은 날들 (그 달의 일) */
  weekly?: number[];
}

function valid(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && isValid(parseISO(d));
}

function isWeekend(d: Date): boolean {
  const w = getDay(d);
  return w === 0 || w === 6;
}

/** 같은 제목이 하루씩 이어지면(주말을 건너뛰어도) 한 일정으로 잇는다 */
export function mergeRuns(events: SchSource[]): SchItem[] {
  const seen = new Set<string>();
  const clean = events
    .filter((e) => valid(e.startDate) && valid(e.endDate || e.startDate))
    .filter((e) => {
      const k = `${e.title}|${e.startDate}|${e.endDate}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((e) => ({ ...e, endDate: e.endDate < e.startDate ? e.startDate : e.endDate }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));

  const out: SchItem[] = [];
  const open = new Map<string, SchItem>();
  for (const e of clean) {
    const prev = open.get(e.title);
    if (prev && !/토요휴업/.test(e.title)) {
      const gapStart = addDays(parseISO(prev.end), 1);
      const next = parseISO(e.startDate);
      const gap = differenceInCalendarDays(next, gapStart);
      let bridge = gap <= 0;
      if (!bridge && gap <= 2) {
        bridge = true;
        for (let i = 0; i < gap; i++) if (!isWeekend(addDays(gapStart, i))) bridge = false;
      }
      if (bridge) {
        if (e.endDate > prev.end) prev.end = e.endDate;
        continue;
      }
    }
    const info = scheduleInfo(e.title);
    const item: SchItem = {
      key: `${e.seq}-${e.startDate}`,
      title: e.title,
      start: e.startDate,
      end: e.endDate,
      cat: info.cat,
      emoji: info.emoji,
    };
    out.push(item);
    open.set(e.title, item);
  }
  return out;
}

export interface MonthPlan {
  year: number;
  month: number; // 1~12
  /** 그 달에 걸친 일정 (시작 순, 매주 되풀이되는 묶음은 맨 뒤) */
  items: SchItem[];
}

/** 한 달 화면에 쓸 일정: 그 달에 걸친 것만, 매주 되풀이되는 휴업일은 한 줄로 묶는다 */
export function planMonth(all: SchItem[], year: number, month: number): MonthPlan {
  const first = startOfMonth(new Date(year, month - 1, 1));
  const last = endOfMonth(first);
  const from = format(first, 'yyyy-MM-dd');
  const to = format(last, 'yyyy-MM-dd');
  const inMonth = all.filter((e) => e.start <= to && e.end >= from);

  const byTitle = new Map<string, SchItem[]>();
  for (const e of inMonth) {
    if (e.start !== e.end) continue;
    const list = byTitle.get(e.title) ?? [];
    list.push(e);
    byTitle.set(e.title, list);
  }
  const grouped = new Set<SchItem>();
  const weeklyItems: SchItem[] = [];
  for (const [title, list] of byTitle) {
    if (list.length < 3) continue;
    const weekday = getDay(parseISO(list[0].start));
    if (!list.every((e) => getDay(parseISO(e.start)) === weekday)) continue;
    const days = list.map((e) => parseISO(e.start).getDate()).sort((a, b) => a - b);
    const group: SchItem = { ...list[0], key: `weekly-${title}`, end: list[list.length - 1].start, weekly: days };
    for (const e of list) grouped.add(e);
    weeklyItems.push(group);
  }
  const items = [...inMonth.filter((e) => !grouped.has(e)), ...weeklyItems]
    .sort((a, b) => (a.weekly ? 1 : 0) - (b.weekly ? 1 : 0) || a.start.localeCompare(b.start));
  return { year, month, items };
}

/** "16일", "16–17일", "29일 ~ 2.28" */
export function rangeLabel(item: SchItem, year: number, month: number): string {
  const s = parseISO(item.start);
  const e = parseISO(item.end);
  const inMonth = (d: Date) => d.getFullYear() === year && d.getMonth() + 1 === month;
  const day = (d: Date) => (inMonth(d) ? `${d.getDate()}일` : `${d.getMonth() + 1}.${d.getDate()}`);
  if (item.weekly) return item.weekly.map((d) => `${d}`).join('·') + '일';
  if (item.start === item.end) return day(s);
  if (inMonth(s) && inMonth(e)) return `${s.getDate()}–${e.getDate()}일`;
  return `${day(s)} ~ ${day(e)}`;
}

/** 그 달을 덮는 주들 (일요일 시작, 7일씩) */
export function monthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month - 1, 1);
  const last = endOfMonth(first);
  const start = addDays(first, -getDay(first));
  const weeks: Date[][] = [];
  for (let d = start; d <= last; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  return weeks;
}

const SEASON = ['📅', '⛄', '🧣', '🌸', '🌷', '🌿', '☔', '🌻', '🍉', '🌾', '🍂', '🍁', '🎄'];

/** 달 제목 옆 계절 그림 */
export function seasonEmoji(month: number): string {
  return SEASON[month] ?? '📅';
}

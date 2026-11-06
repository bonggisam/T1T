/**
 * 컴시간 프로그램에서 저장한 시간표 파일(CSV)을 읽는다. 학교 담당자가 프로그램에서 내보낸 기초 시간표다.
 *
 * 세 가지 모양을 읽는다. 담긴 내용은 같다.
 * - 주간시간표: 줄은 요일과 교시, 칸은 교사. 칸 값은 "204 영II"(학년과 반, 과목 줄임말)
 * - 교사시간표: 교사마다 표 하나. 줄은 교시와 시작 시각, 칸은 요일. 시정표도 여기서 얻는다
 * - 전체시간표: 줄은 학년과 반, 칸은 요일과 교시. 칸 값은 "영II 홍길동"(과목, 교사)
 *
 * 프로그램은 보통 EUC-KR로 저장한다.
 */

export type TimetableFileKind = 'weekly' | 'teacher' | 'whole';

export interface FileLesson {
  name: string;
  /** 1=월 ~ 5=금 */
  weekday: number;
  period: number;
  grade: number;
  classNum: number;
  /** 컴시간의 과목 줄임말. 나이스 이름으로 바꾸기 전이다 */
  subject: string;
}

export interface TimetableFile {
  kind: TimetableFileKind;
  teachers: string[];
  lessons: FileLesson[];
  /** "1(09:00)" 꼴. 교사시간표에만 있다 */
  classTimes: string[];
  warnings: string[];
}

export const TIMETABLE_FILE_LABEL: Record<TimetableFileKind, string> = {
  weekly: '주간시간표',
  teacher: '교사시간표',
  whole: '전체시간표',
};

const WEEKDAYS: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5 };

/** UTF-8이 아니면 EUC-KR로 읽는다 */
export function decodeTimetableFile(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    text = new TextDecoder('euc-kr').decode(data);
  }
  return text.replace(/^﻿/, '');
}

/** CSV 한 줄. 따옴표로 묶은 칸과 그 안의 겹따옴표를 읽는다 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/** "204"는 2학년 4반이다. 학년 한 자리, 반 두 자리 */
function classOf(code: string): { grade: number; classNum: number } | null {
  const match = code.match(/^(\d)(\d{2})$/);
  if (!match) return null;
  const grade = Number(match[1]);
  const classNum = Number(match[2]);
  return grade >= 1 && classNum >= 1 ? { grade, classNum } : null;
}

/** 교사 쪽 칸: "204 영II" */
function lessonCell(value: string): { grade: number; classNum: number; subject: string } | null {
  const match = value.match(/^(\d{3})\s+(\S.*)$/);
  const cls = match ? classOf(match[1]) : null;
  return cls && match ? { ...cls, subject: match[2].trim() } : null;
}

function isTableEnd(row: string[]): boolean {
  return row.length <= 1 && (row[0] ?? '').startsWith(';');
}

function result(kind: TimetableFileKind, teachers: string[], lessons: FileLesson[], classTimes: string[], warnings: string[]): TimetableFile {
  const seen = new Set<string>();
  const unique = lessons.filter((l) => {
    const key = `${l.name}|${l.weekday}|${l.period}|${l.grade}|${l.classNum}|${l.subject}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { kind, teachers: [...new Set(teachers)], lessons: unique, classTimes, warnings };
}

function parseWeekly(rows: string[][], headerAt: number): TimetableFile {
  const header = rows[headerAt].slice(2).map((h) => {
    const match = h.match(/^(.*?)\s*\((\d+)\)$/);
    return { name: (match ? match[1] : h).trim(), hours: match ? Number(match[2]) : null };
  });
  const lessons: FileLesson[] = [];
  let weekday = 0;
  let skipped = 0;
  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isTableEnd(row)) break;
    if (row[0]) weekday = WEEKDAYS[row[0]] ?? 0;
    const period = Number(row[1]);
    if (!weekday || !Number.isInteger(period) || period < 1) continue;
    row.slice(2).forEach((value, j) => {
      if (!value) return;
      const cell = lessonCell(value);
      const teacher = header[j];
      if (!cell || !teacher?.name) { skipped++; return; }
      lessons.push({ name: teacher.name, weekday, period, ...cell });
    });
  }
  const warnings: string[] = [];
  if (skipped > 0) warnings.push(`읽지 못한 칸 ${skipped}개`);
  const counts = new Map<string, number>();
  for (const l of lessons) counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
  const off = header.filter((h) => h.name && h.hours !== null && h.hours !== (counts.get(h.name) ?? 0)).length;
  if (off > 0) warnings.push(`시수가 칸 수와 다른 교사 ${off}명`);
  return result('weekly', header.map((h) => h.name).filter(Boolean), lessons, [], warnings);
}

function parseTeacherBlocks(rows: string[][]): TimetableFile {
  const teachers: string[] = [];
  const lessons: FileLesson[] = [];
  const times = new Map<number, string>();
  let name: string | null = null;
  let days: number[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.length === 1) {
      const title = row[0].match(/^(.+?)\s*시간표$/);
      if (title) {
        name = title[1].trim();
        teachers.push(name);
        days = [];
      }
      continue;
    }
    if (!name) continue;
    if (row[0] === '교시') {
      days = row.slice(1).map((d) => WEEKDAYS[d] ?? 0);
      continue;
    }
    const head = row[0].match(/^(\d{1,2})\s*교시\s*(?:\(\s*(\d{1,2}:\d{2})\s*\))?/);
    if (!head) continue;
    const period = Number(head[1]);
    if (head[2]) times.set(period, head[2].padStart(5, '0'));
    row.slice(1).forEach((value, j) => {
      if (!value) return;
      const weekday = days[j] ?? 0;
      const cell = lessonCell(value);
      if (!cell || !weekday) { skipped++; return; }
      lessons.push({ name: name as string, weekday, period, ...cell });
    });
  }
  // 앱은 시정표를 교시 순서대로 읽는다. 중간에 빈 교시가 있으면 쓰지 않는다
  const last = Math.max(0, ...times.keys());
  const classTimes: string[] = [];
  for (let p = 1; p <= last; p++) {
    const time = times.get(p);
    if (!time) { classTimes.length = 0; break; }
    classTimes.push(`${p}(${time})`);
  }
  const warnings = skipped > 0 ? [`읽지 못한 칸 ${skipped}개`] : [];
  return result('teacher', teachers, lessons, classTimes, warnings);
}

function parseWhole(rows: string[][], headerAt: number): TimetableFile {
  const dayRow = rows[headerAt];
  const periodRow = rows[headerAt + 1] ?? [];
  const columns: Array<{ weekday: number; period: number }> = [];
  let weekday = 0;
  for (let j = 2; j < Math.max(dayRow.length, periodRow.length); j++) {
    if (dayRow[j]) weekday = WEEKDAYS[dayRow[j]] ?? 0;
    columns.push({ weekday, period: Number(periodRow[j]) });
  }
  const lessons: FileLesson[] = [];
  let grade = 0;
  let skipped = 0;
  for (let i = headerAt + 2; i < rows.length; i++) {
    const row = rows[i];
    if (isTableEnd(row)) break;
    if (row[0]) grade = Number(row[0]);
    const classNum = Number(row[1]);
    if (!Number.isInteger(grade) || grade < 1 || !Number.isInteger(classNum) || classNum < 1) continue;
    row.slice(2).forEach((value, j) => {
      if (!value) return;
      const col = columns[j];
      const space = value.lastIndexOf(' ');
      const subject = space > 0 ? value.slice(0, space).trim() : '';
      const name = space > 0 ? value.slice(space + 1).trim() : '';
      if (!col?.weekday || !Number.isInteger(col.period) || col.period < 1 || !subject || !name) { skipped++; return; }
      lessons.push({ name, weekday: col.weekday, period: col.period, grade, classNum, subject });
    });
  }
  const warnings = skipped > 0 ? [`읽지 못한 칸 ${skipped}개`] : [];
  return result('whole', lessons.map((l) => l.name), lessons, [], warnings);
}

/** 컴시간 시간표 파일을 읽는다. 세 모양 중 어느 것도 아니면 null */
export function parseTimetableFile(text: string): TimetableFile | null {
  const rows = text.split(/\r?\n/).map(splitCsvLine);
  const whole = rows.findIndex((r) => r[0] === '학년' && r[1] === '반');
  if (whole >= 0) return parseWhole(rows, whole);
  const weekly = rows.findIndex((r) => r[0] === '요일' && r[1] === '교시');
  if (weekly >= 0) return parseWeekly(rows, weekly);
  const hasTitles = rows.some((r) => r.length === 1 && /\S\s*시간표$/.test(r[0]));
  const hasPeriods = rows.some((r) => r[0] === '교시' && r.includes('월'));
  if (hasTitles && hasPeriods) return parseTeacherBlocks(rows);
  return null;
}

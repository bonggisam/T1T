import type { ComciganSchool, ComciganTeacherSlots } from '../shared/types';

/**
 * 학교 검색 응답을 읽는다. 학교 코드의 열은 줄마다 다르고 나머지 열은 코드가 아니어서,
 * 사이트 페이지가 코드를 찾는 식을 그대로 쓴다: 첫 값 / 6347의 몫 + 2
 */
export function parseSchoolSearch(body: string): ComciganSchool[] {
  const parsed = JSON.parse(body.slice(0, body.lastIndexOf('}') + 1));
  const rows = parsed?.['학교검색'];
  if (!Array.isArray(rows)) throw new Error('학교 검색 응답을 읽지 못했습니다');
  const schools: ComciganSchool[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const code = Number(row[Math.floor(Number(row[0]) / 6347) + 2]);
    if (!Number.isInteger(code) || code <= 0) continue;
    schools.push({ code, region: String(row[1] ?? ''), name: String(row[2] ?? '') });
  }
  return schools;
}

/**
 * comcigan-parser의 전교 시간표에서 교사 표기별 수업 칸만 모은다.
 * 회의 찾기에는 언제 수업이 있는지만 필요하므로 어느 반인지는 넘기지 않는다.
 *
 * 칸에 글자가 하나뿐이면 파서가 과목과 교사에 같은 값을 넣는다. 이때 값은 사람이 아니므로 뺀다.
 */
export function buildTeacherGrid(fullData: any, maxGrade: number): Record<string, ComciganTeacherSlots> {
  const collected = new Map<string, { slots: Set<string>; subjects: Set<string>; grades: Set<number> }>();

  for (let grade = 1; grade <= maxGrade; grade++) {
    const classes = fullData?.[grade];
    if (!classes) continue;
    for (const classKey of Object.keys(classes)) {
      if (Number(classKey) <= 0) continue;
      const week = classes[classKey];
      if (!week) continue;
      for (let dayIdx = 0; dayIdx <= 4; dayIdx++) {
        const cells = week[dayIdx];
        if (!Array.isArray(cells)) continue;
        cells.forEach((cell: any, periodIdx: number) => {
          const label = String(cell?.teacher ?? '').trim();
          const subject = String(cell?.subject ?? '').trim();
          if (!label || !subject || label === subject) return;
          const period = cell.classTime || periodIdx + 1;
          let entry = collected.get(label);
          if (!entry) {
            entry = { slots: new Set(), subjects: new Set(), grades: new Set() };
            collected.set(label, entry);
          }
          entry.slots.add(`${dayIdx + 1}-${period}`);
          entry.subjects.add(subject);
          entry.grades.add(grade);
        });
      }
    }
  }

  const out: Record<string, ComciganTeacherSlots> = {};
  for (const [label, entry] of collected) {
    out[label] = {
      slots: [...entry.slots].sort(),
      subjects: [...entry.subjects].sort(),
      grades: [...entry.grades].sort((a, b) => a - b),
    };
  }
  return out;
}

/**
 * 담당 학급 표를 서버에 두는 곳. 학교마다 문서 하나(시정표)와 사람마다 문서 하나(담당 학급)다.
 * teaching_assignments/{학교}, teaching_assignments/{학교}/teachers/{이름}
 * 컴시간 파일을 올리면 학교 기초 시간표도 문서 하나로 둔다. teaching_assignments/{학교}/base/current
 *
 * 문서 이름이 곧 사람 이름이라, 로그인한 사람의 학교와 이름만으로 자기 표를 찾는다.
 */
import { collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import type {
  BaseTimetable, BaseTimetableLesson, School, TeachingAssignment, TeachingItem, TeachingSlot, TeachingSource,
} from '@shared/types';
import { db } from './firebase';
import type { AssignmentRow } from './teachingAssignments';

const COLLECTION = 'teaching_assignments';
/** 한 번에 커밋할 수 있는 양보다 작게 나눈다 */
const BATCH_SIZE = 400;
/** 서버 규칙과 같은 한도 */
export const MAX_BASE_LESSONS = 3000;

function safeId(name: string): string {
  return name.trim().replace(/\//g, '_');
}

export function schoolTimesDoc(school: School) {
  return doc(db, COLLECTION, school);
}

export function teachersCollection(school: School) {
  return collection(db, COLLECTION, school, 'teachers');
}

export function teacherDoc(school: School, name: string) {
  return doc(db, COLLECTION, school, 'teachers', safeId(name));
}

export function baseDoc(school: School) {
  return doc(db, COLLECTION, school, 'base', 'current');
}

function parseBaseLessons(raw: unknown): BaseTimetableLesson[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({
      name: String(l?.name ?? '').trim(),
      weekday: Number(l?.weekday),
      period: Number(l?.period),
      grade: Number(l?.grade),
      classNum: Number(l?.classNum),
      subject: String(l?.subject ?? '').trim(),
      ...(l?.fixed === true ? { fixed: true } : {}),
    }))
    .filter((l) => (
      l.name && l.subject && l.weekday >= 1 && l.weekday <= 5 && Number.isInteger(l.period) && l.period >= 1
      && Number.isInteger(l.grade) && l.grade >= 1 && Number.isInteger(l.classNum) && l.classNum >= 1
    ));
}

export function parseBaseDoc(school: School, data: Record<string, any> | undefined): BaseTimetable | null {
  const lessons = parseBaseLessons(data?.lessons);
  if (lessons.length === 0) return null;
  return {
    school,
    lessons,
    fileName: typeof data?.fileName === 'string' ? data.fileName : undefined,
    updatedBy: data?.updatedBy,
    updatedAt: data?.updatedAt?.toDate?.() ?? null,
  };
}

function parseItems(raw: unknown): TeachingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      subject: String(item?.subject ?? '').trim(),
      grade: Number(item?.grade),
      classNum: Number(item?.classNum),
    }))
    .filter((item) => item.subject && Number.isInteger(item.grade) && Number.isInteger(item.classNum));
}

function parseSlots(raw: unknown): TeachingSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((slot) => ({
      subject: String(slot?.subject ?? '').trim(),
      grade: Number(slot?.grade),
      classNum: Number(slot?.classNum),
      weekday: Number(slot?.weekday),
      period: Number(slot?.period),
    }))
    .filter((slot) => (
      slot.subject && Number.isInteger(slot.grade) && Number.isInteger(slot.classNum)
      && slot.weekday >= 1 && slot.weekday <= 5 && Number.isInteger(slot.period) && slot.period >= 1
    ));
}

export function parseAssignmentDoc(id: string, data: Record<string, any>): TeachingAssignment {
  return {
    name: String(data?.name || id),
    items: parseItems(data?.items),
    slots: parseSlots(data?.slots),
    source: data?.source === 'admin' || data?.source === 'self' || data?.source === 'file' ? data.source : 'timetable',
    updatedBy: data?.updatedBy,
    updatedAt: data?.updatedAt?.toDate?.() ?? null,
  };
}

export function parseClassTimesDoc(data: Record<string, any> | undefined): string[] {
  return Array.isArray(data?.classTimes) ? data.classTimes.filter((t: unknown) => typeof t === 'string') : [];
}

function assignmentData(
  name: string,
  items: TeachingItem[],
  slots: TeachingSlot[],
  source: TeachingSource,
  uid: string,
) {
  return {
    name: name.trim(),
    items: items.map(({ subject, grade, classNum }) => ({ subject, grade, classNum })),
    slots: slots.map(({ subject, grade, classNum, weekday, period }) => ({ subject, grade, classNum, weekday, period })),
    source,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  };
}

export async function saveAssignment(
  school: School,
  name: string,
  items: TeachingItem[],
  slots: TeachingSlot[],
  source: TeachingSource,
  uid: string,
): Promise<void> {
  await setDoc(teacherDoc(school, name), assignmentData(name, items, slots, source, uid));
}

/**
 * 관리자가 붙여 넣은 표(admin)나 올린 컴시간 파일(file)을 저장한다.
 * 컴시간 파일이면 학교 기초 시간표를 첫 묶음에 함께 넣는다. 표와 기초 시간표가 어긋나게 남지 않는다.
 */
export async function saveAssignmentRows(
  school: School,
  rows: AssignmentRow[],
  uid: string,
  source: 'admin' | 'file' = 'admin',
  base?: { lessons: BaseTimetableLesson[]; fileName: string },
): Promise<void> {
  for (let i = 0; i < rows.length || (i === 0 && !!base); i += BATCH_SIZE) {
    const batch = writeBatch(db);
    if (i === 0 && base) {
      batch.set(baseDoc(school), {
        school,
        lessons: base.lessons.map(({ name, weekday, period, grade, classNum, subject, fixed }) => (
          fixed ? { name, weekday, period, grade, classNum, subject, fixed: true } : { name, weekday, period, grade, classNum, subject }
        )),
        fileName: base.fileName.slice(0, 200),
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
    for (const row of rows.slice(i, i + BATCH_SIZE)) {
      batch.set(teacherDoc(school, row.name), assignmentData(row.name, row.items, row.slots, source, uid));
    }
    await batch.commit();
  }
}

export async function saveClassTimes(school: School, classTimes: string[], uid: string): Promise<void> {
  await setDoc(schoolTimesDoc(school), {
    school,
    classTimes,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

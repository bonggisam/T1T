import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { School, User } from '@shared/types';

/**
 * 교사 명단. users 문서에는 이메일과 설정이 있어 본인과 관리자만 읽는다.
 * 알림을 보낼 사람과 @멘션에 필요한 이름, 학교, 색만 따로 두고 승인된 교사가 읽는다.
 */
export const USER_DIRECTORY = 'user_directory';

/** 한 번에 커밋할 수 있는 양보다 작게 나눈다 */
const BATCH_SIZE = 400;

export interface DirectoryRow {
  name: string;
  school: School;
  profileColor?: string;
}

function toRow(user: { name?: string; school?: string; profileColor?: string }): DirectoryRow {
  const row: DirectoryRow = {
    name: (user.name || '').slice(0, 50),
    school: user.school === 'taeseong_high' ? 'taeseong_high' : 'taeseong_middle',
  };
  if (user.profileColor) row.profileColor = user.profileColor.slice(0, 20);
  return row;
}

/** 승인된 교사는 켤 때마다 자기 줄을 올린다. 내용이 같으면 바뀌는 것이 없다 */
export async function publishOwnDirectoryRow(user: Pick<User, 'id' | 'name' | 'school' | 'profileColor'>): Promise<void> {
  await setDoc(doc(db, USER_DIRECTORY, user.id), toRow(user));
}

/**
 * 관리자가 켜면 승인된 사람과 명단을 맞춘다.
 * 업데이트하지 않은 교사도 알림을 받고, 비활성화한 교사는 빠진다.
 */
export async function reconcileUserDirectory(): Promise<void> {
  const [active, rows] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
    getDocs(collection(db, USER_DIRECTORY)),
  ]);
  const have = new Map(rows.docs.map((d) => [d.id, d.data() as Partial<DirectoryRow>]));
  const writes: Array<{ id: string; row: DirectoryRow | null }> = [];
  const wanted = new Set<string>();
  active.docs.forEach((d) => {
    wanted.add(d.id);
    const row = toRow(d.data());
    const before = have.get(d.id);
    if (!before || !sameRow(before, row)) writes.push({ id: d.id, row });
  });
  rows.docs.forEach((d) => {
    if (!wanted.has(d.id)) writes.push({ id: d.id, row: null });
  });
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const { id, row } of writes.slice(i, i + BATCH_SIZE)) {
      if (row) batch.set(doc(db, USER_DIRECTORY, id), row);
      else batch.delete(doc(db, USER_DIRECTORY, id));
    }
    await batch.commit();
  }
}

function sameRow(a: Partial<DirectoryRow>, b: DirectoryRow): boolean {
  return a.name === b.name && a.school === b.school && (a.profileColor ?? '') === (b.profileColor ?? '');
}

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { BATCH_SIZE } from './firestoreBatch';
import type { EventResponse, ResponseStatus } from '@shared/types';

/**
 * 일정 응답. 일정 문서에 넣지 않고 아래 칸에 사람마다 한 건씩 둔다.
 * 일정 문서를 고치면 수정 시각이 바뀌어 교사마다 구글 캘린더로 다시 보내게 되고,
 * 일정 수정 권한을 교사 전체에 열어야 하기 때문이다. 불참 사유 칸은 두지 않는다.
 */
export function subscribeResponses(
  eventId: string,
  onChange: (responses: EventResponse[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db, 'events', eventId, 'responses'),
    (snapshot) => {
      onChange(snapshot.docs.map((d) => {
        const data = d.data();
        return {
          userId: d.id,
          name: data.name || '',
          status: data.status as ResponseStatus,
          respondedAt: data.respondedAt instanceof Timestamp ? data.respondedAt.toDate() : new Date(),
        };
      }));
    },
    onError,
  );
}

export async function setMyResponse(eventId: string, userId: string, name: string, status: ResponseStatus): Promise<void> {
  await setDoc(doc(db, 'events', eventId, 'responses', userId), {
    userId,
    name: name.slice(0, 50),
    status,
    respondedAt: serverTimestamp(),
  });
}

export async function clearMyResponse(eventId: string, userId: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId, 'responses', userId));
}

/**
 * 일정을 지우기 전에 응답을 지운다. 일정이 사라지면 아래 칸이 남아 이름과 응답이 고아로 남는다.
 * 실패해도 일정 삭제는 막지 않는다.
 */
export async function deleteAllResponses(eventId: string): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, 'events', eventId, 'responses'));
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      snapshot.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('[EventResponses] cleanup failed:', err);
  }
}

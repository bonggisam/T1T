import { writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * 묶음 쓰기 한 번에 넣는 문서 수.
 * 보안 규칙은 묶음 쓰기 한 번에 다른 문서 읽기를 20번까지 허용하고, 우리 규칙은 건마다 최대 2번 읽는다.
 */
export const BATCH_SIZE = 10;

/**
 * 나누어 저장한다. 묶음끼리는 한 번에 처리되지 않으므로 중간에 실패하면 앞 묶음은 남는다.
 * @returns 저장에 성공한 개수. 실패하면 그 오류를 그대로 던지고 error.savedCount에 개수를 담는다.
 */
export async function commitInBatches<T>(
  items: T[],
  apply: (batch: WriteBatch, item: T) => void,
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((item) => apply(batch, item));
    try {
      await batch.commit();
    } catch (err) {
      (err as { savedCount?: number }).savedCount = saved;
      throw err;
    }
    saved += chunk.length;
  }
  return saved;
}

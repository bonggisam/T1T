/**
 * 학교 홈페이지 학사일정을 Firestore events에 자동 동기화.
 * NEIS 대신 학교 홈페이지 (taesung-m/h.goeyi.kr) 데이터 사용.
 */

import {
  collection, query, where, getDocs,
  Timestamp, serverTimestamp, doc, getDoc, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuthStore } from '../store/authStore';
import type { School } from '@shared/types';

const isAdminRole = () => {
  const role = useAuthStore.getState().user?.role;
  return role === 'admin' || role === 'super_admin';
};

/** 문서 ID로 쓸 수 없는 글자를 뺀다 */
const safeDocId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * 단일 학교 학사일정 동기화.
 * 문서 ID를 일정 번호로 정해, 7시에 여러 PC가 함께 돌아도 일정이 겹치지 않게 한다.
 * 홈페이지에서 고친 제목과 날짜는 따라간다. 지운 일정은 그대로 둔다. 사이트가 일부만 돌려준 날 공유 일정을 지우면 되돌릴 수 없다.
 * @throws 사이트에서 받지 못하면. 받은 것처럼 기록하면 다른 PC도 20시간 동안 건너뛴다
 */
async function syncOneSchool(
  schoolKey: School,
  userId: string,
  userName: string,
): Promise<number> {
  const result = await window.electronAPI?.schoolFetchSchedule(schoolKey);
  if (!result || result.events.length === 0) throw new Error(`${schoolKey} 학사일정을 받지 못했습니다`);

  // 기존 import 일정 조회 — 단일 필드 쿼리로 변경 (복합 인덱스 불필요)
  // school은 클라이언트에서 필터링
  const existingQ = query(
    collection(db, 'events'),
    where('schoolScheduleImport', '==', true),
  );
  const existingSnap = await getDocs(existingQ);
  const existing = new Map(
    existingSnap.docs
      .filter((d) => d.data().school === schoolKey)
      .map((d) => [d.data().externalId as string, d]),
  );
  console.log(`[SchoolSchedule] ${schoolKey}: 기존 ${existing.size}개 이미 등록됨, 신규 후보 ${result.events.length}개`);

  // 학교별 색상
  const adminColor = schoolKey === 'taeseong_middle' ? '#10B981' : '#8B5CF6';

  let imported = 0;
  for (const item of result.events) {
    const externalId = `school_${schoolKey}_${item.seq}`;
    // 타임존 안전 파싱: "YYYY-MM-DD" + "T00:00:00" → 로컬 자정 (UTC 파싱 회피)
    // new Date("2026-06-12")는 UTC 자정 = KST/EST에서 다른 날짜로 시프트되므로 위험
    const startDate = new Date(`${item.startDate}T00:00:00`);
    const endDate = new Date(`${item.endDate}T23:59:59`);

    const found = existing.get(externalId);
    try {
      if (found) {
        const data = found.data();
        const changed = data.title !== item.title
          || data.startDate?.toMillis?.() !== startDate.getTime()
          || data.endDate?.toMillis?.() !== endDate.getTime();
        // 처음 가져온 교사와 관리자만 고칠 수 있다. 다른 PC의 시도는 규칙이 막으며 그 PC가 고칠 때까지 기다린다
        if (changed && (data.createdBy === userId || isAdminRole())) {
          await updateDoc(doc(db, 'events', found.id), {
            title: item.title,
            startDate: Timestamp.fromDate(startDate),
            endDate: Timestamp.fromDate(endDate),
            updatedAt: serverTimestamp(),
          });
        }
        continue;
      }
      await setDoc(doc(db, 'events', safeDocId(externalId)), {
        title: item.title,
        description: '',
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        allDay: true,
        category: 'event',
        school: schoolKey,
        adminColor,
        createdBy: userId,
        adminName: userName,
        repeat: null,
        attachments: [],
        checklist: [],
        readBy: {},
        schoolScheduleImport: true,
        externalId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      imported++;
    } catch (err) {
      // 다른 PC가 먼저 만든 문서는 규칙이 막는다. 나머지 일정은 계속 처리한다
      console.warn(`[SchoolSchedule] ${externalId} 건너뜀:`, err);
    }
  }
  return imported;
}

/**
 * 양교 학사일정 자동 동기화.
 * Firestore app_meta/schoolScheduleSync 문서로 마지막 동기화 추적.
 */
export async function autoSyncBothSchoolSchedules(
  userId: string,
  userName: string,
  minIntervalHours = 20,
): Promise<{ middleCount: number; highCount: number; skipped: boolean; error?: string }> {
  try {
    const metaRef = doc(db, 'app_meta', 'schoolScheduleSync');
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      const lastSync = metaSnap.data()?.lastSync;
      if (lastSync instanceof Timestamp) {
        const hoursAgo = (Date.now() - lastSync.toMillis()) / (1000 * 60 * 60);
        if (hoursAgo < minIntervalHours) {
          return { middleCount: 0, highCount: 0, skipped: true };
        }
      }
    }

    const [middleResult, highResult] = await Promise.allSettled([
      syncOneSchool('taeseong_middle', userId, userName),
      syncOneSchool('taeseong_high', userId, userName),
    ]);

    const middleCount = middleResult.status === 'fulfilled' ? middleResult.value : 0;
    const highCount = highResult.status === 'fulfilled' ? highResult.value : 0;

    if (middleResult.status === 'rejected') {
      console.warn('[SchoolSchedule] 태성중 sync failed:', middleResult.reason);
    }
    if (highResult.status === 'rejected') {
      console.warn('[SchoolSchedule] 태성고 sync failed:', highResult.reason);
    }

    // 한쪽이라도 받지 못했으면 기록하지 않는다. 기록하면 모든 PC가 다음 날까지 다시 시도하지 않는다
    if (middleResult.status === 'fulfilled' && highResult.status === 'fulfilled') {
      await setDoc(metaRef, {
        lastSync: serverTimestamp(),
        middleCount,
        highCount,
        syncedBy: userId,
      });
    }

    return { middleCount, highCount, skipped: false };
  } catch (err: any) {
    console.error('[SchoolSchedule] sync failed:', err);
    return { middleCount: 0, highCount: 0, skipped: false, error: err?.message || 'unknown' };
  }
}

/**
 * 매일 오전 7시 자동 동기화 스케줄러.
 * - 앱 시작 시 1회 시도 (20시간 이내 동기화면 skip)
 * - 다음 7시까지 setTimeout → 매 24시간 setInterval
 */
export function startSchoolScheduleAutoSync(userId: string, userName: string): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  // 앱 시작 시 1회
  autoSyncBothSchoolSchedules(userId, userName, 20).catch((e) =>
    console.warn('[SchoolSchedule] startup sync failed:', e),
  );

  function msUntilNext7AM(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(7, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  timeoutId = setTimeout(() => {
    autoSyncBothSchoolSchedules(userId, userName, 12).catch((e) =>
      console.warn('[SchoolSchedule] scheduled sync failed:', e),
    );
    intervalId = setInterval(() => {
      autoSyncBothSchoolSchedules(userId, userName, 12).catch((e) =>
        console.warn('[SchoolSchedule] scheduled sync failed:', e),
      );
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext7AM());

  return () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (intervalId !== null) clearInterval(intervalId);
  };
}

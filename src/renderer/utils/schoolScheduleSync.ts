/**
 * 학교 홈페이지 학사일정을 Firestore events에 자동 동기화.
 * NEIS 대신 학교 홈페이지 (taesung-m/h.goeyi.kr) 데이터 사용.
 */

import {
  collection, addDoc, query, where, getDocs,
  Timestamp, serverTimestamp, doc, getDoc, setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { School } from '@shared/types';

/** 단일 학교 학사일정 동기화 — 외부 ID로 중복 방지 */
async function syncOneSchool(
  schoolKey: School,
  userId: string,
  userName: string,
): Promise<number> {
  const result = await window.electronAPI?.schoolFetchSchedule(schoolKey);
  if (!result || result.events.length === 0) return 0;

  // 기존 import 일정 조회 (school + sourceSchedule 플래그)
  const existingQ = query(
    collection(db, 'events'),
    where('school', '==', schoolKey),
    where('schoolScheduleImport', '==', true),
  );
  const existingSnap = await getDocs(existingQ);
  const existingIds = new Set(existingSnap.docs.map((d) => d.data().externalId));

  // 학교별 색상
  const adminColor = schoolKey === 'taeseong_middle' ? '#10B981' : '#8B5CF6';

  let imported = 0;
  for (const item of result.events) {
    const externalId = `school_${schoolKey}_${item.seq}`;
    if (existingIds.has(externalId)) continue;

    const startDate = new Date(item.startDate);
    const endDate = new Date(item.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    await addDoc(collection(db, 'events'), {
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

    if (middleResult.status === 'fulfilled' || highResult.status === 'fulfilled') {
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

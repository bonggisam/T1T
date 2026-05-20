/**
 * NEIS 학사일정 (SchoolSchedule) API.
 * 학교별 교육청+학교 코드로 학사일정을 가져와 CalendarEvent 형식으로 변환.
 */

interface NeisConfig { education: string; school: string; }

/**
 * 태성중/태성고 기본 NEIS 코드 (내장 기본값).
 * 사용자가 별도 설정하지 않으면 자동 적용.
 * - 태성중학교: 경기도교육청 J10 / 7751042
 * - 태성고등학교: 경기도교육청 J10 / 7530209
 */
const DEFAULT_CONFIGS: Record<string, NeisConfig> = {
  taeseong_middle: { education: 'J10', school: '7751042' },
  taeseong_high: { education: 'J10', school: '7530209' },
};

interface NeisScheduleItem {
  date: string; // YYYY-MM-DD
  title: string;
  content: string;
}

export function getNeisConfig(schoolKey: string): NeisConfig | null {
  try {
    const raw = localStorage.getItem(`tonet-neis-${schoolKey}`);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('[NEIS] getNeisConfig failed:', err);
  }
  // 저장된 값 없으면 내장 기본값 사용 (태성중/고 바로 동작)
  return DEFAULT_CONFIGS[schoolKey] || null;
}

/** 사용자가 실제로 커스텀 설정했는지 확인 */
export function hasCustomNeisConfig(schoolKey: string): boolean {
  try {
    return localStorage.getItem(`tonet-neis-${schoolKey}`) !== null;
  } catch { return false; }
}

export function removeNeisConfig(schoolKey: string): void {
  try {
    localStorage.removeItem(`tonet-neis-${schoolKey}`);
    // 다른 컴포넌트(MealView 등)에 설정 변경 알림
    window.dispatchEvent(new CustomEvent('neis:config-changed', { detail: { schoolKey } }));
  }
  catch (err) { console.warn('[NEIS] removeNeisConfig failed:', err); }
}

/**
 * 10초 타임아웃 fetch 헬퍼.
 */
async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * NEIS schoolInfo API로 학교코드 → 교육청 코드 + 이름 조회.
 * 학교코드만 있으면 교육청 코드는 자동 파악 가능.
 * 에러 시 { error: 'timeout' | 'not_found' | 'network' } 반환.
 */
export async function lookupSchoolByCode(
  schoolCode: string,
): Promise<{ education: string; name: string } | { error: 'timeout' | 'not_found' | 'network' }> {
  if (!schoolCode.trim()) return { error: 'not_found' };
  try {
    const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&SD_SCHUL_CODE=${encodeURIComponent(schoolCode.trim())}`;
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) {
      console.warn('[NEIS] lookupSchoolByCode HTTP error:', res.status);
      return { error: 'network' };
    }
    const json = await res.json();
    // NEIS API: 데이터 없을 때 INFO-200
    if (json?.RESULT?.CODE && json.RESULT.CODE !== 'INFO-000') {
      return { error: 'not_found' };
    }
    const row = json?.schoolInfo?.[1]?.row?.[0];
    if (!row || !row.ATPT_OFCDC_SC_CODE) return { error: 'not_found' };
    return {
      education: row.ATPT_OFCDC_SC_CODE,
      name: row.SCHUL_NM || '',
    };
  } catch (err: any) {
    console.warn('[NEIS] lookupSchoolByCode failed:', err);
    if (err?.name === 'AbortError') return { error: 'timeout' };
    return { error: 'network' };
  }
}

/**
 * 학교 이름으로 검색 (자동완성용).
 */
export async function searchSchoolByName(name: string): Promise<Array<{ code: string; name: string; education: string; region: string; kind: string }>> {
  if (!name.trim() || name.trim().length < 2) return [];
  try {
    const url = `https://open.neis.go.kr/hub/schoolInfo?Type=json&pIndex=1&pSize=50&SCHUL_NM=${encodeURIComponent(name.trim())}`;
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.RESULT?.CODE && json.RESULT.CODE !== 'INFO-000') return [];
    const rows = json?.schoolInfo?.[1]?.row || [];
    return rows.map((r: any) => ({
      code: r.SD_SCHUL_CODE,
      name: r.SCHUL_NM,
      education: r.ATPT_OFCDC_SC_CODE,
      region: r.LCTN_SC_NM || '',
      kind: r.SCHUL_KND_SC_NM || '',
    }));
  } catch (err: any) {
    console.warn('[NEIS] searchSchoolByName failed:', err);
    return [];
  }
}

export function setNeisConfig(schoolKey: string, cfg: NeisConfig): void {
  try {
    localStorage.setItem(`tonet-neis-${schoolKey}`, JSON.stringify(cfg));
    window.dispatchEvent(new CustomEvent('neis:config-changed', { detail: { schoolKey } }));
  }
  catch (err) { console.warn('[NEIS] setNeisConfig failed:', err); }
}

/**
 * 기간 내 학사일정 가져오기.
 */
export async function fetchNeisSchedule(
  schoolKey: string,
  from: Date,
  to: Date,
): Promise<NeisScheduleItem[]> {
  const cfg = getNeisConfig(schoolKey);
  if (!cfg) throw new Error('NEIS 학교 코드가 설정되지 않았습니다');

  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  // 페이지네이션: 300개씩 최대 5페이지(1500개)까지 조회 (학사일정 충분)
  const PAGE_SIZE = 300;
  const MAX_PAGES = 5;
  const all: any[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://open.neis.go.kr/hub/SchoolSchedule?Type=json&pIndex=${page}&pSize=${PAGE_SIZE}&ATPT_OFCDC_SC_CODE=${cfg.education}&SD_SCHUL_CODE=${cfg.school}&AA_FROM_YMD=${fmt(from)}&AA_TO_YMD=${fmt(to)}`;
    const res = await fetchWithTimeout(url, 15000);
    if (!res.ok) throw new Error(`NEIS HTTP ${res.status}`);
    const json = await res.json();
    if (json?.RESULT && json.RESULT.CODE !== 'INFO-000') break; // 데이터 없음
    const rows = json?.SchoolSchedule?.[1]?.row || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // 마지막 페이지
  }

  return all.map((r: any) => ({
    date: r.AA_YMD, // YYYYMMDD
    title: (r.EVENT_NM || '').trim(),
    content: (r.EVENT_CNTNT || '').trim(),
  })).filter((item: NeisScheduleItem) => item.title);
}

/**
 * NEIS 일정을 Firestore events 컬렉션에 추가.
 * 중복 방지를 위해 externalId (neis_YYYYMMDD_title) 사용.
 */
import { collection, addDoc, query, where, getDocs, Timestamp, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { School } from '@shared/types';

export async function importNeisScheduleToFirestore(
  schoolKey: School,
  userId: string,
  userName: string,
  from: Date,
  to: Date,
): Promise<number> {
  const items = await fetchNeisSchedule(schoolKey, from, to);
  if (items.length === 0) return 0;

  // 이미 import 된 일정 중복 방지 — externalId 필드 사용
  const existingQ = query(
    collection(db, 'events'),
    where('school', '==', schoolKey),
    where('neisImport', '==', true),
  );
  const existingSnap = await getDocs(existingQ);
  const existingIds = new Set(existingSnap.docs.map((d) => d.data().externalId));

  let imported = 0;
  for (const item of items) {
    const externalId = `neis_${item.date}_${item.title}`;
    if (existingIds.has(externalId)) continue;

    const year = parseInt(item.date.slice(0, 4));
    const month = parseInt(item.date.slice(4, 6)) - 1;
    const day = parseInt(item.date.slice(6, 8));
    const startDate = new Date(year, month, day, 0, 0, 0);
    const endDate = new Date(year, month, day, 23, 59, 59);

    await addDoc(collection(db, 'events'), {
      title: item.title,
      description: item.content || '',
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      allDay: true,
      category: 'event',
      school: schoolKey,
      // 학교별 색상 구분: 중학교는 초록, 고등학교는 보라
      adminColor: schoolKey === 'taeseong_middle' ? '#10B981' : '#8B5CF6',
      createdBy: userId,
      adminName: userName,
      repeat: null,
      attachments: [],
      checklist: [],
      readBy: {},
      neisImport: true,
      externalId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    imported++;
  }
  return imported;
}

/**
 * 양교 학사일정 자동 동기화 (현재 ~ 1년 후).
 * Firestore 'app_meta/neisAutoSync' 문서로 마지막 동기화 시간 추적 — 중복 방지.
 * minIntervalHours 시간 이상 경과한 경우에만 실행.
 *
 * 호출 시점:
 * - 앱 시작 시 (intervalHours=20: 약 하루 한 번)
 * - 매일 오전 7시 스케줄러 (intervalHours=12: 안전 마진)
 *
 * @returns 동기화 결과 {middleCount, highCount, skipped}
 */
export async function autoSyncBothSchoolsNeis(
  userId: string,
  userName: string,
  minIntervalHours = 20,
): Promise<{ middleCount: number; highCount: number; skipped: boolean; error?: string }> {
  const META_DOC = 'app_meta/neisAutoSync';
  try {
    // 마지막 동기화 시간 확인
    const metaRef = doc(db, 'app_meta', 'neisAutoSync');
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      const lastSync = metaSnap.data()?.lastSync;
      if (lastSync instanceof Timestamp) {
        const hoursAgo = (Date.now() - lastSync.toMillis()) / (1000 * 60 * 60);
        if (hoursAgo < minIntervalHours) {
          console.log(`[NEIS Auto] Skipped — last sync ${hoursAgo.toFixed(1)}h ago (< ${minIntervalHours}h)`);
          return { middleCount: 0, highCount: 0, skipped: true };
        }
      }
    }

    // 동기화 범위: 오늘 ~ 1년 후 (학사일정 충분)
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setFullYear(to.getFullYear() + 1);

    const [middleResult, highResult] = await Promise.allSettled([
      importNeisScheduleToFirestore('taeseong_middle', userId, userName, from, to),
      importNeisScheduleToFirestore('taeseong_high', userId, userName, from, to),
    ]);

    const middleCount = middleResult.status === 'fulfilled' ? middleResult.value : 0;
    const highCount = highResult.status === 'fulfilled' ? highResult.value : 0;

    if (middleResult.status === 'rejected') {
      console.warn('[NEIS Auto] 태성중 sync failed:', middleResult.reason);
    }
    if (highResult.status === 'rejected') {
      console.warn('[NEIS Auto] 태성고 sync failed:', highResult.reason);
    }

    // 마지막 동기화 시간 기록 (둘 중 하나라도 성공하면)
    if (middleResult.status === 'fulfilled' || highResult.status === 'fulfilled') {
      await setDoc(metaRef, {
        lastSync: serverTimestamp(),
        middleCount,
        highCount,
        syncedBy: userId,
      });
    }

    console.log(`[NEIS Auto] Synced — 태성중 +${middleCount}, 태성고 +${highCount}`);
    return { middleCount, highCount, skipped: false };
  } catch (err: any) {
    console.error('[NEIS Auto] Sync failed:', err);
    return { middleCount: 0, highCount: 0, skipped: false, error: err?.message || 'unknown' };
  }
}

/**
 * 매일 오전 7시에 학사일정 자동 동기화 스케줄러 시작.
 * - 앱 시작 시 즉시 1회 시도 (최근 동기화 없으면)
 * - 다음 7시까지 대기 후 매 24시간마다 반복
 * @returns cleanup 함수
 */
export function startNeisAutoSyncScheduler(userId: string, userName: string): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  // 앱 시작 시 1회 (20시간 미만 동기화면 skip)
  autoSyncBothSchoolsNeis(userId, userName, 20).catch((e) => console.warn('[NEIS Auto] startup sync failed:', e));

  // 다음 오전 7시까지 ms 계산
  function msUntilNext7AM(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(7, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      // 이미 7시 지났으면 내일 7시
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  timeoutId = setTimeout(() => {
    // 첫 7시 도달 시 sync
    autoSyncBothSchoolsNeis(userId, userName, 12).catch((e) => console.warn('[NEIS Auto] scheduled sync failed:', e));
    // 그 이후 매 24시간마다
    intervalId = setInterval(() => {
      autoSyncBothSchoolsNeis(userId, userName, 12).catch((e) => console.warn('[NEIS Auto] scheduled sync failed:', e));
    }, 24 * 60 * 60 * 1000);
  }, msUntilNext7AM());

  return () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (intervalId !== null) clearInterval(intervalId);
  };
}

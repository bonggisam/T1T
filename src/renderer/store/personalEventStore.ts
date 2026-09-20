import { create } from 'zustand';
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import {
  isGoogleConnected,
  fetchGoogleCalendarEvents,
  restoreCalendarConnections,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  isGoogleRateLimited,
} from '../utils/calendarSync';
import { cachePersonalEvents, getCachedPersonalEvents } from '../utils/offlineCache';
import { loadSharedPushedGoogleIds, cleanupOrphanedT1TGoogleEvents, T1T_PUSHED_TITLE_RE, deriveGoogleEventId } from '../utils/sharedEventsGoogleSync';
import { useAuthStore } from './authStore';
import type { PersonalEvent } from '@shared/types';
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';

// ─── 모듈 상태 (스토어 밖) ───
/** 진행 중인 sync Promise — 동시 호출은 새로 돌리지 않고 이 Promise를 공유 (수동 "지금 동기화"가 조용히 드랍되지 않도록) */
let syncInflight: Promise<void> | null = null;
/** Firestore 구독 오류 시 백오프 재구독 */
let resubscribeAttempts = 0;
let resubscribeTimer: ReturnType<typeof setTimeout> | null = null;
/** reconcile 재푸시 백오프: eventId → { fails, nextAt } — 계속 실패하는 이벤트를 15초마다 두드려 쿼터를 태우지 않도록 */
const reconcileBackoff = new Map<string, { fails: number; nextAt: number }>();

interface PersonalEventState {
  personalEvents: PersonalEvent[];
  externalEvents: PersonalEvent[];
  loading: boolean;
  unsubscribe: (() => void) | null;
  syncTimer: ReturnType<typeof setInterval> | null;

  subscribeToPersonalEvents: (userId: string) => void;
  syncExternalCalendars: () => Promise<void>;
  startAutoSync: (intervalMinutes: number) => void;
  stopAutoSync: () => void;
  addPersonalEvent: (userId: string, event: Omit<PersonalEvent, 'id'>) => Promise<{ id: string; googleSync: 'none' | 'success' | 'failed'; error?: string }>;
  updatePersonalEvent: (userId: string, eventId: string, updates: Partial<PersonalEvent>) => Promise<{ googleSync: 'none' | 'success' | 'failed'; error?: string }>;
  deletePersonalEvent: (userId: string, eventId: string) => Promise<{ deleted: boolean; googleSync: 'none' | 'success' | 'failed'; error?: string }>;
  cleanup: () => void;
  allPersonalEvents: () => PersonalEvent[];
}

export const usePersonalEventStore = create<PersonalEventState>((set, get) => ({
  personalEvents: [],
  externalEvents: [],
  loading: false,
  unsubscribe: null,
  syncTimer: null,

  subscribeToPersonalEvents: (userId) => {
    // 이전 구독 해제 (중복 방지)
    const { unsubscribe: prev } = get();
    prev?.();
    if (resubscribeTimer) { clearTimeout(resubscribeTimer); resubscribeTimer = null; }

    // Google 토큰은 사용자별로 분리 저장/복원 — 공용 PC에서 다른 교사의 토큰이 섞이지 않도록
    restoreCalendarConnections(userId);

    // Load cached personal events first
    getCachedPersonalEvents<PersonalEvent>().then((cached) => {
      if (cached.length > 0 && get().personalEvents.length === 0) {
        set({ personalEvents: cached });
      }
    }).catch((err) => console.warn('[PersonalEventStore] Cache load failed:', err));

    const q = query(
      collection(db, 'personal_events', userId, 'events'),
      orderBy('startDate', 'asc'),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      resubscribeAttempts = 0; // 정상 수신 → 재구독 카운터 리셋
      const events: PersonalEvent[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || '',
          description: data.description || '',
          startDate: data.startDate instanceof Timestamp ? data.startDate.toDate() : new Date(data.startDate),
          endDate: data.endDate instanceof Timestamp ? data.endDate.toDate() : new Date(data.endDate),
          allDay: data.allDay ?? false,
          source: data.source || 'local',
          externalId: data.externalId || null,
          checklist: data.checklist || [],
          color: data.color || '#2ECC71',
        };
      });
      set({ personalEvents: events });
      cachePersonalEvents(events).catch((err) => console.warn('[PersonalEventStore] Cache failed:', err));
    }, (error) => {
      // Firestore 권한 변경 / 네트워크 / auth 만료 시 구독 정리 — 캐시는 이미 로드됨
      console.error('[PersonalEventStore] subscription error:', error);
      const current = get().unsubscribe;
      current?.();
      set({ unsubscribe: null });
      // 일시적 오류(토큰 갱신 중 permission-denied, 네트워크 블립)면 백오프 재구독 (5s → 10s → … 최대 60s, 6회).
      // 재구독 없이 끊어두면 personalEvents가 캐시 시점에 얼어붙고 reconcile이 낡은 목록을 계속 밀어넣게 됨.
      if (resubscribeAttempts < 6) {
        const delay = Math.min(60_000, 5_000 * 2 ** resubscribeAttempts);
        resubscribeAttempts++;
        resubscribeTimer = setTimeout(() => {
          resubscribeTimer = null;
          if (useAuthStore.getState().user?.id === userId) get().subscribeToPersonalEvents(userId);
        }, delay);
      }
    });
    set({ unsubscribe: unsub });
  },

  syncExternalCalendars: async () => {
    // 동시 호출은 진행 중인 Promise를 공유 — 예전엔 loading 플래그로 조용히 return해서
    // 설정의 "지금 동기화"나 focus 트리거가 15초 타이머와 겹치면 아무것도 안 하고 "완료"라고 표시됐음.
    if (syncInflight) return syncInflight;
    let resolveDone!: () => void;
    syncInflight = new Promise<void>((r) => { resolveDone = r; });
    set({ loading: true });
    try {
      const now = new Date();
      // 범위 확장 — 과거 2달 ~ 미래 9달 (2027년 3월말까지 커버)
      // 이유: 학사일정/공유 일정이 27년 2월까지 등록되어 있으므로 모두 가져와야 함
      const timeMin = startOfMonth(subMonths(now, 2));
      const timeMax = endOfMonth(addMonths(now, 9));
      let allExternal: PersonalEvent[] = [];

      if (isGoogleConnected()) {
        const googleEvents = await fetchGoogleCalendarEvents(timeMin, timeMax);
        const userId = useAuthStore.getState().user?.id;
        // 1) Google 캘린더에서 고아 T1T 이벤트 정리 (모바일/웹 중복 표시 원인 제거)
        //    - 우리 prefix가 있지만 현재 매핑에는 없는 이벤트
        //    - = v2.5.34~v2.5.36의 random-ID 잔재 or localStorage wipe 후 매핑 잃은 이벤트
        if (userId) {
          await cleanupOrphanedT1TGoogleEvents(userId, googleEvents).catch(() => {});
        }
        // 2) personal 뷰 필터링 — 우리 push 이벤트는 shared 뷰에 이미 표시되므로 제외.
        //    에코 루프(공유일정 → Google push → 다시 pull → 앱에 중복) 방어 3중:
        //      a) externalId가 'tev'로 시작 = 우리 결정론적 ID → 무조건 제외 (가장 튼튼).
        //         매핑이 손상되거나 사용자가 Google에서 제목을 바꿔도 이 방어는 유지됨.
        //      b) 매핑(pushedIds)에 있는 ID → 제외
        //      c) 제목 prefix ([중·공유] 등) → 제외 (옛 형식 fallback)
        const pushedIds = userId ? loadSharedPushedGoogleIds(userId) : new Set<string>();
        allExternal = googleEvents.filter((e) => {
          if (typeof e.externalId === 'string' && e.externalId.startsWith('tev')) return false;
          if (e.externalId && pushedIds.has(e.externalId)) return false;
          if (T1T_PUSHED_TITLE_RE.test(e.title)) return false;
          return true;
        });
      }

      set({ externalEvents: allExternal });

      // 3) reconcile — Google push에 실패해 externalId가 비어 있는 로컬 개인 일정을 재푸시.
      //    'tpe' 결정론적 ID라 재시도해도 중복 생성 없음 (이미 있으면 409 → 재사용).
      //    범위: 현재 pull 창(timeMin 이후)만 — 오래된 과거 일정을 뒤늦게 대량 밀어넣지 않음.
      //    한 번에 최대 20개 (버스트 방지). 성공하면 Firestore에 externalId 기록 → 다음 sync에서 제외.
      //    백오프: 실패한 이벤트는 1분 → 4분 → 16분 → 최대 60분 뒤에 재시도 (앱 재시작 시 초기화).
      //    Google이 429/403으로 제한 중이면 이번 사이클은 통째로 건너뜀 — 15초×20건 무한 재시도로
      //    쿼터를 스스로 태워 모든 동기화가 오류 나던 경로를 차단.
      const uid = useAuthStore.getState().user?.id;
      if (uid && isGoogleConnected() && !isGoogleRateLimited()) {
        const now = Date.now();
        const pending = get().personalEvents
          .filter((p) =>
            p.source === 'local' && !p.externalId && p.startDate >= timeMin
            && (reconcileBackoff.get(p.id)?.nextAt ?? 0) <= now)
          .slice(0, 5);
        for (const p of pending) {
          let externalId: string | null = null;
          try {
            externalId = await createGoogleEvent({
              title: p.title,
              description: p.description,
              startDate: p.startDate,
              endDate: p.endDate,
              allDay: p.allDay,
              customEventId: deriveGoogleEventId(p.id, 'tpe'),
            });
            if (externalId) {
              await updateDoc(doc(db, 'personal_events', uid, 'events', p.id), { externalId });
              reconcileBackoff.delete(p.id);
            }
          } catch (err) {
            console.warn(`[PersonalEventStore] reconcile push failed for ${p.id}:`, err);
          }
          if (!externalId) {
            const fails = (reconcileBackoff.get(p.id)?.fails ?? 0) + 1;
            const waitMs = Math.min(60 * 60_000, 60_000 * 4 ** (fails - 1));
            reconcileBackoff.set(p.id, { fails, nextAt: Date.now() + waitMs });
          }
        }
        if (pending.length > 0) {
          console.log(`[PersonalEventStore] reconcile: ${pending.length} tried, ${pending.filter((p) => !reconcileBackoff.has(p.id)).length} ok`);
        }
      }
    } finally {
      set({ loading: false });
      syncInflight = null;
      resolveDone();
    }
  },

  startAutoSync: (intervalMinutes) => {
    const { syncTimer } = get();
    if (syncTimer) clearInterval(syncTimer);

    // 초기 동기화 (즉시)
    get().syncExternalCalendars().catch((err) => console.warn('[PersonalEventStore] Initial sync failed:', err));

    // visibility 기반 폴링: 창이 숨겨지면 일시정지, 보이면 즉시 sync + 재개
    // → 사용자가 앱을 보고 있을 때만 빈번하게 폴링, 백그라운드에서는 멈춤 (배터리/할당량 절약)
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return; // 숨겨져 있으면 skip
      get().syncExternalCalendars().catch((err) => console.warn('[PersonalEventStore] Auto sync failed:', err));
    };
    const timer = setInterval(tick, Math.max(intervalMinutes * 60 * 1000, 5000)); // 최소 5초 가드
    set({ syncTimer: timer });
  },

  stopAutoSync: () => {
    const { syncTimer } = get();
    if (syncTimer) {
      clearInterval(syncTimer);
      set({ syncTimer: null });
    }
  },

  addPersonalEvent: async (userId, event) => {
    // Firestore 먼저 저장(source of truth) → Google은 미러.
    //
    // 옛 흐름(Google 먼저 → Firestore)의 중복 원인:
    //   Google 생성 성공 후 Firestore 저장 실패 → Google에만 남음 → 사용자가 재시도 → Google에 2개.
    //   또 Google이 랜덤 ID를 발급하므로 재시도할 때마다 새 이벤트가 생김.
    //
    // 새 흐름:
    //   1) Firestore에 먼저 저장 (externalId: null)
    //   2) Google ID를 Firestore docId에서 결정론적으로 도출('tpe' 접두) → 재시도해도 같은 ID
    //      → 이미 있으면 409 → 기존 ID 재사용 (중복 생성 구조적으로 불가)
    //   3) 성공하면 externalId 기록. 실패하면 로컬에 남고 syncExternalCalendars의 reconcile이 재시도.
    const docRef = await addDoc(collection(db, 'personal_events', userId, 'events'), {
      ...event,
      externalId: event.externalId ?? null,
      startDate: Timestamp.fromDate(event.startDate),
      endDate: Timestamp.fromDate(event.endDate),
    });
    let googleSync: 'none' | 'success' | 'failed' = 'none';
    let syncError: string | undefined;
    if (event.source === 'local' && !event.externalId && isGoogleConnected()) {
      try {
        const externalId = await createGoogleEvent({
          title: event.title,
          description: event.description,
          startDate: event.startDate,
          endDate: event.endDate,
          allDay: event.allDay,
          customEventId: deriveGoogleEventId(docRef.id, 'tpe'),
        });
        if (externalId) {
          await updateDoc(docRef, { externalId });
          googleSync = 'success';
        } else {
          googleSync = 'failed';
          syncError = 'Google 응답에 ID 없음 (토큰 만료/권한) — 다음 동기화 때 자동 재시도됩니다';
        }
      } catch (err: any) {
        googleSync = 'failed';
        syncError = `${err?.message || 'Google API 호출 실패'} — 다음 동기화 때 자동 재시도됩니다`;
        console.error('[PersonalEventStore] Google create failed:', err);
      }
    }
    return { id: docRef.id, googleSync, error: syncError };
  },

  updatePersonalEvent: async (userId, eventId, updates) => {
    const updateData: any = { ...updates };
    if (updates.startDate) {
      const d = updates.startDate instanceof Date ? updates.startDate : new Date(updates.startDate as any);
      if (isNaN(d.getTime())) throw new Error('Invalid startDate');
      updateData.startDate = Timestamp.fromDate(d);
    }
    if (updates.endDate) {
      const d = updates.endDate instanceof Date ? updates.endDate : new Date(updates.endDate as any);
      if (isNaN(d.getTime())) throw new Error('Invalid endDate');
      updateData.endDate = Timestamp.fromDate(d);
    }
    // Firestore 먼저 (source of truth) → Google 미러. 옛 순서(Google 먼저)는 Firestore 쓰기가 실패하면
    // Google만 새 값이 되고, pull에서 externalId 일치로 Google 쪽이 숨겨져 "수정이 사라진" 것처럼 보였음.
    await updateDoc(doc(db, 'personal_events', userId, 'events', eventId), updateData);
    const pe = get().personalEvents.find((p) => p.id === eventId);
    let googleSync: 'none' | 'success' | 'failed' = 'none';
    let syncError: string | undefined;
    if (pe?.externalId && isGoogleConnected()) {
      try {
        const ok = await updateGoogleEvent(pe.externalId, {
          title: updates.title ?? pe.title,
          description: updates.description ?? pe.description,
          startDate: (updates.startDate instanceof Date ? updates.startDate : pe.startDate),
          endDate: (updates.endDate instanceof Date ? updates.endDate : pe.endDate),
          allDay: updates.allDay ?? pe.allDay,
        });
        googleSync = ok ? 'success' : 'failed';
        if (!ok) syncError = 'Google API 호출 실패 (토큰/권한)';
      } catch (err: any) {
        googleSync = 'failed';
        syncError = err?.message || 'Google API 예외';
        console.error('[PersonalEventStore] Google update failed:', err);
      }
    }
    return { googleSync, error: syncError };
  },

  deletePersonalEvent: async (userId, eventId) => {
    const pe = get().personalEvents.find((p) => p.id === eventId);
    // Google 연동 중이고 Google 복사본이 있으면 Google부터 지우고, **실패하면 Firestore도 지우지 않는다.**
    // 옛 흐름은 Google 삭제가 실패해도 Firestore를 지워서 Google에 고아가 남고, 다음 pull에서
    // 그 고아가 화면에 되살아나 "삭제했는데 또 있음/중복"으로 보였음 (사용자 보고 증상의 실제 경로).
    // Google이 연동 해제 상태면 로컬만 지운다 (그땐 pull도 안 하므로 화면 중복은 생기지 않음).
    if (pe?.externalId && isGoogleConnected()) {
      let ok = false;
      let reason = '';
      try {
        ok = await deleteGoogleEvent(pe.externalId);
        if (!ok) reason = 'Google API 삭제 실패';
      } catch (err: any) {
        reason = err?.message || 'Google API 예외';
        console.error('[PersonalEventStore] Google delete failed:', err);
      }
      if (!ok) {
        return { deleted: false, googleSync: 'failed', error: `${reason} — 삭제를 취소했습니다. 잠시 후 다시 시도해주세요.` };
      }
      await deleteDoc(doc(db, 'personal_events', userId, 'events', eventId));
      return { deleted: true, googleSync: 'success' };
    }
    await deleteDoc(doc(db, 'personal_events', userId, 'events', eventId));
    return { deleted: true, googleSync: 'none' };
  },

  cleanup: () => {
    const { unsubscribe, syncTimer } = get();
    unsubscribe?.();
    if (syncTimer) clearInterval(syncTimer);
    if (resubscribeTimer) { clearTimeout(resubscribeTimer); resubscribeTimer = null; }
    resubscribeAttempts = 0;
    set({ unsubscribe: null, syncTimer: null });
  },

  allPersonalEvents: () => {
    const { personalEvents, externalEvents } = get();
    // 1차 dedupe — externalId 일치
    const localGoogleIds = new Set(
      personalEvents
        .map((p) => p.externalId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    // 2차 dedupe (fallback) — title(trim/소문자) + 시작시간(5분 버킷, 인접 버킷 포함) 일치 시
    // 같은 이벤트로 판단해 외부 쪽 제외. 옛 버전에서 생긴 고아(랜덤 ID) Google 복사본을 걸러냄.
    // 인접 버킷까지 보는 이유: 고정 버킷은 경계(예 10:04 vs 10:06)에서 항상 어긋나 중복이 새어 나옴.
    // 트레이드오프: 같은 제목을 ~10분 안에 두 번 만든 "다른" 일정은 하나만 보일 수 있음 —
    // 드문 경우이고, 사용자가 보고한 고아 중복 노출보다 낫다고 판단.
    const bucketOf = (ts: number) => Math.floor(ts / 300000);
    const fuzzyKey = (title: string, b: number) => `${title.trim().toLowerCase()}|${b}`;
    const localFuzzyKeys = new Set<string>();
    for (const p of personalEvents) {
      const b = bucketOf(p.startDate.getTime());
      localFuzzyKeys.add(fuzzyKey(p.title, b - 1));
      localFuzzyKeys.add(fuzzyKey(p.title, b));
      localFuzzyKeys.add(fuzzyKey(p.title, b + 1));
    }
    const dedupedExternal = externalEvents.filter((e) => {
      if (e.externalId && localGoogleIds.has(e.externalId)) return false;
      // 3차 — 'tpe'는 이 앱이 만든 개인 일정의 결정론적 ID. 여기까지 왔다는 건 로컬에 짝이 없다는 뜻
      // (로컬에서 지웠는데 Google에 남은 고아) → 숨김. 화면에 되살아나 "중복"으로 보이는 것을 막음.
      if (typeof e.externalId === 'string' && e.externalId.startsWith('tpe')) return false;
      if (localFuzzyKeys.has(fuzzyKey(e.title, bucketOf(e.startDate.getTime())))) return false;
      return true;
    });
    return [...personalEvents, ...dedupedExternal];
  },
}));

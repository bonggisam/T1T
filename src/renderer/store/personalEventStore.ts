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
} from '../utils/calendarSync';
import { cachePersonalEvents, getCachedPersonalEvents } from '../utils/offlineCache';
import { loadSharedPushedGoogleIds, cleanupOrphanedT1TGoogleEvents, T1T_PUSHED_TITLE_RE } from '../utils/sharedEventsGoogleSync';
import { useAuthStore } from './authStore';
import type { PersonalEvent } from '@shared/types';
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';

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
  deletePersonalEvent: (userId: string, eventId: string) => Promise<{ googleSync: 'none' | 'success' | 'failed'; error?: string }>;
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

    restoreCalendarConnections();

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
    });
    set({ unsubscribe: unsub });
  },

  syncExternalCalendars: async () => {
    // 중복 sync 방지 (race condition)
    if (get().loading) return;
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
        // 2) personal 뷰 필터링 — 우리 push 이벤트는 shared 뷰에 이미 표시되므로 제외
        const pushedIds = userId ? loadSharedPushedGoogleIds(userId) : new Set<string>();
        allExternal = googleEvents.filter((e) => {
          if (e.externalId && pushedIds.has(e.externalId)) return false;
          if (T1T_PUSHED_TITLE_RE.test(e.title)) return false;
          return true;
        });
      }

      set({ externalEvents: allExternal });
    } finally {
      set({ loading: false });
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
    // 로컬 일정인 경우 + 구글 연결된 경우 → 구글 캘린더에도 생성 (await으로 즉시 동기화)
    let externalId = event.externalId;
    let googleSync: 'none' | 'success' | 'failed' = 'none';
    let syncError: string | undefined;
    if (event.source === 'local' && isGoogleConnected()) {
      try {
        externalId = await createGoogleEvent({
          title: event.title,
          description: event.description,
          startDate: event.startDate,
          endDate: event.endDate,
          allDay: event.allDay,
        });
        googleSync = externalId ? 'success' : 'failed';
        if (!externalId) syncError = 'Google API 응답에 ID 없음 (토큰 만료 또는 권한 거부)';
      } catch (err: any) {
        googleSync = 'failed';
        syncError = err?.message || 'Google API 호출 실패';
        console.error('[PersonalEventStore] Google create failed:', err);
      }
    }
    const docRef = await addDoc(collection(db, 'personal_events', userId, 'events'), {
      ...event,
      externalId,
      startDate: Timestamp.fromDate(event.startDate),
      endDate: Timestamp.fromDate(event.endDate),
    });
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
    // 구글 연결 + externalId 있으면 구글에도 await으로 즉시 반영
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
    await updateDoc(doc(db, 'personal_events', userId, 'events', eventId), updateData);
    return { googleSync, error: syncError };
  },

  deletePersonalEvent: async (userId, eventId) => {
    const pe = get().personalEvents.find((p) => p.id === eventId);
    let googleSync: 'none' | 'success' | 'failed' = 'none';
    let syncError: string | undefined;
    if (pe?.externalId && isGoogleConnected()) {
      try {
        const ok = await deleteGoogleEvent(pe.externalId);
        googleSync = ok ? 'success' : 'failed';
        if (!ok) syncError = 'Google API 삭제 실패';
      } catch (err: any) {
        googleSync = 'failed';
        syncError = err?.message || 'Google API 예외';
        console.error('[PersonalEventStore] Google delete failed:', err);
      }
    }
    await deleteDoc(doc(db, 'personal_events', userId, 'events', eventId));
    return { googleSync, error: syncError };
  },

  cleanup: () => {
    const { unsubscribe, syncTimer } = get();
    unsubscribe?.();
    if (syncTimer) clearInterval(syncTimer);
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
    // 2차 dedupe (fallback) — 옛 버전에서 externalId 누락된 Firestore 레코드 대응:
    // title(trim/소문자) + 시작시간(±2분) 일치하면 같은 이벤트로 판단해 외부 쪽 제외.
    function fuzzyKey(title: string, ts: number): string {
      // 5분 단위로 묶기 → ±5분 fuzzy match (사용자가 일정 시간 미세 조정해도 dedup 유지)
      return `${title.trim().toLowerCase()}|${Math.floor(ts / 300000)}`;
    }
    const localFuzzyKeys = new Set(
      personalEvents.map((p) => fuzzyKey(p.title, p.startDate.getTime()))
    );
    const dedupedExternal = externalEvents.filter((e) => {
      if (e.externalId && localGoogleIds.has(e.externalId)) return false;
      const key = fuzzyKey(e.title, e.startDate.getTime());
      if (localFuzzyKeys.has(key)) return false;
      return true;
    });
    return [...personalEvents, ...dedupedExternal];
  },
}));

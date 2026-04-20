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
  addPersonalEvent: (userId: string, event: Omit<PersonalEvent, 'id'>) => Promise<string>;
  updatePersonalEvent: (userId: string, eventId: string, updates: Partial<PersonalEvent>) => Promise<void>;
  deletePersonalEvent: (userId: string, eventId: string) => Promise<void>;
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
          source: data.source || 'local',
          externalId: data.externalId || null,
          checklist: data.checklist || [],
          color: data.color || '#2ECC71',
        };
      });
      set({ personalEvents: events });
      cachePersonalEvents(events).catch((err) => console.warn('[PersonalEventStore] Cache failed:', err));
    });
    set({ unsubscribe: unsub });
  },

  syncExternalCalendars: async () => {
    // 중복 sync 방지 (race condition)
    if (get().loading) return;
    set({ loading: true });
    try {
      const now = new Date();
      const timeMin = startOfMonth(subMonths(now, 1));
      const timeMax = endOfMonth(addMonths(now, 2));
      let allExternal: PersonalEvent[] = [];

      if (isGoogleConnected()) {
        const googleEvents = await fetchGoogleCalendarEvents(timeMin, timeMax);
        allExternal = [...allExternal, ...googleEvents];
      }

      set({ externalEvents: allExternal });
    } finally {
      set({ loading: false });
    }
  },

  startAutoSync: (intervalMinutes) => {
    const { syncTimer } = get();
    if (syncTimer) clearInterval(syncTimer);

    // Initial sync
    get().syncExternalCalendars().catch((err) => console.warn('[PersonalEventStore] Initial sync failed:', err));

    const timer = setInterval(() => {
      get().syncExternalCalendars().catch((err) => console.warn('[PersonalEventStore] Auto sync failed:', err));
    }, intervalMinutes * 60 * 1000);
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
    // 로컬 일정인 경우 + 구글 연결된 경우 → 구글 캘린더에도 생성
    let externalId = event.externalId;
    if (event.source === 'local' && isGoogleConnected()) {
      externalId = await createGoogleEvent({
        title: event.title,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        allDay: event.allDay,
      });
    }
    const docRef = await addDoc(collection(db, 'personal_events', userId, 'events'), {
      ...event,
      externalId,
      startDate: Timestamp.fromDate(event.startDate),
      endDate: Timestamp.fromDate(event.endDate),
    });
    return docRef.id;
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
    // 구글 연결 + externalId 있으면 구글에도 반영
    const pe = get().personalEvents.find((p) => p.id === eventId);
    if (pe?.externalId && isGoogleConnected()) {
      updateGoogleEvent(pe.externalId, {
        title: updates.title ?? pe.title,
        description: updates.description ?? pe.description,
        startDate: (updates.startDate instanceof Date ? updates.startDate : pe.startDate),
        endDate: (updates.endDate instanceof Date ? updates.endDate : pe.endDate),
        allDay: updates.allDay ?? pe.allDay,
      }).catch((err) => console.warn('[PersonalEventStore] Google sync (update) failed:', err));
    }
    await updateDoc(doc(db, 'personal_events', userId, 'events', eventId), updateData);
  },

  deletePersonalEvent: async (userId, eventId) => {
    const pe = get().personalEvents.find((p) => p.id === eventId);
    if (pe?.externalId && isGoogleConnected()) {
      deleteGoogleEvent(pe.externalId).catch((err) =>
        console.warn('[PersonalEventStore] Google sync (delete) failed:', err)
      );
    }
    await deleteDoc(doc(db, 'personal_events', userId, 'events', eventId));
  },

  cleanup: () => {
    const { unsubscribe, syncTimer } = get();
    unsubscribe?.();
    if (syncTimer) clearInterval(syncTimer);
    set({ unsubscribe: null, syncTimer: null });
  },

  allPersonalEvents: () => {
    const { personalEvents, externalEvents } = get();
    return [...personalEvents, ...externalEvents];
  },
}));

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
import { notifyAllUsers } from '../utils/notifications';
import { cacheEvents, getCachedEvents } from '../utils/offlineCache';
import { sendSlackNotification } from '../utils/slackNotify';
import type { CalendarEvent, CalendarView, ChecklistItem, ReadReceipt, School } from '@shared/types';

interface CalendarState {
  events: CalendarEvent[];
  selectedDate: Date;
  currentMonth: Date;
  view: CalendarView;
  selectedEvent: CalendarEvent | null;
  showEventModal: boolean;
  showEventDetail: boolean;
  loading: boolean;
  unsubscribe: (() => void) | null;

  setSelectedDate: (date: Date) => void;
  setCurrentMonth: (date: Date) => void;
  setView: (view: CalendarView) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  setShowEventModal: (show: boolean) => void;
  setShowEventDetail: (show: boolean) => void;
  navigateMonth: (direction: -1 | 1) => void;
  subscribeToEvents: () => void;
  cleanup: () => void;
  addEvent: (event: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  updateChecklist: (eventId: string, checklist: ChecklistItem[]) => Promise<void>;
  markAsRead: (eventId: string, userId: string, userName: string) => Promise<void>;
}

function firestoreToEvent(id: string, data: any): CalendarEvent {
  return {
    id,
    title: data.title || '',
    description: data.description || '',
    startDate: data.startDate instanceof Timestamp ? data.startDate.toDate() : new Date(data.startDate),
    endDate: data.endDate instanceof Timestamp ? data.endDate.toDate() : new Date(data.endDate),
    allDay: data.allDay ?? false,
    category: data.category || 'other',
    school: (data.school as School | 'all') || 'all',
    createdBy: data.createdBy || '',
    adminName: data.adminName || '',
    adminColor: data.adminColor || '#4A90E2',
    repeat: data.repeat || null,
    attachments: data.attachments || [],
    checklist: (data.checklist || []).map((item: any, idx: number) => ({
      id: item.id || String(idx),
      text: item.text || '',
      checked: item.checked ?? false,
      order: item.order ?? idx,
    })),
    readBy: Object.entries(data.readBy || {}).reduce((acc, [uid, val]: [string, any]) => {
      acc[uid] = {
        name: val.name || '',
        readAt: val.readAt instanceof Timestamp ? val.readAt.toDate() : new Date(val.readAt),
      };
      return acc;
    }, {} as Record<string, ReadReceipt>),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
  };
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  selectedDate: new Date(),
  currentMonth: new Date(),
  view: 'month',
  selectedEvent: null,
  showEventModal: false,
  showEventDetail: false,
  loading: true,
  unsubscribe: null,

  setSelectedDate: (date) => set({ selectedDate: date }),
  setCurrentMonth: (date) => set({ currentMonth: date }),
  setView: (view) => set({ view }),
  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setShowEventModal: (show) => set({ showEventModal: show }),
  setShowEventDetail: (show) => set({ showEventDetail: show }),

  navigateMonth: (direction) => {
    const current = get().currentMonth;
    const newMonth = new Date(current.getFullYear(), current.getMonth() + direction, 1);
    set({ currentMonth: newMonth });
  },

  subscribeToEvents: () => {
    // 이전 구독 해제 (중복 방지)
    const { unsubscribe: prev } = get();
    prev?.();

    // Load cached events first for instant display
    getCachedEvents<CalendarEvent>().then((cached) => {
      if (cached.length > 0 && get().events.length === 0) {
        set({ events: cached });
      }
    }).catch((err) => console.warn('[CalendarStore] Cache load failed:', err));

    const q = query(collection(db, 'events'), orderBy('startDate', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map((d) => firestoreToEvent(d.id, d.data()));
      set({ events, loading: false });
      cacheEvents(events).catch((err) => console.warn('[CalendarStore] Cache failed:', err));
    }, (error) => {
      console.error('[CalendarStore] Subscription error:', error);
      getCachedEvents<CalendarEvent>().then((cached) => {
        if (cached.length > 0) set({ events: cached });
      }).catch((err) => console.warn('[CalendarStore] Fallback cache load failed:', err));
      set({ loading: false });
    });
    set({ unsubscribe: unsub });
  },

  cleanup: () => {
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null });
  },

  addEvent: async (event) => {
    // school 필드 필수 (기본값 'all'로 안전망)
    const schoolValue = event.school || 'all';
    const docRef = await addDoc(collection(db, 'events'), {
      ...event,
      school: schoolValue,
      startDate: Timestamp.fromDate(event.startDate),
      endDate: Timestamp.fromDate(event.endDate),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Notify all users
    const dateStr = event.startDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    notifyAllUsers(
      'new_event',
      `새 일정: "${event.title}" (${dateStr})`,
      docRef.id,
      event.createdBy,
      schoolValue, // 해당 학교 사용자에게만 알림
    );
    // 슬랙 알림 (설정된 경우) — 실패해도 무해
    sendSlackNotification(
      `📅 새 일정 등록: *${event.title}* (${dateStr})\n작성자: ${event.adminName || '알 수 없음'}`,
    ).catch((err) => console.warn('[CalendarStore] Slack notify failed:', err));
    return docRef.id;
  },

  updateEvent: async (id, updates) => {
    const updateData: any = { ...updates, updatedAt: serverTimestamp() };
    if (updates.startDate) {
      const d = updates.startDate instanceof Date ? updates.startDate : new Date(updates.startDate);
      if (isNaN(d.getTime())) throw new Error('Invalid startDate');
      updateData.startDate = Timestamp.fromDate(d);
    }
    if (updates.endDate) {
      const d = updates.endDate instanceof Date ? updates.endDate : new Date(updates.endDate);
      if (isNaN(d.getTime())) throw new Error('Invalid endDate');
      updateData.endDate = Timestamp.fromDate(d);
    }
    await updateDoc(doc(db, 'events', id), updateData);
    // Notify all users
    const event = get().events.find((e) => e.id === id);
    if (event) {
      notifyAllUsers(
        'event_updated',
        `일정 수정: "${updates.title || event.title}"`,
        id,
        event.createdBy,
        event.school,
      );
    }
  },

  deleteEvent: async (id) => {
    const event = get().events.find((e) => e.id === id);
    await deleteDoc(doc(db, 'events', id));
    // Notify all users
    if (event) {
      notifyAllUsers(
        'event_deleted',
        `일정 삭제: "${event.title}"`,
        undefined,
        event.createdBy,
        event.school,
      );
    }
  },

  updateChecklist: async (eventId, checklist) => {
    await updateDoc(doc(db, 'events', eventId), {
      checklist,
      updatedAt: serverTimestamp(),
    });
  },

  markAsRead: async (eventId, userId, userName) => {
    try {
      await updateDoc(doc(db, 'events', eventId), {
        [`readBy.${userId}`]: {
          name: userName,
          readAt: serverTimestamp(),
        },
      });
    } catch (err) {
      console.warn('[CalendarStore] markAsRead failed:', err);
    }
  },
}));

import { assertOnline } from '../utils/online';
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
import { getSchoolTag, getCreatorTag } from '../utils/calendarHelpers';
import { commitInBatches } from '../utils/firestoreBatch';
import { deleteAllResponses } from '../utils/eventResponses';
import { changedFields, describeRepeat, newSeriesId, shiftRepeatDays, type Occurrence } from '../utils/repeat';
import type { CalendarEvent, CalendarView, ChecklistItem, EventCategory, ReadReceipt, RepeatConfig, ResponseType, School, SeriesScope } from '@shared/types';

type NewEvent = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 일정 창을 미리 채워 여는 값. 회의 찾기에서 고른 시간을 넘길 때 쓴다. */
export interface EventDraft {
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  category?: EventCategory;
  responseType?: ResponseType | null;
  scope?: School | 'all';
}

interface CalendarState {
  events: CalendarEvent[];
  selectedDate: Date;
  currentMonth: Date;
  view: CalendarView;
  selectedEvent: CalendarEvent | null;
  showEventModal: boolean;
  eventDraft: EventDraft | null;
  showEventDetail: boolean;
  loading: boolean;
  unsubscribe: (() => void) | null;

  setSelectedDate: (date: Date) => void;
  setCurrentMonth: (date: Date) => void;
  setView: (view: CalendarView) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  setShowEventModal: (show: boolean) => void;
  openEventDraft: (draft: EventDraft) => void;
  setShowEventDetail: (show: boolean) => void;
  navigateMonth: (direction: -1 | 1) => void;
  subscribeToEvents: () => void;
  cleanup: () => void;
  addEvent: (event: NewEvent) => Promise<string>;
  /** 반복 일정을 회차마다 한 문서로 저장한다. 알림은 묶음당 한 번만 보낸다. */
  addEventSeries: (event: NewEvent, occurrences: Occurrence[], repeat: RepeatConfig) => Promise<number>;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
  /** 이 회차 이후 또는 전체를 고친다. 날짜와 시각은 고친 만큼 모든 회차를 함께 옮긴다. */
  updateEventSeries: (event: CalendarEvent, scope: Exclude<SeriesScope, 'this'>, updates: Partial<CalendarEvent>) => Promise<number>;
  deleteEvent: (id: string) => Promise<void>;
  deleteEventSeries: (event: CalendarEvent, scope: Exclude<SeriesScope, 'this'>) => Promise<number>;
  updateChecklist: (eventId: string, checklist: ChecklistItem[]) => Promise<void>;
  markAsRead: (eventId: string, userId: string, userName: string) => Promise<void>;
}

/** 일정 문서로 저장할 값. undefined는 Firestore가 거부하므로 정리한다. */
function toEventDoc(event: NewEvent): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: event.title,
    description: event.description ?? '',
    allDay: event.allDay ?? false,
    category: event.category,
    // school 필드 필수 (기본값 'all'로 안전망)
    school: event.school || 'all',
    createdBy: event.createdBy,
    adminName: event.adminName ?? '',
    adminColor: event.adminColor || '#4A90E2',
    repeat: event.repeat ?? null,
    attachments: event.attachments ?? [],
    checklist: event.checklist ?? [],
    readBy: event.readBy ?? {},
    startDate: Timestamp.fromDate(event.startDate),
    endDate: Timestamp.fromDate(event.endDate),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  // 아래는 값 있을 때만 넣는다
  if (event.creatorSchool === 'taeseong_middle' || event.creatorSchool === 'taeseong_high') {
    data.creatorSchool = event.creatorSchool;
  }
  if (event.seriesId) data.seriesId = event.seriesId;
  if (event.responseType) data.responseType = event.responseType;
  return data;
}

function creatorPrefix(event: Pick<NewEvent, 'creatorSchool'>, school: School | 'all'): string {
  const tag = getCreatorTag({ creatorSchool: event.creatorSchool, school });
  return tag ? `${tag} ` : '';
}

function seriesMembers(events: CalendarEvent[], event: CalendarEvent, scope: Exclude<SeriesScope, 'this'>): CalendarEvent[] {
  return events.filter((e) => (
    e.seriesId === event.seriesId && (scope === 'all' || e.startDate.getTime() >= event.startDate.getTime())
  ));
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
    creatorSchool: data.creatorSchool as School | undefined,
    createdBy: data.createdBy || '',
    adminName: data.adminName || '',
    adminColor: data.adminColor || '#4A90E2',
    repeat: data.repeat || null,
    seriesId: data.seriesId || null,
    responseType: data.responseType || null,
    schoolScheduleImport: data.schoolScheduleImport === true ? true : undefined,
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
  eventDraft: null,
  showEventDetail: false,
  loading: true,
  unsubscribe: null,

  setSelectedDate: (date) => set({ selectedDate: date }),
  setCurrentMonth: (date) => set({ currentMonth: date }),
  setView: (view) => set({ view }),
  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setShowEventModal: (show) => set(show ? { showEventModal: true } : { showEventModal: false, eventDraft: null }),
  openEventDraft: (draft) => set({ eventDraft: draft, showEventModal: true }),
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
    assertOnline();
    const schoolValue = event.school || 'all';
    const docRef = await addDoc(collection(db, 'events'), toEventDoc(event));
    // Notify all users
    const dateStr = event.startDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    const ask = event.responseType ? ' 응답 요청' : '';
    notifyAllUsers(
      'new_event',
      `새 일정: ${creatorPrefix(event, schoolValue)}"${event.title}" (${dateStr})${ask}`,
      docRef.id,
      schoolValue, // 해당 학교 사용자에게만 알림
    );
    return docRef.id;
  },

  addEventSeries: async (event, occurrences, repeat) => {
    assertOnline();
    const schoolValue = event.school || 'all';
    const seriesId = newSeriesId();
    const firstId = doc(collection(db, 'events')).id;
    const items = occurrences.map((occurrence, index) => ({
      // 알림에서 첫 회차로 바로 갈 수 있도록 첫 문서의 ID를 미리 정한다
      ref: index === 0 ? doc(db, 'events', firstId) : doc(collection(db, 'events')),
      data: toEventDoc({ ...event, startDate: occurrence.start, endDate: occurrence.end, repeat, seriesId }),
    }));
    const saved = await commitInBatches(items, (batch, item) => batch.set(item.ref, item.data));
    const first = occurrences[0].start;
    const dateStr = first.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    const ask = event.responseType ? ' 응답 요청' : '';
    // 회차마다 알리면 교사마다 알림이 수십 건 쌓인다. 묶음당 한 번만 보낸다.
    notifyAllUsers(
      'new_event',
      `새 반복 일정: ${creatorPrefix(event, schoolValue)}"${event.title}" (${dateStr}부터, ${describeRepeat(repeat, first)}, ${saved}회)${ask}`,
      firstId,
      schoolValue,
    );
    return saved;
  },

  updateEvent: async (id, updates) => {
    assertOnline();
    // undefined 값 제거 (Firestore가 거부)
    const updateData: any = { updatedAt: serverTimestamp() };
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      updateData[k] = v;
    }
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
        event.school,
      );
    }
  },

  updateEventSeries: async (event, scope, updates) => {
    assertOnline();
    const members = seriesMembers(get().events, event, scope);
    const newStart = updates.startDate ?? event.startDate;
    const newEnd = updates.endDate ?? event.endDate;
    const shift = newStart.getTime() - event.startDate.getTime();
    const duration = newEnd.getTime() - newStart.getTime();
    // 길이를 고치지 않았으면 회차마다 따로 정한 길이를 그대로 둔다
    const durationChanged = duration !== event.endDate.getTime() - event.startDate.getTime();
    // 날짜를 옮겼으면 요일 지정 설명도 함께 옮긴다
    const dayShift = Math.round(shift / DAY_MS);
    const repeat = event.repeat ? shiftRepeatDays(event.repeat, dayShift) : null;
    const { startDate: _start, endDate: _end, ...rest } = updates;

    const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const [key, value] of Object.entries(changedFields(event as Partial<CalendarEvent>, rest))) {
      if (value !== undefined) fields[key] = value;
    }
    if (repeat) fields.repeat = repeat;

    const saved = await commitInBatches(members, (batch, member) => {
      const start = new Date(member.startDate.getTime() + shift);
      const length = durationChanged ? duration : member.endDate.getTime() - member.startDate.getTime();
      batch.update(doc(db, 'events', member.id), {
        ...fields,
        startDate: Timestamp.fromDate(start),
        endDate: Timestamp.fromDate(new Date(start.getTime() + length)),
      });
    });
    notifyAllUsers(
      'event_updated',
      `일정 수정: "${updates.title || event.title}" (반복 ${saved}회)`,
      event.id,
      updates.school ?? event.school,
    );
    return saved;
  },

  deleteEvent: async (id) => {
    assertOnline();
    const event = get().events.find((e) => e.id === id);
    if (event?.responseType) await deleteAllResponses(id);
    await deleteDoc(doc(db, 'events', id));
    // Notify all users
    if (event) {
      notifyAllUsers(
        'event_deleted',
        `일정 삭제: "${event.title}"`,
        undefined,
        event.school,
      );
    }
  },

  deleteEventSeries: async (event, scope) => {
    assertOnline();
    const members = seriesMembers(get().events, event, scope);
    for (const member of members) {
      if (member.responseType) await deleteAllResponses(member.id);
    }
    const saved = await commitInBatches(members, (batch, member) => batch.delete(doc(db, 'events', member.id)));
    notifyAllUsers(
      'event_deleted',
      `일정 삭제: "${event.title}" (반복 ${saved}회)`,
      undefined,
      event.school,
    );
    return saved;
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

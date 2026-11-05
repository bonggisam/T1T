import { create } from 'zustand';
import { useEffect, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import type { DutyEntry, DutyTable, School } from '@shared/types';
import { findMyDuties, type MyDuty } from '../utils/dutyEntries';
import { useAuthStore } from './authStore';
import { labelLinksFor, useComciganLinksStore } from './comciganLinksStore';

/** 지난 표는 이만큼만 내려받는다 */
const KEEP_PAST_DAYS = 120;

export interface DutyTableInput {
  title: string;
  school: School | 'all';
  entries: DutyEntry[];
}

interface DutyState {
  tables: DutyTable[];
  loaded: boolean;
  /** 서버 규칙이 아직 배포되지 않았거나 읽을 권한이 없다 */
  denied: boolean;
  /** 달력의 내 차례에서 "표 보기"로 연 표 */
  focusTableId: string | null;
  unsubscribe: (() => void) | null;

  subscribe: () => void;
  cleanup: () => void;
  setFocusTable: (id: string | null) => void;
  saveTable: (input: DutyTableInput, author: { id: string; name: string }, existing?: DutyTable | null) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
}

function toTable(id: string, data: any): DutyTable {
  return {
    id,
    title: data.title || '',
    school: data.school || 'all',
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    firstDate: data.firstDate || '',
    lastDate: data.lastDate || '',
    entries: Array.isArray(data.entries) ? data.entries : [],
    createdAt: data.createdAt?.toDate?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.() ?? null,
  };
}

/** 저장할 칸만 남긴다. Firestore는 undefined를 받지 않는다. */
function cleanEntry(entry: DutyEntry): DutyEntry {
  return {
    id: entry.id,
    date: entry.date,
    startMin: entry.startMin ?? null,
    endMin: entry.endMin ?? null,
    periods: entry.periods ?? [],
    name: entry.name,
    kind: entry.kind ?? '',
    place: entry.place ?? '',
  };
}

export const useDutyStore = create<DutyState>((set, get) => ({
  tables: [],
  loaded: false,
  denied: false,
  focusTableId: null,
  unsubscribe: null,

  subscribe: () => {
    get().unsubscribe?.();
    const cutoff = format(subDays(new Date(), KEEP_PAST_DAYS), 'yyyy-MM-dd');
    const unsubscribe = onSnapshot(
      query(collection(db, 'duty_tables'), where('lastDate', '>=', cutoff)),
      (snap) => {
        const tables = snap.docs
          .map((d) => toTable(d.id, d.data()))
          .sort((a, b) => b.firstDate.localeCompare(a.firstDate));
        set({ tables, loaded: true, denied: false });
      },
      (err) => {
        console.warn('[Duty] subscription error:', err);
        set({ loaded: true, denied: true });
      },
    );
    set({ unsubscribe });
  },

  cleanup: () => {
    get().unsubscribe?.();
    set({ unsubscribe: null, tables: [], loaded: false, denied: false, focusTableId: null });
  },

  setFocusTable: (id) => set({ focusTableId: id }),

  saveTable: async (input, author, existing = null) => {
    const entries = input.entries.map(cleanEntry);
    const dates = entries.map((e) => e.date).sort();
    const ref = existing ? doc(db, 'duty_tables', existing.id) : doc(collection(db, 'duty_tables'));
    await setDoc(ref, {
      title: input.title,
      school: input.school,
      entries,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      createdBy: existing?.createdBy ?? author.id,
      createdByName: existing?.createdByName ?? author.name,
      createdAt: existing?.createdAt ? Timestamp.fromDate(existing.createdAt) : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  deleteTable: async (id) => {
    await deleteDoc(doc(db, 'duty_tables', id));
  },
}));

/** 표들에서 내 차례만 골라 낸다 */
export function useMyDuties(): MyDuty[] {
  const user = useAuthStore((s) => s.user);
  const tables = useDutyStore((s) => s.tables);
  const links = useComciganLinksStore((s) => s.links);
  const id = user?.id;
  const name = user?.name;
  const school = user?.school;
  return useMemo(
    () => findMyDuties(tables, id && name ? { id, name, school } : null, labelLinksFor(links, id)),
    [tables, links, id, name, school],
  );
}

/** 로그인한 동안 표와 연결표를 구독한다. 달력에 내 차례를 그리고 미리 알리는 데 쓴다. */
export function useDutySubscription(userId: string | null): void {
  useEffect(() => {
    if (!userId) return undefined;
    useDutyStore.getState().subscribe();
    useComciganLinksStore.getState().subscribe();
    return () => {
      useDutyStore.getState().cleanup();
      useComciganLinksStore.getState().cleanup();
    };
  }, [userId]);
}

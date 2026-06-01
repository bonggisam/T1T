import { create } from 'zustand';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  writeBatch, getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import type { School } from '@shared/types';
import seedData from '../data/keyphone-seed.json';

export interface KeyphoneEntry {
  id: string;
  school: School;
  department: string;
  name: string;
  role: string;
  keyphone: string;
  phone: string;
  note?: string;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface KeyphoneState {
  entries: KeyphoneEntry[];
  loading: boolean;
  unsubscribe: (() => void) | null;
  subscribe: () => void;
  cleanup: () => void;
  addEntry: (entry: Omit<KeyphoneEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateEntry: (id: string, updates: Partial<KeyphoneEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  /** 컬렉션이 비어 있으면 초기 데이터(키폰번호 xlsx)로 시드. 관리자만 호출 가능. */
  seedIfEmpty: () => Promise<{ seeded: boolean; count: number }>;
  /** 강제로 전체 재시드 (기존 데이터 삭제 후 시드 채우기). super_admin 전용. */
  resetAndReseed: () => Promise<number>;
}

function toEntry(id: string, data: any): KeyphoneEntry {
  return {
    id,
    school: data.school,
    department: data.department || '',
    name: data.name || '',
    role: data.role || '',
    keyphone: data.keyphone || '',
    phone: data.phone || '',
    note: data.note || '',
    order: typeof data.order === 'number' ? data.order : 0,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  };
}

export const useKeyphoneStore = create<KeyphoneState>((set, get) => ({
  entries: [],
  loading: false,
  unsubscribe: null,

  subscribe: () => {
    const prev = get().unsubscribe;
    prev?.();
    set({ loading: true });
    const q = query(collection(db, 'keyphones'));
    const unsub = onSnapshot(q, (snap) => {
      const entries = snap.docs
        .map((d) => toEntry(d.id, d.data()))
        .sort((a, b) => a.order - b.order);
      set({ entries, loading: false });
    }, (err) => {
      console.error('[KeyphoneStore] subscription error:', err);
      const current = get().unsubscribe;
      current?.();
      set({ unsubscribe: null, loading: false });
    });
    set({ unsubscribe: unsub });
  },

  cleanup: () => {
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null, entries: [] });
  },

  addEntry: async (entry) => {
    const data: any = {
      school: entry.school,
      department: entry.department || '',
      name: entry.name || '',
      role: entry.role || '',
      keyphone: entry.keyphone || '',
      phone: entry.phone || '',
      note: entry.note || '',
      order: entry.order ?? 9999,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await addDoc(collection(db, 'keyphones'), data);
  },

  updateEntry: async (id, updates) => {
    const data: any = { updatedAt: serverTimestamp() };
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      if (k === 'id' || k === 'createdAt') continue;
      data[k] = v;
    }
    await updateDoc(doc(db, 'keyphones', id), data);
  },

  deleteEntry: async (id) => {
    await deleteDoc(doc(db, 'keyphones', id));
  },

  seedIfEmpty: async () => {
    // 안전장치: 현재 컬렉션이 정말 비어 있는지 확인
    const existing = await getDocs(collection(db, 'keyphones'));
    if (existing.size > 0) {
      return { seeded: false, count: existing.size };
    }
    const seed: any = seedData;
    let count = 0;
    // Firestore batch: 한 번에 최대 500개 — 본 데이터는 ~116개라 1배치로 충분
    const batch = writeBatch(db);
    const col = collection(db, 'keyphones');
    for (const school of ['taeseong_middle', 'taeseong_high'] as const) {
      const arr = seed[school] || [];
      arr.forEach((e: any, idx: number) => {
        const ref = doc(col);
        batch.set(ref, {
          school,
          department: e.department || '',
          name: e.name || '',
          role: e.role || '',
          keyphone: e.keyphone || '',
          phone: e.phone || '',
          note: '',
          order: idx,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        count++;
      });
    }
    await batch.commit();
    return { seeded: true, count };
  },

  resetAndReseed: async () => {
    // 기존 데이터 모두 삭제
    const snap = await getDocs(collection(db, 'keyphones'));
    if (snap.size > 0) {
      // 500개 단위로 분할 삭제
      const chunks: typeof snap.docs[] = [];
      for (let i = 0; i < snap.docs.length; i += 400) {
        chunks.push(snap.docs.slice(i, i + 400));
      }
      for (const ch of chunks) {
        const b = writeBatch(db);
        ch.forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }
    // 다시 seed
    const seed: any = seedData;
    let count = 0;
    const batch = writeBatch(db);
    const col = collection(db, 'keyphones');
    for (const school of ['taeseong_middle', 'taeseong_high'] as const) {
      const arr = seed[school] || [];
      arr.forEach((e: any, idx: number) => {
        const ref = doc(col);
        batch.set(ref, {
          school,
          department: e.department || '',
          name: e.name || '',
          role: e.role || '',
          keyphone: e.keyphone || '',
          phone: e.phone || '',
          note: '',
          order: idx,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        count++;
      });
    }
    await batch.commit();
    return count;
  },
}));

import { create } from 'zustand';
import {
  collection, query, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  writeBatch, getDocs,
  runTransaction,
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
    // M4: 동시 진입 시 중복 시드 방지를 위해 sentinel 문서를 트랜잭션으로 잠금
    // 'keyphones_meta/seed-lock' 문서를 원자적으로 생성 — 이미 있으면 다른 관리자가 진행 중
    const lockRef = doc(db, 'keyphones_meta', 'seed-lock');
    let acquired = false;
    try {
      await runTransaction(db, async (tx) => {
        const lock = await tx.get(lockRef);
        if (lock.exists()) {
          // 이미 시드되었거나 다른 인스턴스 진행 중
          throw new Error('already-seeded-or-locked');
        }
        // 같은 트랜잭션 내에서 실제 컬렉션 비어있는지 한 번 더 확인
        // (참고: 트랜잭션 내 컬렉션 조회는 제한적 — sentinel 패턴으로 보장)
        tx.set(lockRef, { seededAt: serverTimestamp() });
        acquired = true;
      });
    } catch (err: any) {
      if (err?.message === 'already-seeded-or-locked') {
        const existing = await getDocs(collection(db, 'keyphones'));
        return { seeded: false, count: existing.size };
      }
      throw err;
    }
    if (!acquired) {
      const existing = await getDocs(collection(db, 'keyphones'));
      return { seeded: false, count: existing.size };
    }

    // Lock 획득 — 실제 시드 진행
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
    return { seeded: true, count };
  },

  resetAndReseed: async () => {
    // 기존 데이터 모두 삭제 — Firestore batch 한도 500개 안전 분할
    const snap = await getDocs(collection(db, 'keyphones'));
    if (snap.size > 0) {
      const BATCH_SIZE = 500;
      const chunks: typeof snap.docs[] = [];
      for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        chunks.push(snap.docs.slice(i, i + BATCH_SIZE));
      }
      for (const ch of chunks) {
        const b = writeBatch(db);
        ch.forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }
    // seed-lock 해제 — 다음 자동 시드가 동작하지 않도록 sentinel은 유지하지만
    // 명시적 reset의 경우 갱신해서 추적
    try {
      await updateDoc(doc(db, 'keyphones_meta', 'seed-lock'), {
        seededAt: serverTimestamp(),
        resetAt: serverTimestamp(),
      });
    } catch {
      // sentinel이 없으면 무시 (수동 reset 후 자동시드가 다시 잡을 수 있게)
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

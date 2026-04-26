import { create } from 'zustand';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import type { Todo } from '@shared/types';

interface TodosState {
  todos: Todo[];
  loading: boolean;
  unsubscribe: (() => void) | null;
  subscribeToTodos: (userId: string) => void;
  cleanup: () => void;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
}

function firestoreToTodo(id: string, data: any): Todo {
  return {
    id,
    userId: data.userId || '',
    title: data.title || '',
    description: data.description || '',
    completed: data.completed ?? false,
    priority: data.priority || 'medium',
    dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : undefined),
    school: data.school || 'all',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
  };
}

export const useTodosStore = create<TodosState>((set, get) => ({
  todos: [],
  loading: false,
  unsubscribe: null,

  subscribeToTodos: (userId) => {
    const prev = get().unsubscribe;
    prev?.();

    set({ loading: true });
    // userId로 필터링 (사용자 본인 todos만)
    // orderBy 제거 — 복합 인덱스 요구 회피, 클라이언트 정렬 사용
    const q = query(
      collection(db, 'todos'),
      where('userId', '==', userId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const todos = snap.docs
        .map((d) => firestoreToTodo(d.id, d.data()))
        // 미완료 우선 → dueDate 가까운 순 → createdAt 최신 순
        .sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
      set({ todos, loading: false });
    }, (err) => {
      console.error('[TodosStore] subscription error:', err);
      // 에러 발생 시 구독 정리 (유령 구독 방지)
      const current = get().unsubscribe;
      current?.();
      set({ unsubscribe: null, loading: false });
    });
    set({ unsubscribe: unsub });
  },

  cleanup: () => {
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null, todos: [] });
  },

  addTodo: async (todo) => {
    // undefined 값 제거 (Firestore 거부) + 기본값 보장
    const data: any = {
      userId: todo.userId,
      title: todo.title,
      description: todo.description ?? '',
      completed: todo.completed ?? false,
      priority: todo.priority ?? 'medium',
      school: todo.school ?? 'all',
      dueDate: todo.dueDate ? Timestamp.fromDate(todo.dueDate) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, 'todos'), data);
    } catch (err) {
      console.error('[TodosStore] addDoc failed:', err, data);
      throw err;
    }
  },

  updateTodo: async (id, updates) => {
    // undefined 값 제거 (Firestore 거부) + dueDate 변환
    const updateData: any = { updatedAt: serverTimestamp() };
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      updateData[k] = v;
    }
    // dueDate가 명시적으로 들어왔으면 변환, 빈값(undefined)이면 null로 (지움)
    if ('dueDate' in updates) {
      updateData.dueDate = updates.dueDate ? Timestamp.fromDate(updates.dueDate) : null;
    }
    await updateDoc(doc(db, 'todos', id), updateData);
  },

  toggleTodo: async (id) => {
    const todo = get().todos.find((t) => t.id === id);
    if (!todo) return;
    await updateDoc(doc(db, 'todos', id), {
      completed: !todo.completed,
      updatedAt: serverTimestamp(),
    });
  },

  deleteTodo: async (id) => {
    await deleteDoc(doc(db, 'todos', id));
  },
}));

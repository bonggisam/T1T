import { create } from 'zustand';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, orderBy, Timestamp,
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
    // userId로 필터링 (사용자 본인 todos만) — where school 없이도 안전
    const q = query(
      collection(db, 'todos'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const todos = snap.docs.map((d) => firestoreToTodo(d.id, d.data()));
      set({ todos, loading: false });
    }, (err) => {
      console.error('[TodosStore] subscription error:', err);
      set({ loading: false });
    });
    set({ unsubscribe: unsub });
  },

  cleanup: () => {
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null, todos: [] });
  },

  addTodo: async (todo) => {
    await addDoc(collection(db, 'todos'), {
      ...todo,
      dueDate: todo.dueDate ? Timestamp.fromDate(todo.dueDate) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  updateTodo: async (id, updates) => {
    const updateData: any = { ...updates, updatedAt: serverTimestamp() };
    if (updates.dueDate) updateData.dueDate = Timestamp.fromDate(updates.dueDate);
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

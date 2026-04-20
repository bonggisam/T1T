import { create } from 'zustand';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase';
import type { User } from '@shared/types';

interface UsersState {
  users: Pick<User, 'id' | 'name' | 'email' | 'school' | 'profileColor'>[];
  unsubscribe: (() => void) | null;
  subscribeToUsers: () => void;
  cleanup: () => void;
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  unsubscribe: null,

  subscribeToUsers: () => {
    const prev = get().unsubscribe;
    prev?.();
    const q = query(collection(db, 'users'), where('status', '==', 'active'));
    const unsub = onSnapshot(q, (snap) => {
      const users = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          email: data.email || '',
          school: data.school || 'taeseong_middle',
          profileColor: data.profileColor,
        };
      });
      set({ users });
    }, (err) => console.warn('[UsersStore] subscription error:', err));
    set({ unsubscribe: unsub });
  },

  cleanup: () => {
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null });
  },
}));

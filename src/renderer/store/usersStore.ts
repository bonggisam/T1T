import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { USER_DIRECTORY } from '../utils/userDirectory';
import type { User } from '@shared/types';

interface UsersState {
  /** 승인된 교사 명단. 이메일은 없다 */
  users: Pick<User, 'id' | 'name' | 'school' | 'profileColor'>[];
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
    const unsub = onSnapshot(collection(db, USER_DIRECTORY), (snap) => {
      const users = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
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
    set({ unsubscribe: null, users: [] });
  },
}));

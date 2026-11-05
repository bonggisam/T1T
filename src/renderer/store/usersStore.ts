import { create } from 'zustand';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
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
    get().unsubscribe?.();
    const onData = (snap: { docs: Array<{ id: string; data: () => Record<string, any> }> }) => {
      set({
        users: snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || '',
            school: data.school || 'taeseong_middle',
            profileColor: data.profileColor,
          };
        }),
      });
    };
    const unsub = onSnapshot(collection(db, USER_DIRECTORY), onData, (err) => {
      // 명단 규칙이 아직 없으면 예전처럼 users 목록을 읽는다. 관리자만 읽힌다
      console.warn('[UsersStore] directory unavailable:', err);
      const fallback = onSnapshot(
        query(collection(db, 'users'), where('status', '==', 'active')),
        onData,
        (fallbackErr) => console.warn('[UsersStore] subscription error:', fallbackErr),
      );
      set({ unsubscribe: fallback });
    });
    set({ unsubscribe: unsub });
  },

  cleanup: () => {
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null, users: [] });
  },
}));

import { create } from 'zustand';
import {
  collection,
  query,
  onSnapshot,
  updateDoc,
  doc,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';
import type { AppNotification } from '@shared/types';

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  showPanel: boolean;
  unsubscribe: (() => void) | null;
  setShowPanel: (show: boolean) => void;
  subscribeToNotifications: (userId: string) => void;
  markAsRead: (notificationId: string, userId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  cleanup: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  showPanel: false,
  unsubscribe: null,

  setShowPanel: (show) => set({ showPanel: show }),

  subscribeToNotifications: (userId) => {
    const q = query(
      collection(db, 'notifications', userId, 'items'),
      orderBy('createdAt', 'desc')
    );
    let isFirstLoad = true;
    const unsub = onSnapshot(q, (snapshot) => {
      const notifications: AppNotification[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          type: data.type,
          eventId: data.eventId,
          message: data.message,
          read: data.read ?? false,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          createdBy: data.createdBy,
        };
      });

      const prevUnread = get().unreadCount;
      const unreadCount = notifications.filter((n) => !n.read).length;
      set({ notifications, unreadCount });

      // Play sound & show desktop notification for NEW notifications (not on first load)
      if (!isFirstLoad && unreadCount > prevUnread) {
        const newest = notifications.find((n) => !n.read);
        if (newest) {
          playNotificationSound();
          showDesktopNotification('ToneT', newest.message);
        }
      }
      isFirstLoad = false;

      // Update tray badge
      window.electronAPI?.setTrayBadge(unreadCount > 0);
    });
    set({ unsubscribe: unsub });
  },

  markAsRead: async (notificationId, userId) => {
    await updateDoc(doc(db, 'notifications', userId, 'items', notificationId), {
      read: true,
    });
  },

  markAllAsRead: async (userId) => {
    const { notifications } = get();
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, 'notifications', userId, 'items', n.id), { read: true })
      )
    );
  },

  cleanup: () => {
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null });
  },
}));

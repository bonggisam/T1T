import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { NotificationType } from '@shared/types';

/**
 * Send a notification to all active teachers (and other admins).
 * Called when an admin creates, updates, or deletes an event.
 */
export async function notifyAllUsers(
  type: NotificationType,
  message: string,
  eventId: string | undefined,
  createdBy: string,
): Promise<void> {
  try {
    const q = query(
      collection(db, 'users'),
      where('status', '==', 'active'),
    );
    const snapshot = await getDocs(q);

    const promises = snapshot.docs
      .filter((d) => d.id !== createdBy) // Don't notify self
      .map((d) =>
        addDoc(collection(db, 'notifications', d.id, 'items'), {
          type,
          eventId: eventId || null,
          message,
          read: false,
          createdAt: serverTimestamp(),
          createdBy,
        }),
      );

    await Promise.all(promises);
  } catch (err) {
    console.error('Failed to send notifications:', err);
  }
}

/**
 * Play notification sound using Web Audio API.
 * Generates a pleasant two-tone chime — no external mp3 needed.
 */
export function playNotificationSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Two-tone chime: C5 → E5
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
  } catch {
    // Web Audio not supported
  }
}

/**
 * Show desktop notification (works in Electron)
 */
export function showDesktopNotification(title: string, body: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        new Notification(title, { body });
      }
    });
  }
}

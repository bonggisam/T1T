import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from './firebase';
import { isPersonalHidden } from '../store/privacyStore';
import type { NotificationType, School } from '@shared/types';

/**
 * Send a notification to all active teachers (and other admins).
 * Called when an admin creates, updates, or deletes an event.
 */
export async function notifyAllUsers(
  type: NotificationType,
  message: string,
  eventId: string | undefined,
  createdBy: string,
  eventSchool?: School | 'all',
): Promise<void> {
  // 스푸핑 방지: 실제 현재 로그인 uid와 일치하는지 확인
  const currentUid = getAuth().currentUser?.uid;
  if (!currentUid || currentUid !== createdBy) {
    console.warn('[Notifications] createdBy mismatch — aborting', { currentUid, createdBy });
    return;
  }
  try {
    const q = query(
      collection(db, 'users'),
      where('status', '==', 'active'),
    );
    const snapshot = await getDocs(q);

    const targets = snapshot.docs.filter((d) => {
      if (d.id === createdBy) return false;
      // 일정의 school 값에 따라 대상 필터링
      // 'all' → 모든 활성 사용자
      // 특정 school → 해당 학교 사용자만
      if (!eventSchool || eventSchool === 'all') return true;
      const userSchool = d.data().school;
      return userSchool === eventSchool;
    });

    const results = await Promise.allSettled(
      targets.map((d) =>
        addDoc(collection(db, 'notifications', d.id, 'items'), {
          type,
          eventId: eventId || null,
          message,
          read: false,
          createdAt: serverTimestamp(),
          createdBy,
        }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) console.warn(`[Notifications] ${failed}/${results.length} notifications failed`);
  } catch (err) {
    console.error('Failed to send notifications:', err);
  }
}

/**
 * 특정 사용자에게 알림 전송 (멘션용).
 */
export async function notifyUser(
  targetUserId: string,
  type: NotificationType,
  message: string,
  eventId: string | undefined,
  createdBy: string,
): Promise<void> {
  const currentUid = getAuth().currentUser?.uid;
  if (!currentUid || currentUid !== createdBy) {
    console.warn('[Notifications] notifyUser createdBy mismatch');
    return;
  }
  try {
    await addDoc(collection(db, 'notifications', targetUserId, 'items'), {
      type,
      eventId: eventId || null,
      message,
      read: false,
      createdAt: serverTimestamp(),
      createdBy,
    });
  } catch (err) {
    console.error('Failed to notify user:', err);
  }
}

/**
 * Play notification sound using Web Audio API.
 * Generates a pleasant two-tone chime — no external mp3 needed.
 * 개인 일정을 가린 동안(수업 중, 발표 중)에는 교실 스피커로 나가지 않게 울리지 않는다.
 */
export function playNotificationSound(): void {
  if (isPersonalHidden()) return;
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

/** 가린 동안 온 알림. 프로젝터에 비치지 않게 모아 두었다가 가림이 풀리면 한 번에 보여 준다. */
const deferredNotifications: Array<{ title: string; body: string }> = [];
const MAX_SUMMARY_LINES = 4;

export function flushDeferredNotifications(): void {
  if (deferredNotifications.length === 0) return;
  const items = deferredNotifications.splice(0);
  if (items.length === 1) {
    showDesktopNotification(items[0].title, items[0].body);
    return;
  }
  const lines = items.slice(0, MAX_SUMMARY_LINES).map((item) => `${item.title}: ${item.body}`);
  if (items.length > MAX_SUMMARY_LINES) lines.push(`외 ${items.length - MAX_SUMMARY_LINES}건`);
  showDesktopNotification(`수업 중 온 알림 ${items.length}건`, lines.join('\n'));
}

/**
 * Show desktop notification (works in Electron)
 * @param options.immediate 가린 동안에도 바로 띄운다. 곧 시작하는 수업 알림처럼 미루면 소용없는 것만 쓴다.
 */
export function showDesktopNotification(title: string, body: string, options?: { immediate?: boolean }): void {
  if (!options?.immediate && isPersonalHidden()) {
    deferredNotifications.push({ title, body });
    return;
  }
  // OS 알림은 막힐 수 있다: 서명 안 된 Mac 앱(Electron 42+), 방해 금지, 발표 중. 실패하면 앱 안에 표시한다.
  const fallback = () => {
    import('../components/common/Toast')
      .then(({ showToast }) => showToast(`${title}: ${body}`, 'info'))
      .catch(() => {});
  };
  if (!('Notification' in window)) { fallback(); return; }
  const show = () => {
    try {
      const n = new Notification(title, { body });
      n.onerror = fallback;
    } catch {
      fallback();
    }
  };
  if (Notification.permission === 'granted') {
    show();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') show(); else fallback();
    }).catch(fallback);
  } else {
    fallback();
  }
}

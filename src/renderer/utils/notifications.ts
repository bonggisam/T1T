import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from './firebase';
import { isPersonalHidden } from '../store/privacyStore';
import { USER_DIRECTORY } from './userDirectory';
import type { NotificationType, School } from '@shared/types';

/**
 * 공유 일정이 생기거나 바뀌면 그 학교의 승인된 교사에게 알린다. 본인은 뺀다.
 * 대상은 교사 명단에서 찾는다. users 목록은 관리자만 읽으므로 일반 교사가 올린 일정은 지금까지 알림이 가지 않았다.
 */
export async function notifyAllUsers(
  type: NotificationType,
  message: string,
  eventId: string | undefined,
  eventSchool?: School | 'all',
): Promise<void> {
  const me = getAuth().currentUser?.uid;
  if (!me) return;
  try {
    const snapshot = await getDocs(collection(db, USER_DIRECTORY));

    const targets = snapshot.docs.filter((d) => {
      if (d.id === me) return false;
      // 일정의 school 값에 따라 대상 필터링
      // 'all' → 모든 활성 사용자
      // 특정 school → 해당 학교 사용자만
      if (!eventSchool || eventSchool === 'all') return true;
      return d.data().school === eventSchool;
    });

    const results = await Promise.allSettled(
      targets.map((d) =>
        addDoc(collection(db, 'notifications', d.id, 'items'), {
          type,
          eventId: eventId || null,
          message,
          read: false,
          createdAt: serverTimestamp(),
          createdBy: me,
        }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) console.warn(`[Notifications] ${failed}/${results.length} notifications failed`);
    if (targets.length > 0 && failed === targets.length) notifyFailureToSender();
  } catch (err) {
    console.error('Failed to send notifications:', err);
    notifyFailureToSender();
  }
}

/** 일정은 저장됐지만 다른 선생님에게 알리지 못했다. 말없이 넘어가면 모두 안다고 믿게 된다 */
function notifyFailureToSender(): void {
  import('../components/common/Toast')
    .then(({ showToast }) => showToast('일정은 저장했지만 다른 선생님께 알림을 보내지 못했습니다', 'error'))
    .catch(() => {});
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

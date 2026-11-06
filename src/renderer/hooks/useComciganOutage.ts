import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { showToast } from '../components/common/Toast';
import { useAuthStore } from '../store/authStore';
import { useComciganOutageStore } from '../store/comciganOutageStore';
import { useComciganStore } from '../store/comciganStore';
import { isTimetableStale } from '../utils/classPeriods';
import { INITIAL_OUTAGE, trackOutage } from '../utils/comciganOutage';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';

const CHECK_MS = 60 * 1000;
const SEEN_KEY = 't1t-comcigan-alert-seen';

/** 시간표를 오래 받지 못하는지 지켜본다. 앱에서 한 번만 쓴다. */
export function useComciganOutageWatch(): void {
  const hasConfig = useComciganStore((s) => !!s.config);
  const lastUpdated = useComciganStore((s) => s.timetableData?.lastUpdated ?? '');
  const tracker = useRef(INITIAL_OUTAGE);

  useEffect(() => {
    const { setOutage } = useComciganOutageStore.getState();
    if (!hasConfig) {
      tracker.current = INITIAL_OUTAGE;
      setOutage(false);
      return undefined;
    }
    const tick = () => {
      // 이 PC의 인터넷이 끊긴 것은 컴시간이 막힌 것이 아니다. 오프라인 안내가 따로 있다.
      const stale = navigator.onLine && isTimetableStale(lastUpdated, new Date());
      tracker.current = trackOutage(tracker.current, stale, Date.now());
      setOutage(tracker.current.outage);
    };
    tick();
    const timer = setInterval(tick, CHECK_MS);
    return () => clearInterval(timer);
  }, [hasConfig, lastUpdated]);
}

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeSeen(at: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch (e) {
    console.warn('[ComciganOutage] localStorage write failed:', e);
  }
}

/** 운영자(관리자): 선생님이 보낸 알림을 받는다. 새 알림은 소리와 데스크톱 알림으로 한 번 알린다. */
export function useOperatorOutageAlert(enabled: boolean): void {
  const alert = useComciganOutageStore((s) => s.alert);
  const sound = useAuthStore((s) => s.user?.settings?.notificationSound);

  useEffect(() => {
    if (!enabled) return undefined;
    const store = useComciganOutageStore.getState();
    store.subscribeAlert();
    return () => store.cleanupAlert();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !alert || alert.count <= 0 || !alert.reportedAt) return;
    const at = alert.reportedAt.getTime();
    if (at <= readSeen()) return;
    writeSeen(at);
    const text = `시간표를 받지 못한다는 알림 ${alert.count}건 (${format(alert.reportedAt, 'HH:mm')})`;
    showToast(text, 'error');
    if (sound) playNotificationSound();
    showDesktopNotification('운영자 알림', text, { immediate: true });
  }, [enabled, alert, sound]);
}

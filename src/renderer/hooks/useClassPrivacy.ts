import { useEffect, useRef } from 'react';
import { useComciganStore } from '../store/comciganStore';
import { usePersonalHidden, usePrivacyStore } from '../store/privacyStore';
import { getTimedPeriods, isInClass } from '../utils/classPeriods';
import { flushDeferredNotifications } from '../utils/notifications';

const CHECK_INTERVAL_MS = 15 * 1000;

/**
 * 내 수업 시간에 맞춰 수업 화면 보호를 켜고 끈다. 단축키와 트레이 신호도 여기서 받는다.
 * 보호가 풀리면 그동안 미뤄 둔 알림을 한꺼번에 보여 준다.
 */
export function useClassPrivacy(): void {
  const timetableData = useComciganStore((s) => s.timetableData);
  const setInClass = usePrivacyStore((s) => s.setInClass);
  const hidden = usePersonalHidden();
  const wasHidden = useRef(hidden);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      setInClass(isInClass(getTimedPeriods(timetableData, now), now));
    };
    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [timetableData, setInClass]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onPrivacyToggle(() => usePrivacyStore.getState().toggle());
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (wasHidden.current && !hidden) flushDeferredNotifications();
    wasHidden.current = hidden;
  }, [hidden]);
}

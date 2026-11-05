import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useComciganStore } from '../store/comciganStore';
import { useWidgetStore } from '../store/widgetStore';
import { useAuthStore } from '../store/authStore';
import { showToast } from '../components/common/Toast';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';
import { getCurrentAndNext, getTimedPeriods, formatClassLabel } from '../utils/classPeriods';

/**
 * 컴시간 시간표 기반 수업 시작 전 알림.
 * 30초마다 확인하여 설정된 분(classReminderMin) 전에 한 번 알림.
 */
export function useClassReminder() {
  const timetableData = useComciganStore((s) => s.timetableData);
  const leadMin = useWidgetStore((s) => s.classReminderMin);
  const notificationSound = useAuthStore((s) => s.user?.settings?.notificationSound);
  const loggedIn = useAuthStore((s) => s.user?.status === 'active');
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!loggedIn || !timetableData || leadMin <= 0) return;

    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const dayKey = format(now, 'yyyy-MM-dd');
      const periods = getTimedPeriods(timetableData, now);
      // 다른 수업을 하는 중에는 알리지 않는다. 알린 것으로 치지 않았으니 쉬는 시간에 남은 시간과 함께 알린다.
      const teachingNow = !!getCurrentAndNext(periods, now).current;

      for (const p of periods) {
        const diff = p.startMin - nowMin;
        // 알림 시점(leadMin분 전)에 도달했고 아직 수업 전일 때 — 앱이 늦게 켜져도 한 번은 알림
        if (diff <= 0 || diff > leadMin || teachingNow) continue;
        const key = `${dayKey}-${p.period}-${p.grade}-${p.classNum}`;
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.add(key);

        const room = `${p.grade}학년 ${p.classNum}반`;
        showToast(`🔔 ${diff}분 후 ${formatClassLabel(p)}`, 'info');
        if (notificationSound) playNotificationSound();
        // 개인 일정을 가린 동안에도 띄운다. 내용은 수업 정보뿐이고 미루면 수업을 놓친다.
        showDesktopNotification(`🔔 ${diff}분 후 ${p.period}교시`, `${p.subject} · ${room}`, { immediate: true });
      }

      // 날짜가 바뀌면 지난 기록 정리
      for (const key of notifiedRef.current) {
        if (!key.startsWith(dayKey)) notifiedRef.current.delete(key);
      }
    };

    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [loggedIn, timetableData, leadMin, notificationSound]);
}

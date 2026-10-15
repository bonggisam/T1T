import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useComciganStore } from '../store/comciganStore';
import { useWidgetStore } from '../store/widgetStore';
import { useAuthStore } from '../store/authStore';
import { showToast } from '../components/common/Toast';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';
import { getTimedPeriods, formatClassLabel } from '../utils/classPeriods';

/**
 * 컴시간 시간표 기반 수업 시작 전 알림.
 * 30초마다 확인하여 설정된 분(classReminderMin) 전에 한 번 알림.
 */
export function useClassReminder() {
  const timetableData = useComciganStore((s) => s.timetableData);
  const leadMin = useWidgetStore((s) => s.classReminderMin);
  const notificationSound = useAuthStore((s) => s.user?.settings?.notificationSound);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!timetableData || leadMin <= 0) return;

    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const dayKey = format(now, 'yyyy-MM-dd');

      for (const p of getTimedPeriods(timetableData, now)) {
        const diff = p.startMin - nowMin;
        // 알림 시점(leadMin분 전)에 도달했고 아직 수업 전일 때 — 앱이 늦게 켜져도 한 번은 알림
        if (diff <= 0 || diff > leadMin) continue;
        const key = `${dayKey}-${p.period}-${p.grade}-${p.classNum}`;
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.add(key);

        const room = `${p.grade}학년 ${p.classNum}반`;
        showToast(`🔔 ${diff}분 후 ${formatClassLabel(p)}`, 'info');
        if (notificationSound) playNotificationSound();
        showDesktopNotification(`🔔 ${diff}분 후 ${p.period}교시`, `${p.subject} · ${room}`);
      }

      // 날짜가 바뀌면 지난 기록 정리
      for (const key of notifiedRef.current) {
        if (!key.startsWith(dayKey)) notifiedRef.current.delete(key);
      }
    };

    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [timetableData, leadMin, notificationSound]);
}

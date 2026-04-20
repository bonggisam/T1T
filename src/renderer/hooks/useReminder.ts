import { useEffect, useRef } from 'react';
import { useCalendarStore } from '../store/calendarStore';
import { useAuthStore } from '../store/authStore';
import { showToast } from '../components/common/Toast';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';

const REMINDER_INTERVALS: Record<string, number> = {
  '10min': 10 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
};

/**
 * 일정 시작 전 알림 리마인더.
 * 1분마다 체크하여 설정된 시간 전에 알림을 보냄.
 */
export function useReminder() {
  const { events } = useCalendarStore();
  const { user } = useAuthStore();
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const reminderMs = REMINDER_INTERVALS[user.settings?.reminderDefault || '30min'];
    if (!reminderMs) return; // 'none' 설정

    const timer = setInterval(() => {
      const now = Date.now();

      for (const event of events) {
        const start = event.startDate instanceof Date ? event.startDate.getTime() : new Date(event.startDate).getTime();
        const diff = start - now;
        const key = `${event.id}-${reminderMs}`;

        // 리마인더 시간 범위 내 (±1분) + 미래 일정만
        if (diff > 0 && diff <= reminderMs && diff > reminderMs - 60000 && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);

          const minutesBefore = Math.round(diff / 60000);
          const timeLabel = minutesBefore >= 60
            ? `${Math.round(minutesBefore / 60)}시간`
            : `${minutesBefore}분`;

          showToast(`⏰ ${timeLabel} 후: ${event.title}`, 'info');

          if (user.settings?.notificationSound) {
            playNotificationSound();
          }

          showDesktopNotification(
            `⏰ 일정 알림`,
            `${timeLabel} 후 "${event.title}" 시작`,
          );
        }
      }

      // 지난 알림 정리 (24시간 이상 지난 것)
      if (notifiedRef.current.size > 100) {
        notifiedRef.current.clear();
      }
    }, 60000); // 1분마다 체크

    return () => clearInterval(timer);
  }, [events, user?.id, user?.settings?.reminderDefault, user?.settings?.notificationSound]);
}

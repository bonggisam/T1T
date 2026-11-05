import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useCalendarStore } from '../store/calendarStore';
import { useAuthStore } from '../store/authStore';
import { isPersonalHidden } from '../store/privacyStore';
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
  const eventsRef = useRef(events);

  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => {
    if (!user) return;

    // 다중 알림 목록 (설정 없으면 기본 reminderDefault 1개 사용)
    const reminders = user.settings?.multiReminders && user.settings.multiReminders.length > 0
      ? user.settings.multiReminders
      : (user.settings?.reminderDefault ? [user.settings.reminderDefault] : []);
    const reminderMsList = reminders
      .map((r) => REMINDER_INTERVALS[r])
      .filter((ms): ms is number => !!ms);
    if (reminderMsList.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();

      for (const event of eventsRef.current) {
        const start = event.startDate instanceof Date ? event.startDate.getTime() : new Date(event.startDate).getTime();
        const diff = start - now;
        if (diff <= 0) continue; // 과거/현재 skip

        // 각 리마인더별 확인
        for (const reminderMs of reminderMsList) {
          if (diff > reminderMs || diff <= reminderMs - 60000) continue; // 해당 시점 아님
          const key = `${event.id}-${reminderMs}`;
          if (notifiedRef.current.has(key)) continue;
          notifiedRef.current.add(key);

          const minutesBefore = Math.round(diff / 60000);
          const timeLabel = minutesBefore >= 1440
            ? `${Math.round(minutesBefore / 1440)}일`
            : minutesBefore >= 60
              ? `${Math.round(minutesBefore / 60)}시간`
              : `${minutesBefore}분`;

          // 가린 동안에는 화면에 띄우지 않는다. 알림은 나중에 보이므로 "N분 후" 대신 시작 시각으로 적는다.
          const hidden = isPersonalHidden();
          if (!hidden) showToast(`⏰ ${timeLabel} 후: ${event.title}`, 'info');

          if (user.settings?.notificationSound) {
            playNotificationSound();
          }

          showDesktopNotification(
            `⏰ 일정 알림`,
            hidden
              ? `${format(new Date(start), 'M/d HH:mm')} "${event.title}" 시작`
              : `${timeLabel} 후 "${event.title}" 시작`,
          );
        }
      }

      // 지난 알림 정리 (24시간 이상 지난 것)
      if (notifiedRef.current.size > 100) {
        notifiedRef.current.clear();
      }
    }, 60000); // 1분마다 체크

    return () => clearInterval(timer);
  }, [
    user?.id,
    user?.settings?.reminderDefault,
    user?.settings?.multiReminders,
    user?.settings?.notificationSound,
  ]);
}

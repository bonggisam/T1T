import { useEffect } from 'react';
import { addDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { showToast } from '../components/common/Toast';
import { useAuthStore } from '../store/authStore';
import { useComciganStore } from '../store/comciganStore';
import { useMyDuties } from '../store/dutyStore';
import { useWidgetStore } from '../store/widgetStore';
import { getCurrentAndNext, getTimedPeriods } from '../utils/classPeriods';
import { dutyTitle, dutyWhenText } from '../utils/dutyEntries';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';
import { isPersonalHidden } from '../store/privacyStore';

const NOTIFIED_KEY = 't1t-duty-notified';
/** 시작 몇 분 전에 알릴지 */
const LEAD_MIN = 10;
/** 전날 알림과 당일 아침 알림을 내는 시각 */
const EVE_MIN = 16 * 60;
const MORNING_MIN = 7 * 60 + 30;

function readNotified(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]');
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

/** 지난 날짜의 기록은 지운다. 키는 날짜로 시작한다. */
function writeNotified(keys: Set<string>, today: string): void {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...keys].filter((k) => k.slice(0, 10) >= today)));
  } catch (e) {
    console.warn('[DutyReminder] localStorage write failed:', e);
  }
}

/**
 * 내 시험감독 차례를 미리 알린다.
 *  - 전날 오후 4시: 다음 근무일 차례를 모아서 한 번 (금요일에는 월요일 차례)
 *  - 당일 아침: 시각이 없는 차례 (당직 등)
 *  - 시작 10분 전: 시각이 있는 차례
 * 수업 중에는 알리지 않고 쉬는 시간에 알린다. 껐다 켜도 같은 알림을 다시 내지 않는다.
 */
export function useDutyReminder(): void {
  const duties = useMyDuties();
  const enabled = useWidgetStore((s) => s.dutyReminder);
  const timetableData = useComciganStore((s) => s.timetableData);
  const sound = useAuthStore((s) => s.user?.settings?.notificationSound);

  useEffect(() => {
    if (!enabled || duties.length === 0) return undefined;

    const notify = (toast: string, title: string, body: string) => {
      if (!isPersonalHidden()) showToast(toast, 'info');
      if (sound) playNotificationSound();
      showDesktopNotification(title, body, { immediate: true });
    };

    const check = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      // 수업 중에는 넘긴다. 알린 것으로 치지 않아 쉬는 시간에 다시 확인한다.
      const currentClass = getCurrentAndNext(getTimedPeriods(timetableData, now), now).current;

      const today = format(now, 'yyyy-MM-dd');
      const notified = readNotified();
      let changed = false;

      if (!currentClass && nowMin >= EVE_MIN) {
        const nextDay = addDays(now, now.getDay() === 5 ? 3 : 1);
        const nextStr = format(nextDay, 'yyyy-MM-dd');
        const key = `${nextStr}|eve`;
        const items = duties.filter((d) => d.entry.date === nextStr);
        if (items.length > 0 && !notified.has(key)) {
          notified.add(key);
          changed = true;
          const when = now.getDay() === 5 ? format(nextDay, 'EEEE', { locale: ko }) : '내일';
          const lines = items.map((d) => `${dutyWhenText(d.entry)} ${dutyTitle(d.entry)}`);
          notify(`${when} 시험감독 ${items.length}건`, `${when} 시험감독 ${items.length}건`, lines.slice(0, 5).join('\n'));
        }
      }

      for (const { table, entry } of duties) {
        if (entry.date !== today) continue;
        const key = `${today}|${table.id}|${entry.id}`;
        if (notified.has(key)) continue;
        if (entry.startMin === null) {
          if (currentClass || nowMin < MORNING_MIN) continue;
          notified.add(key);
          changed = true;
          notify(`오늘 ${dutyTitle(entry)}`, `오늘 ${dutyTitle(entry)}`, table.title);
        } else {
          const diff = entry.startMin - nowMin;
          if (diff <= 0 || diff > LEAD_MIN) continue;
          // 수업이 먼저 끝나면 쉬는 시간에 알린다. 감독이 수업 중에 시작하면 쉬는 시간이 오지 않으니 지금 알린다
          if (currentClass && currentClass.endMin <= entry.startMin) continue;
          notified.add(key);
          changed = true;
          notify(`${diff}분 후 ${dutyTitle(entry)}`, `${diff}분 후 ${dutyTitle(entry)}`, dutyWhenText(entry));
        }
      }

      if (changed) writeNotified(notified, today);
    };

    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [enabled, duties, timetableData, sound]);
}

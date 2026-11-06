import React, { useMemo } from 'react';
import { addDays, isSameDay, startOfToday } from 'date-fns';
import type { PersonalEvent } from '@shared/types';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useVisiblePersonalEvents } from '../../hooks/useVisiblePersonalEvents';
import { useUIStore } from '../../store/uiStore';
import { isEventOnDate } from '../../utils/calendarHelpers';
import { getHoliday } from '../../utils/holidays';
import { Ic } from '../common/Ic';
import { DayAgenda } from './DayAgenda';

const DAYS_AHEAD = 60;

/** 앞으로 60일의 일정을 날짜별로 보여 준다. 수업은 오늘만 함께 적는다. */
export function AgendaView({ onPersonalClick }: { onPersonalClick?: (pe: PersonalEvent) => void }) {
  const { categoryFilter } = useUIStore();
  // useVisibleEvents가 이미 학교+카테고리 필터를 적용함 — 여기서는 날짜만 필터
  const events = useVisibleEvents();
  const personalEvents = useVisiblePersonalEvents();

  const days = useMemo(() => {
    const today = startOfToday();
    const out: Date[] = [];
    for (let i = 0; i <= DAYS_AHEAD; i++) {
      const day = addDays(today, i);
      const busy = i === 0 || getHoliday(day)
        || events.some((e) => isEventOnDate(e, day))
        || personalEvents.some((e) => isEventOnDate(e, day));
      if (busy) out.push(day);
    }
    return out;
  }, [events, personalEvents]);

  const nothing = days.length === 1 && !events.some((e) => isEventOnDate(e, days[0]));

  return (
    <div style={styles.container}>
      {nothing && events.length === 0 && (
        <div style={styles.empty}>
          <span style={{ fontSize: 'var(--fs-icon)' }}><Ic name="inbox" gap={false} /></span>
          <span>{categoryFilter !== 'all' ? '해당 카테고리에 예정된 일정이 없습니다' : '예정된 일정이 없습니다'}</span>
        </div>
      )}
      {days.map((day) => (
        <DayAgenda
          key={day.toISOString()}
          date={day}
          onPersonalClick={onPersonalClick}
          showClasses={isSameDay(day, new Date())}
          hideEmpty
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', overflow: 'auto', paddingBottom: 8 },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, padding: '40px 0', color: 'var(--text-muted)', fontSize: 'var(--fs-control)',
  },
};

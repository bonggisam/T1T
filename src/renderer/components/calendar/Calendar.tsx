import React from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { CalendarHeader } from './CalendarHeader';
import { EventLegend } from './EventLegend';

interface CalendarProps {
  onAddPersonalEvent?: () => void;
}

export function Calendar({ onAddPersonalEvent }: CalendarProps = {}) {
  const { view } = useCalendarStore();

  return (
    <div style={styles.container}>
      <CalendarHeader onAddPersonalEvent={onAddPersonalEvent} />
      <div style={styles.viewContainer}>
        {view === 'month' && <MonthView />}
        {view === 'week' && <WeekView />}
        {view === 'day' && <DayView />}
      </div>
      <EventLegend />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  viewContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '0 8px',
  },
};

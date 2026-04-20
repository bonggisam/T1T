import React, { useState } from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { CalendarHeader } from './CalendarHeader';
import { EventLegend } from './EventLegend';
import { SearchPanel } from './SearchPanel';
import { PrintView } from './PrintView';

interface CalendarProps {
  onAddPersonalEvent?: () => void;
}

export function Calendar({ onAddPersonalEvent }: CalendarProps = {}) {
  const { view } = useCalendarStore();
  const [showSearch, setShowSearch] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  if (showPrint) {
    return <PrintView onClose={() => setShowPrint(false)} />;
  }

  return (
    <div style={styles.container}>
      <CalendarHeader
        onAddPersonalEvent={onAddPersonalEvent}
        onToggleSearch={() => setShowSearch(true)}
        onPrint={() => setShowPrint(true)}
      />
      <div style={styles.viewContainer}>
        {view === 'month' && <MonthView onAddPersonalEvent={onAddPersonalEvent} />}
        {view === 'week' && <WeekView onAddPersonalEvent={onAddPersonalEvent} />}
        {view === 'day' && <DayView onAddPersonalEvent={onAddPersonalEvent} />}
      </div>
      <EventLegend />
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
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

import React, { useState } from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { useUIStore } from '../../store/uiStore';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { YearView } from './YearView';
import { AgendaView } from './AgendaView';
import { StatsView } from './StatsView';
import { CalendarHeader } from './CalendarHeader';
import { EventLegend } from './EventLegend';
import { SearchPanel } from './SearchPanel';
import { PrintView } from './PrintView';
import { PersonalEventDetail } from './PersonalEventDetail';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import type { PersonalEvent } from '@shared/types';

interface CalendarProps {
  onAddPersonalEvent?: () => void;
}

export function Calendar({ onAddPersonalEvent }: CalendarProps = {}) {
  const { view } = useCalendarStore();
  const { categoryFilter, setCategoryFilter } = useUIStore();
  const [showSearch, setShowSearch] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [selectedPersonal, setSelectedPersonal] = useState<PersonalEvent | null>(null);

  // 전역 단축키
  useKeyboardShortcuts({
    onSearch: () => setShowSearch(true),
    onAddPersonal: onAddPersonalEvent,
  });

  if (showPrint) {
    return <PrintView onClose={() => setShowPrint(false)} />;
  }

  return (
    <div style={styles.container}>
      <CalendarHeader
        onAddPersonalEvent={onAddPersonalEvent}
        onToggleSearch={() => setShowSearch(true)}
        onPrint={() => setShowPrint(true)}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
      />
      <div style={styles.viewContainer}>
        {view === 'month' && <MonthView onAddPersonalEvent={onAddPersonalEvent} onPersonalClick={setSelectedPersonal} />}
        {view === 'week' && <WeekView onAddPersonalEvent={onAddPersonalEvent} onPersonalClick={setSelectedPersonal} />}
        {view === 'day' && <DayView onAddPersonalEvent={onAddPersonalEvent} onPersonalClick={setSelectedPersonal} />}
        {view === 'year' && <YearView />}
        {view === 'agenda' && <AgendaView />}
        {view === 'stats' && <StatsView />}
      </div>
      <EventLegend />
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      {selectedPersonal && (
        <PersonalEventDetail event={selectedPersonal} onClose={() => setSelectedPersonal(null)} />
      )}
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

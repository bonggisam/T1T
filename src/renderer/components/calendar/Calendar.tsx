import React, { useState } from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { useUIStore } from '../../store/uiStore';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { TodayView } from './TodayView';
import { YearView } from './YearView';
import { AgendaView } from './AgendaView';
import { StatsView } from './StatsView';
import { CalendarHeader } from './CalendarHeader';
import { SearchPanel } from './SearchPanel';
import { PrintView } from './PrintView';
import { PersonalEventDetail } from './PersonalEventDetail';
import { PrivateContent } from '../common/PrivacyGuard';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import type { PersonalEvent } from '@shared/types';

/** 스스로 여백을 관리하는 화면 */
const FULL_BLEED_VIEWS = new Set(['month', 'week', 'today', 'agenda']);

interface CalendarProps {
  onAddPersonalEvent?: () => void;
}

export function Calendar({ onAddPersonalEvent }: CalendarProps = {}) {
  const { view } = useCalendarStore();
  const { categoryFilter, setCategoryFilter, calendarTool, setCalendarTool } = useUIStore();
  const showSearch = calendarTool === 'search';
  const showPrint = calendarTool === 'print';
  const [selectedPersonal, setSelectedPersonal] = useState<PersonalEvent | null>(null);

  // 전역 단축키
  useKeyboardShortcuts({
    onSearch: () => setCalendarTool('search'),
    onAddPersonal: onAddPersonalEvent,
  });

  if (showPrint) {
    return <PrintView onClose={() => setCalendarTool(null)} />;
  }

  return (
    <div style={styles.container}>
      <CalendarHeader
        onAddPersonalEvent={onAddPersonalEvent}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
      />
      <div style={{ ...styles.viewContainer, padding: FULL_BLEED_VIEWS.has(view) ? 0 : '0 8px' }}>
        {view === 'month' && <MonthView onAddPersonalEvent={onAddPersonalEvent} onPersonalClick={setSelectedPersonal} />}
        {view === 'week' && <WeekView onAddPersonalEvent={onAddPersonalEvent} onPersonalClick={setSelectedPersonal} />}
        {view === 'day' && <DayView onAddPersonalEvent={onAddPersonalEvent} onPersonalClick={setSelectedPersonal} />}
        {view === 'today' && <TodayView onAddPersonalEvent={onAddPersonalEvent} onPersonalClick={setSelectedPersonal} />}
        {view === 'year' && <YearView />}
        {view === 'agenda' && <AgendaView onPersonalClick={setSelectedPersonal} />}
        {view === 'stats' && <StatsView />}
      </div>
      {showSearch && <SearchPanel onClose={() => setCalendarTool(null)} />}
      {selectedPersonal && (
        <PrivateContent>
          <PersonalEventDetail event={selectedPersonal} onClose={() => setSelectedPersonal(null)} />
        </PrivateContent>
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
  },
};

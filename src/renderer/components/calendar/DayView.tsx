import React from 'react';
import { format, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView() {
  const { selectedDate, events, setSelectedEvent, setShowEventDetail } = useCalendarStore();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  const dayEvents = events.filter((e) => {
    const start = new Date(e.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(e.endDate);
    end.setHours(23, 59, 59, 999);
    const d = new Date(selectedDate);
    d.setHours(12, 0, 0, 0);
    return d >= start && d <= end;
  });

  const dayPersonalEvents = personalEvents.filter((e) => {
    const start = new Date(e.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(e.endDate);
    end.setHours(23, 59, 59, 999);
    const d = new Date(selectedDate);
    d.setHours(12, 0, 0, 0);
    return d >= start && d <= end;
  });

  const allDayEvents = dayEvents.filter((e) => e.allDay);
  const timedEvents = dayEvents.filter((e) => !e.allDay);

  function getEventsAtHour(hour: number): CalendarEvent[] {
    return timedEvents.filter((e) => new Date(e.startDate).getHours() === hour);
  }

  function getPersonalEventsAtHour(hour: number): PersonalEvent[] {
    return dayPersonalEvents.filter((e) => new Date(e.startDate).getHours() === hour);
  }

  return (
    <div style={styles.container}>
      <div style={styles.dayLabel}>
        {format(selectedDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div style={styles.allDaySection}>
          <span style={styles.allDayLabel}>종일</span>
          {allDayEvents.map((event) => (
            <div
              key={event.id}
              onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
              style={{ ...styles.allDayEvent, background: event.adminColor }}
            >
              <span style={styles.eventText}>{event.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hour grid */}
      <div style={styles.hourGrid}>
        {HOURS.map((hour) => {
          const hourEvents = getEventsAtHour(hour);
          const hourPersonal = getPersonalEventsAtHour(hour);
          return (
            <div key={hour} style={styles.hourRow}>
              <div style={styles.timeLabel}>
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div style={styles.hourContent}>
                {hourEvents.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
                    style={{ ...styles.eventBlock, background: event.adminColor }}
                  >
                    <span style={styles.eventTitle}>{event.title}</span>
                    <span style={styles.eventTime}>
                      {format(new Date(event.startDate), 'HH:mm')} - {format(new Date(event.endDate), 'HH:mm')}
                    </span>
                  </div>
                ))}
                {hourPersonal.map((pe) => (
                  <div
                    key={pe.id}
                    style={{
                      ...styles.eventBlock,
                      background: pe.color,
                      opacity: 0.85,
                      borderLeft: '3px solid rgba(255,255,255,0.5)',
                    }}
                  >
                    <span style={styles.eventTitle}>{pe.title}</span>
                    <span style={styles.eventTime}>
                      {format(new Date(pe.startDate), 'HH:mm')} - {format(new Date(pe.endDate), 'HH:mm')}
                      {' '}({pe.source === 'local' ? '개인' : pe.source})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'auto',
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: 600,
    padding: '8px 4px',
    color: 'var(--text-primary)',
  },
  allDaySection: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
    padding: '4px 4px 8px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  allDayLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
    marginRight: 4,
  },
  allDayEvent: {
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
  },
  eventText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: 500,
    textShadow: '0 0 2px rgba(0,0,0,0.3)',
  },
  hourGrid: {
    display: 'flex',
    flexDirection: 'column',
  },
  hourRow: {
    display: 'flex',
    minHeight: 44,
    borderBottom: '1px solid var(--border-subtle)',
  },
  timeLabel: {
    width: 48,
    flexShrink: 0,
    fontSize: 10,
    color: 'var(--text-muted)',
    padding: '4px 4px 0 0',
    textAlign: 'right',
  },
  hourContent: {
    flex: 1,
    padding: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  eventBlock: {
    borderRadius: 4,
    padding: '4px 8px',
    cursor: 'pointer',
  },
  eventTitle: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 600,
    display: 'block',
    textShadow: '0 0 2px rgba(0,0,0,0.3)',
  },
  eventTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
  },
};

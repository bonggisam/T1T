import React from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, format, isWeekend,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function MonthView() {
  const { currentMonth, events, selectedDate, setSelectedDate, setSelectedEvent, setShowEventDetail } = useCalendarStore();
  const { notifications } = useNotificationStore();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  // Track which event IDs have unread notifications
  const unreadEventIds = new Set(
    notifications.filter((n) => !n.read && n.eventId).map((n) => n.eventId)
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  function getEventsForDay(date: Date): CalendarEvent[] {
    return events.filter((e) => {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  }

  function getPersonalEventsForDay(date: Date): PersonalEvent[] {
    return personalEvents.filter((e) => {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  }

  function handleEventClick(e: React.MouseEvent, event: CalendarEvent) {
    e.stopPropagation();
    setSelectedEvent(event);
    setShowEventDetail(true);
  }

  return (
    <div style={styles.container}>
      {/* Weekday headers */}
      <div style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            style={{
              ...styles.weekdayCell,
              color: i === 0 ? 'var(--weekend-text)' : i === 6 ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={styles.grid}>
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const dayPersonal = getPersonalEventsForDay(day);
          const allDayEvents = [...dayEvents, ...dayPersonal];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const dayOfWeek = day.getDay();

          return (
            <div
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              style={{
                ...styles.dayCell,
                ...(today ? styles.today : {}),
                ...(selected ? styles.selected : {}),
                opacity: inMonth ? 1 : 0.35,
              }}
            >
              <div style={styles.dayHeader}>
                <span
                  style={{
                    ...styles.dayNumber,
                    color: dayOfWeek === 0 ? 'var(--weekend-text)' : dayOfWeek === 6 ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.some((e) => unreadEventIds.has(e.id)) && (
                  <span style={styles.newBadge}>NEW</span>
                )}
              </div>
              <div style={styles.eventList}>
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => handleEventClick(e, event)}
                    style={{
                      ...styles.eventDot,
                      background: event.adminColor,
                    }}
                    title={`${event.title} (${event.adminName})`}
                  >
                    <span style={styles.eventDotText}>
                      {event.title.length > 6 ? event.title.slice(0, 6) + '..' : event.title}
                    </span>
                  </div>
                ))}
                {dayEvents.length <= 3 && dayPersonal.slice(0, 3 - dayEvents.length).map((pe) => (
                  <div
                    key={pe.id}
                    style={{
                      ...styles.eventDot,
                      background: pe.color,
                      opacity: 0.85,
                      borderLeft: '2px solid rgba(255,255,255,0.5)',
                    }}
                    title={`${pe.title} (${pe.source === 'local' ? '개인' : pe.source})`}
                  >
                    <span style={styles.eventDotText}>
                      {pe.title.length > 6 ? pe.title.slice(0, 6) + '..' : pe.title}
                    </span>
                  </div>
                ))}
                {allDayEvents.length > 3 && (
                  <span style={styles.moreCount}>+{allDayEvents.length - 3}</span>
                )}
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
  },
  weekdayRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 1,
    marginBottom: 4,
  },
  weekdayCell: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 0',
    textShadow: '0 0 4px rgba(255,255,255,0.8)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 0,
    flex: 1,
    border: '1px solid var(--grid-line)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  dayCell: {
    padding: '3px 4px',
    minHeight: 52,
    cursor: 'pointer',
    transition: 'background 0.12s',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: '1px solid var(--grid-line)',
    borderBottom: '1px solid var(--grid-line)',
  },
  today: {
    background: 'var(--today-bg)',
  },
  selected: {
    outline: '2px solid var(--accent)',
    outlineOffset: -2,
  },
  dayHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    textShadow: '0 0 4px rgba(255,255,255,0.8)',
  },
  newBadge: {
    fontSize: 7,
    fontWeight: 700,
    color: '#fff',
    background: '#E74C3C',
    borderRadius: 3,
    padding: '1px 3px',
    lineHeight: 1.2,
    animation: 'pulse 2s infinite',
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    overflow: 'hidden',
    flex: 1,
  },
  eventDot: {
    borderRadius: 3,
    padding: '1px 4px',
    cursor: 'pointer',
    transition: 'filter 0.12s',
  },
  eventDotText: {
    fontSize: 9,
    fontWeight: 500,
    color: '#fff',
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
    textShadow: '0 0 2px rgba(0,0,0,0.3)',
  },
  moreCount: {
    fontSize: 9,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
};

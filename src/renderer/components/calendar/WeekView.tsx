import React from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, isToday, eachHourOfInterval,
  startOfDay, endOfDay, getHours, getMinutes,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView() {
  const { selectedDate, events, setSelectedEvent, setShowEventDetail } = useCalendarStore();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  function getEventsForDay(date: Date): CalendarEvent[] {
    return events.filter((e) => {
      const start = new Date(e.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(e.endDate);
      end.setHours(23, 59, 59, 999);
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  }

  function getPersonalEventsForDay(date: Date): PersonalEvent[] {
    return personalEvents.filter((e) => {
      const start = new Date(e.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(e.endDate);
      end.setHours(23, 59, 59, 999);
      const d = new Date(date);
      d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  }

  return (
    <div style={styles.container}>
      {/* Day headers */}
      <div style={styles.headerRow}>
        <div style={styles.timeGutter}></div>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            style={{
              ...styles.dayHeader,
              ...(isToday(day) ? styles.todayHeader : {}),
            }}
          >
            <span style={styles.dayName}>{format(day, 'EEE', { locale: ko })}</span>
            <span style={{
              ...styles.dayNum,
              ...(isToday(day) ? styles.todayNum : {}),
            }}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div style={styles.gridScroll}>
        <div style={styles.grid}>
          {HOURS.map((hour) => (
            <div key={hour} style={styles.hourRow}>
              <div style={styles.timeGutter}>
                <span style={styles.timeLabel}>{hour.toString().padStart(2, '0')}:00</span>
              </div>
              {days.map((day) => {
                const dayEvents = getEventsForDay(day).filter((e) => {
                  if (e.allDay) return hour === 0;
                  const h = new Date(e.startDate).getHours();
                  return h === hour;
                });
                const dayPersonal = getPersonalEventsForDay(day).filter((e) => {
                  const h = new Date(e.startDate).getHours();
                  return h === hour;
                });
                return (
                  <div key={day.toISOString()} style={styles.hourCell}>
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
                        style={{
                          ...styles.eventBlock,
                          background: event.adminColor,
                        }}
                        title={event.title}
                      >
                        <span style={styles.eventText}>{event.title}</span>
                      </div>
                    ))}
                    {dayPersonal.map((pe) => (
                      <div
                        key={pe.id}
                        style={{
                          ...styles.eventBlock,
                          background: pe.color,
                          opacity: 0.85,
                          borderLeft: '2px solid rgba(255,255,255,0.5)',
                        }}
                        title={`${pe.title} (${pe.source === 'local' ? '개인' : pe.source})`}
                      >
                        <span style={styles.eventText}>{pe.title}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
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
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '40px repeat(7, 1fr)',
    gap: 1,
    borderBottom: '1px solid var(--grid-line)',
    flexShrink: 0,
  },
  timeGutter: {
    width: 40,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 2,
  },
  dayHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 0',
  },
  todayHeader: {},
  dayName: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  dayNum: {
    fontSize: 14,
    fontWeight: 700,
    textShadow: '0 0 4px rgba(255,255,255,0.8)',
  },
  todayNum: {
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: '50%',
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
  },
  gridScroll: {
    flex: 1,
    overflow: 'auto',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
  },
  hourRow: {
    display: 'grid',
    gridTemplateColumns: '40px repeat(7, 1fr)',
    gap: 1,
    minHeight: 40,
    borderBottom: '1px solid var(--grid-line)',
  },
  timeLabel: {
    fontSize: 9,
    color: 'var(--text-muted)',
  },
  hourCell: {
    padding: 1,
    overflow: 'hidden',
  },
  eventBlock: {
    borderRadius: 3,
    padding: '1px 4px',
    marginBottom: 1,
    cursor: 'pointer',
  },
  eventText: {
    fontSize: 9,
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
    textShadow: '0 0 2px rgba(0,0,0,0.3)',
  },
};

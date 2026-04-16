import React, { useState, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, format,
  differenceInDays, addDays, isSameWeek,
} from 'date-fns';
import { useCalendarStore } from '../../store/calendarStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useComciganStore } from '../../store/comciganStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function MonthView() {
  const { currentMonth, events, selectedDate, setSelectedDate, setSelectedEvent, setShowEventDetail, updateEvent } = useCalendarStore();
  const { notifications } = useNotificationStore();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();
  const { getPeriodsForWeekday, config: comciganConfig } = useComciganStore();

  // Mouse-based drag state
  const [dragEventId, setDragEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

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
    if (isDragging.current) return;
    setSelectedEvent(event);
    setShowEventDetail(true);
  }

  // Mouse-based drag handlers (works on transparent windows)
  function handleMouseDown(e: React.MouseEvent, eventId: string) {
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setDragEventId(eventId);
    isDragging.current = false;
  }

  function handleMouseMoveOnCell(dayStr: string) {
    if (!dragEventId) return;
    if (dragStartPos.current) {
      isDragging.current = true;
    }
    if (dragOverDate !== dayStr) setDragOverDate(dayStr);
  }

  async function handleMouseUpOnCell(targetDay: Date) {
    if (!dragEventId || !isDragging.current) {
      setDragEventId(null);
      setDragOverDate(null);
      dragStartPos.current = null;
      isDragging.current = false;
      return;
    }

    const event = events.find((ev) => ev.id === dragEventId);
    setDragEventId(null);
    setDragOverDate(null);
    dragStartPos.current = null;

    if (!event) { isDragging.current = false; return; }

    const oldStart = new Date(event.startDate);
    const daysDiff = differenceInDays(
      targetDay,
      new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate())
    );

    if (daysDiff !== 0) {
      const newStart = addDays(oldStart, daysDiff);
      const newEnd = addDays(new Date(event.endDate), daysDiff);
      try {
        await updateEvent(event.id, { startDate: newStart, endDate: newEnd });
      } catch (err) {
        console.error('Failed to move event:', err);
      }
    }
    // Reset after a tick so click handler doesn't fire
    setTimeout(() => { isDragging.current = false; }, 50);
  }

  function handleGlobalMouseUp() {
    if (dragEventId) {
      setDragEventId(null);
      setDragOverDate(null);
      dragStartPos.current = null;
      setTimeout(() => { isDragging.current = false; }, 50);
    }
  }

  return (
    <div style={styles.container} onMouseUp={handleGlobalMouseUp} onMouseLeave={handleGlobalMouseUp}>
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
          const dayOfWeek = day.getDay();
          // 시간표는 이번 주 평일에 표시
          const isCurrentWeek = isSameWeek(day, new Date(), { weekStartsOn: 0 });
          const comciganPeriods = (isCurrentWeek && dayOfWeek >= 1 && dayOfWeek <= 5 && comciganConfig)
            ? getPeriodsForWeekday(dayOfWeek)
            : [];
          const allDayEvents = [...dayEvents, ...dayPersonal];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const dayStr = day.toISOString();
          const isDropTarget = dragOverDate === dayStr && dragEventId;

          return (
            <div
              key={dayStr}
              onClick={() => { if (!isDragging.current) setSelectedDate(day); }}
              onMouseMove={() => handleMouseMoveOnCell(dayStr)}
              onMouseUp={() => handleMouseUpOnCell(day)}
              style={{
                ...styles.dayCell,
                ...(today ? styles.today : {}),
                ...(selected ? styles.selected : {}),
                ...(isDropTarget ? styles.dragOver : {}),
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
                {/* 시간표 최우선 표시 (오늘만) */}
                {comciganPeriods.map((cp) => (
                  <div
                    key={`cc-${cp.period}`}
                    style={styles.comciganDot}
                    title={`${cp.period}교시 ${cp.subject} ${cp.grade}-${cp.classNum}`}
                  >
                    <span style={styles.comciganText}>
                      📚{cp.period} {cp.subject} {cp.grade}-{cp.classNum}
                    </span>
                  </div>
                ))}
                {/* 학교 일정 */}
                {dayEvents.slice(0, comciganPeriods.length > 0 ? 2 : 3).map((event) => (
                  <div
                    key={event.id}
                    onMouseDown={(e) => handleMouseDown(e, event.id)}
                    onClick={(e) => handleEventClick(e, event)}
                    style={{
                      ...styles.eventDot,
                      background: event.adminColor,
                      opacity: dragEventId === event.id ? 0.5 : 1,
                      cursor: dragEventId ? 'grabbing' : 'grab',
                    }}
                    title={`${event.title} (${event.adminName})`}
                  >
                    <span style={styles.eventDotText}>
                      {event.title.length > 6 ? event.title.slice(0, 6) + '..' : event.title}
                    </span>
                  </div>
                ))}
                {/* 개인 일정 */}
                {dayPersonal.slice(0, Math.max(0, (comciganPeriods.length > 0 ? 2 : 3) - dayEvents.length)).map((pe) => (
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
                {(allDayEvents.length + comciganPeriods.length) > (comciganPeriods.length + 2) && (
                  <span style={styles.moreCount}>+{allDayEvents.length - 2}</span>
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
    textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)',
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
  dragOver: {
    background: 'rgba(74, 144, 226, 0.2)',
    outline: '2px dashed var(--accent)',
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
    textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)',
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
    cursor: 'grab',
    transition: 'filter 0.12s, opacity 0.15s',
  },
  eventDotText: {
    fontSize: 'var(--schedule-font-size, 9px)' as any,
    fontWeight: 500,
    color: '#fff',
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
  },
  comciganDot: {
    borderRadius: 3,
    padding: '1px 4px',
    background: 'var(--comcigan-bg)',
    cursor: 'default',
  },
  comciganText: {
    fontSize: 'var(--schedule-font-size, 9px)' as any,
    fontWeight: 600,
    color: 'var(--comcigan-text)',
    lineHeight: '13px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
    textShadow: 'var(--comcigan-shadow)',
  },
  moreCount: {
    fontSize: 'var(--schedule-font-size, 9px)' as any,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
};

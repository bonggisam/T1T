import React, { useState, useRef, useCallback, useEffect } from 'react';
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
const DRAG_THRESHOLD = 8; // px — must move this far before drag activates

export function MonthView() {
  const { currentMonth, events, selectedDate, setSelectedDate, setSelectedEvent, setShowEventDetail, updateEvent } = useCalendarStore();
  const { notifications } = useNotificationStore();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();
  const { getPeriodsForWeekday, config: comciganConfig } = useComciganStore();

  // Drag state — all refs to avoid async setState issues
  const dragRef = useRef<{
    eventId: string;
    startX: number;
    startY: number;
    activated: boolean;
  } | null>(null);
  const [dragVisual, setDragVisual] = useState<{ eventId: string; overDayStr: string } | null>(null);
  const cellDateMap = useRef<Map<Element, Date>>(new Map());

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
    // If drag was activated, don't open detail
    if (dragRef.current?.activated) return;
    setSelectedEvent(event);
    setShowEventDetail(true);
  }

  function handleEventMouseDown(e: React.MouseEvent, eventId: string) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      eventId,
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
    };
  }

  // Global mouse move/up via window listeners
  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;

    // Check threshold
    if (!dragRef.current.activated) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragRef.current.activated = true;
    }

    // Find which cell the mouse is over
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    // Walk up to find [data-day-str]
    const cell = el.closest('[data-day-str]');
    if (cell) {
      const dayStr = cell.getAttribute('data-day-str') || '';
      setDragVisual({ eventId: dragRef.current.eventId, overDayStr: dayStr });
    }
  }, []);

  const handleWindowMouseUp = useCallback(async (e: MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;

    if (!drag || !drag.activated) {
      setDragVisual(null);
      return;
    }

    // Find target cell
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest('[data-day-str]');
    setDragVisual(null);

    if (!cell) return;
    const dayStr = cell.getAttribute('data-day-str');
    if (!dayStr) return;

    const targetDay = new Date(dayStr);
    const event = events.find((ev) => ev.id === drag.eventId);
    if (!event) return;

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
  }, [events, updateEvent]);

  useEffect(() => {
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [handleWindowMouseMove, handleWindowMouseUp]);

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
          const dayOfWeek = day.getDay();
          const isCurrentWeek = isSameWeek(day, new Date(), { weekStartsOn: 0 });
          const comciganPeriods = (isCurrentWeek && dayOfWeek >= 1 && dayOfWeek <= 5 && comciganConfig)
            ? getPeriodsForWeekday(dayOfWeek)
            : [];
          const allDayEvents = [...dayEvents, ...dayPersonal];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const dayStr = day.toISOString();
          const isDropTarget = dragVisual?.overDayStr === dayStr;

          return (
            <div
              key={dayStr}
              data-day-str={dayStr}
              onClick={() => { if (!dragRef.current?.activated) setSelectedDate(day); }}
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
                {/* 시간표 최우선 표시 */}
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
                {/* 학교 일정 — 드래그 가능 */}
                {dayEvents.slice(0, comciganPeriods.length > 0 ? 2 : 3).map((event) => (
                  <div
                    key={event.id}
                    onMouseDown={(e) => handleEventMouseDown(e, event.id)}
                    onClick={(e) => handleEventClick(e, event)}
                    style={{
                      ...styles.eventDot,
                      background: event.adminColor,
                      opacity: dragVisual?.eventId === event.id ? 0.5 : 1,
                      cursor: dragVisual ? 'grabbing' : 'grab',
                    }}
                    title={`${event.title} (${event.adminName}) — 드래그로 날짜 이동`}
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
                {allDayEvents.length > (comciganPeriods.length > 0 ? 2 : 3) && (
                  <span style={styles.moreCount}>+{allDayEvents.length - (comciganPeriods.length > 0 ? 2 : 3)}</span>
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

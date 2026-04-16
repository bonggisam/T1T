import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, format,
  differenceInDays, addDays, isSameWeek,
} from 'date-fns';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useComciganStore } from '../../store/comciganStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DRAG_THRESHOLD = 6;

interface DragInfo {
  eventId: string;
  type: 'shared' | 'personal';
  startX: number;
  startY: number;
  activated: boolean;
}

export function MonthView() {
  const { currentMonth, events, selectedDate, setSelectedDate, setSelectedEvent, setShowEventDetail, updateEvent } = useCalendarStore();
  const { user } = useAuthStore();
  const { notifications } = useNotificationStore();
  const { allPersonalEvents, updatePersonalEvent } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();
  const { getPeriodsForWeekday, config: comciganConfig } = useComciganStore();

  const dragRef = useRef<DragInfo | null>(null);
  const [dragVisual, setDragVisual] = useState<{ eventId: string; overDayStr: string } | null>(null);

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
    if (dragRef.current?.activated) return;
    setSelectedEvent(event);
    setShowEventDetail(true);
  }

  // 공유 일정: 본인 작성만 드래그 가능
  function handleSharedMouseDown(e: React.MouseEvent, event: CalendarEvent) {
    if (event.createdBy !== user?.id) return; // 본인만
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      eventId: event.id,
      type: 'shared',
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
    };
  }

  // 개인 일정: 항상 본인 것이므로 드래그 가능 (외부 캘린더 제외)
  function handlePersonalMouseDown(e: React.MouseEvent, pe: PersonalEvent) {
    if (pe.source !== 'local') return; // 외부 연동 일정은 이동 불가
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      eventId: pe.id,
      type: 'personal',
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
    };
  }

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    if (!dragRef.current.activated) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragRef.current.activated = true;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
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
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest('[data-day-str]');
    setDragVisual(null);
    if (!cell) return;
    const dayStr = cell.getAttribute('data-day-str');
    if (!dayStr) return;

    const targetDay = new Date(dayStr);

    if (drag.type === 'shared') {
      const event = events.find((ev) => ev.id === drag.eventId);
      if (!event) return;
      const oldStart = new Date(event.startDate);
      const daysDiff = differenceInDays(targetDay, new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate()));
      if (daysDiff !== 0) {
        try {
          await updateEvent(event.id, { startDate: addDays(oldStart, daysDiff), endDate: addDays(new Date(event.endDate), daysDiff) });
        } catch (err) {
          console.error('Failed to move shared event:', err);
        }
      }
    } else if (drag.type === 'personal') {
      const pe = personalEvents.find((p) => p.id === drag.eventId);
      if (!pe || !user) return;
      const oldStart = new Date(pe.startDate);
      const daysDiff = differenceInDays(targetDay, new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate()));
      if (daysDiff !== 0) {
        try {
          await updatePersonalEvent(user.id, pe.id, { startDate: addDays(oldStart, daysDiff), endDate: addDays(new Date(pe.endDate), daysDiff) });
        } catch (err) {
          console.error('Failed to move personal event:', err);
        }
      }
    }
  }, [events, personalEvents, user, updateEvent, updatePersonalEvent]);

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
                <span style={{
                  ...styles.dayNumber,
                  color: dayOfWeek === 0 ? 'var(--weekend-text)' : dayOfWeek === 6 ? 'var(--accent)' : 'var(--text-primary)',
                }}>
                  {format(day, 'd')}
                </span>
                {dayEvents.some((e) => unreadEventIds.has(e.id)) && (
                  <span style={styles.newBadge}>NEW</span>
                )}
              </div>
              <div style={styles.eventList}>
                {/* 시간표 */}
                {comciganPeriods.map((cp) => (
                  <div key={`cc-${cp.period}`} style={styles.comciganDot} title={`${cp.period}교시 ${cp.subject} ${cp.grade}-${cp.classNum}`}>
                    <span style={styles.comciganText}>📚{cp.period} {cp.subject} {cp.grade}-{cp.classNum}</span>
                  </div>
                ))}
                {/* 공유 일정 */}
                {dayEvents.slice(0, comciganPeriods.length > 0 ? 2 : 3).map((event) => {
                  const isOwner = event.createdBy === user?.id;
                  return (
                    <div
                      key={event.id}
                      onMouseDown={(e) => handleSharedMouseDown(e, event)}
                      onClick={(e) => handleEventClick(e, event)}
                      style={{
                        ...styles.eventDot,
                        background: event.adminColor,
                        opacity: dragVisual?.eventId === event.id ? 0.5 : 1,
                        cursor: isOwner ? (dragVisual ? 'grabbing' : 'grab') : 'pointer',
                      }}
                      title={`${event.title} (${event.adminName})${isOwner ? ' — 드래그로 이동' : ''}`}
                    >
                      <span style={styles.eventDotText}>
                        {event.title.length > 6 ? event.title.slice(0, 6) + '..' : event.title}
                      </span>
                    </div>
                  );
                })}
                {/* 개인 일정 */}
                {dayPersonal.slice(0, Math.max(0, (comciganPeriods.length > 0 ? 2 : 3) - dayEvents.length)).map((pe) => {
                  const canDrag = pe.source === 'local';
                  return (
                    <div
                      key={pe.id}
                      onMouseDown={(e) => handlePersonalMouseDown(e, pe)}
                      style={{
                        ...styles.eventDot,
                        background: pe.color,
                        opacity: dragVisual?.eventId === pe.id ? 0.5 : 0.85,
                        borderLeft: '2px solid rgba(255,255,255,0.5)',
                        cursor: canDrag ? (dragVisual ? 'grabbing' : 'grab') : 'default',
                      }}
                      title={`${pe.title} (${pe.source === 'local' ? '개인' : pe.source})${canDrag ? ' — 드래그로 이동' : ''}`}
                    >
                      <span style={styles.eventDotText}>
                        {pe.title.length > 6 ? pe.title.slice(0, 6) + '..' : pe.title}
                      </span>
                    </div>
                  );
                })}
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
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  weekdayRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 4 },
  weekdayCell: { textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0', textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, flex: 1, border: '1px solid var(--grid-line)', borderRadius: 6, overflow: 'hidden' },
  dayCell: { padding: '3px 4px', minHeight: 52, cursor: 'pointer', transition: 'background 0.12s', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--grid-line)', borderBottom: '1px solid var(--grid-line)' },
  today: { background: 'var(--today-bg)' },
  selected: { outline: '2px solid var(--accent)', outlineOffset: -2 },
  dragOver: { background: 'rgba(74, 144, 226, 0.2)', outline: '2px dashed var(--accent)', outlineOffset: -2 },
  dayHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  dayNumber: { fontSize: 12, fontWeight: 700, lineHeight: 1, textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)' },
  newBadge: { fontSize: 7, fontWeight: 700, color: '#fff', background: '#E74C3C', borderRadius: 3, padding: '1px 3px', lineHeight: 1.2, animation: 'pulse 2s infinite' },
  eventList: { display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden', flex: 1 },
  eventDot: { borderRadius: 3, padding: '1px 4px', transition: 'filter 0.12s, opacity 0.15s' },
  eventDotText: { fontSize: 'var(--schedule-font-size, 9px)' as any, fontWeight: 500, color: '#fff', lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textShadow: '0 1px 2px rgba(0,0,0,0.4)' },
  comciganDot: { borderRadius: 3, padding: '1px 4px', background: 'var(--comcigan-bg)', cursor: 'default' },
  comciganText: { fontSize: 'var(--schedule-font-size, 9px)' as any, fontWeight: 600, color: 'var(--comcigan-text)', lineHeight: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textShadow: 'var(--comcigan-shadow)' },
  moreCount: { fontSize: 'var(--schedule-font-size, 9px)' as any, color: 'var(--text-muted)', textAlign: 'center' },
};

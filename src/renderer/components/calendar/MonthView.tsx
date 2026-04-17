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
  originDayStr: string;
}

interface QuickAddPopup {
  dayStr: string;
  x: number;
  y: number;
}

interface MonthViewProps {
  onAddPersonalEvent?: () => void;
}

export function MonthView({ onAddPersonalEvent }: MonthViewProps) {
  const {
    currentMonth, events, selectedDate,
    setSelectedDate, setSelectedEvent, setShowEventDetail, setShowEventModal, updateEvent,
  } = useCalendarStore();
  const { user } = useAuthStore();
  const { notifications } = useNotificationStore();
  const { allPersonalEvents, updatePersonalEvent } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();
  const { getPeriodsForWeekday, config: comciganConfig } = useComciganStore();

  const dragRef = useRef<DragInfo | null>(null);
  const [dragVisual, setDragVisual] = useState<{ eventId: string; overDayStr: string } | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddPopup | null>(null);

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

  // 날짜 셀 클릭 → 선택 + 빠른 추가 팝업
  function handleDayCellClick(e: React.MouseEvent, day: Date, dayStr: string) {
    if (dragRef.current?.activated) return;
    setSelectedDate(day);
    // 빈 영역 클릭 시 퀵 추가 팝업
    if (user) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setQuickAdd({
        dayStr,
        x: rect.left + rect.width / 2,
        y: rect.bottom,
      });
    }
  }

  // 퀵 추가: 공유 일정
  function handleQuickAddShared() {
    if (quickAdd) {
      const [y, m, d] = quickAdd.dayStr.split('-').map(Number);
      setSelectedDate(new Date(y, m - 1, d));
    }
    setQuickAdd(null);
    // 약간의 딜레이로 selectedDate 반영 후 모달 열기
    setTimeout(() => setShowEventModal(true), 0);
  }

  // 퀵 추가: 개인 일정
  function handleQuickAddPersonal() {
    if (quickAdd) {
      const [y, m, d] = quickAdd.dayStr.split('-').map(Number);
      setSelectedDate(new Date(y, m - 1, d));
    }
    setQuickAdd(null);
    setTimeout(() => {
      if (onAddPersonalEvent) onAddPersonalEvent();
    }, 0);
  }

  // 다른 곳 클릭 시 팝업 닫기
  useEffect(() => {
    if (!quickAdd) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-quick-add]')) {
        setQuickAdd(null);
      }
    };
    window.addEventListener('mousedown', close, true);
    return () => window.removeEventListener('mousedown', close, true);
  }, [quickAdd]);

  // 공유 일정: 본인 작성만 드래그 가능
  function handleSharedMouseDown(e: React.MouseEvent, event: CalendarEvent, dayStr: string) {
    if (event.createdBy !== user?.id) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      eventId: event.id,
      type: 'shared',
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
      originDayStr: dayStr,
    };
  }

  // 개인 일정: 로컬만 드래그 가능
  function handlePersonalMouseDown(e: React.MouseEvent, pe: PersonalEvent, dayStr: string) {
    if (pe.source !== 'local') return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      eventId: pe.id,
      type: 'personal',
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
      originDayStr: dayStr,
    };
  }

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    if (!dragRef.current.activated) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragRef.current.activated = true;
      setQuickAdd(null); // 드래그 시작하면 퀵 추가 팝업 닫기
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

    // Parse yyyy-MM-dd as local date
    const [y, m, d] = dayStr.split('-').map(Number);
    const targetDay = new Date(y, m - 1, d);

    // origin day 파싱 (드래그 시작한 셀 기준으로 차이 계산)
    const [oy, om, od] = drag.originDayStr.split('-').map(Number);
    const originDay = new Date(oy, om - 1, od);
    const daysDiff = differenceInDays(targetDay, originDay);

    if (daysDiff === 0) return; // 같은 날이면 무시

    if (drag.type === 'shared') {
      const event = events.find((ev) => ev.id === drag.eventId);
      if (!event) return;
      const oldStart = new Date(event.startDate);
      const oldEnd = new Date(event.endDate);
      const newStart = addDays(oldStart, daysDiff);
      const newEnd = addDays(oldEnd, daysDiff);
      console.log('[Drag] Moving shared event:', event.title, 'by', daysDiff, 'days →', newStart.toISOString(), newEnd.toISOString());
      try {
        await updateEvent(event.id, { startDate: newStart, endDate: newEnd });
      } catch (err) {
        console.error('Failed to move shared event:', err);
      }
    } else if (drag.type === 'personal') {
      const pe = personalEvents.find((p) => p.id === drag.eventId);
      if (!pe || !user) return;
      const oldStart = new Date(pe.startDate);
      const oldEnd = new Date(pe.endDate);
      const newStart = addDays(oldStart, daysDiff);
      const newEnd = addDays(oldEnd, daysDiff);
      console.log('[Drag] Moving personal event:', pe.title, 'by', daysDiff, 'days →', newStart.toISOString(), newEnd.toISOString());
      try {
        await updatePersonalEvent(user.id, pe.id, { startDate: newStart, endDate: newEnd });
      } catch (err) {
        console.error('Failed to move personal event:', err);
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
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const dayStr = format(day, 'yyyy-MM-dd');
          const isDropTarget = dragVisual?.overDayStr === dayStr;
          const hasEvents = dayEvents.length + dayPersonal.length > 0;
          const maxEvents = 3;
          // 시간표가 있으면 1줄로 요약, 이벤트 표시 우선
          const showTimetableSummary = comciganPeriods.length > 0 && hasEvents;
          const timetableSlots = showTimetableSummary ? 1 : Math.min(comciganPeriods.length, 3);
          const eventSlots = maxEvents - timetableSlots;

          return (
            <div
              key={dayStr}
              data-day-str={dayStr}
              onClick={(e) => handleDayCellClick(e, day, dayStr)}
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
                {/* 공유 일정 (우선 표시) */}
                {dayEvents.slice(0, eventSlots).map((event) => {
                  const isOwner = event.createdBy === user?.id;
                  return (
                    <div
                      key={event.id}
                      onMouseDown={(e) => handleSharedMouseDown(e, event, dayStr)}
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
                {dayPersonal.slice(0, Math.max(0, eventSlots - dayEvents.length)).map((pe) => {
                  const canDrag = pe.source === 'local';
                  return (
                    <div
                      key={pe.id}
                      onMouseDown={(e) => handlePersonalMouseDown(e, pe, dayStr)}
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
                {/* 시간표 (이벤트 아래에, 공간 있으면 표시) */}
                {showTimetableSummary ? (
                  <div style={styles.comciganSummary} title={comciganPeriods.map((cp) => `${cp.period}교시 ${cp.subject}`).join(', ')}>
                    <span style={styles.comciganSummaryText}>
                      📚 {comciganPeriods.map((cp) => cp.subject).slice(0, 3).join('·')}{comciganPeriods.length > 3 ? '…' : ''}
                    </span>
                  </div>
                ) : (
                  comciganPeriods.slice(0, timetableSlots).map((cp) => (
                    <div key={`cc-${cp.period}`} style={styles.comciganDot} title={`${cp.period}교시 ${cp.subject} ${cp.grade}-${cp.classNum}`}>
                      <span style={styles.comciganText}>📚{cp.period} {cp.subject} {cp.grade}-{cp.classNum}</span>
                    </div>
                  ))
                )}
                {/* 더 보기 카운트 */}
                {(dayEvents.length + dayPersonal.length) > eventSlots && (
                  <span style={styles.moreCount}>+{(dayEvents.length + dayPersonal.length) - eventSlots}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 퀵 추가 팝업 */}
      {quickAdd && (
        <div
          data-quick-add
          style={{
            ...styles.quickAddPopup,
            left: Math.min(quickAdd.x - 70, window.innerWidth - 150),
            top: Math.min(quickAdd.y + 2, window.innerHeight - 80),
          }}
        >
          <button onClick={handleQuickAddShared} style={styles.quickAddBtn}>
            📅 공유 일정 추가
          </button>
          <button onClick={handleQuickAddPersonal} style={styles.quickAddBtn}>
            🔒 개인 일정 추가
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' },
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
  comciganSummary: { borderRadius: 3, padding: '1px 4px', background: 'var(--comcigan-bg)', cursor: 'default', opacity: 0.8 },
  comciganSummaryText: { fontSize: 'var(--schedule-font-size, 9px)' as any, fontWeight: 600, color: 'var(--comcigan-text)', lineHeight: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textShadow: 'var(--comcigan-shadow)' },
  moreCount: { fontSize: 'var(--schedule-font-size, 9px)' as any, color: 'var(--text-muted)', textAlign: 'center' },
  quickAddPopup: {
    position: 'fixed',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 4,
    borderRadius: 8,
    background: 'var(--bg-modal, #fff)',
    border: '1px solid var(--border-color)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    minWidth: 140,
  },
  quickAddBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.1s',
  },
};

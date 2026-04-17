import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, format,
  differenceInCalendarDays, addDays, isSameWeek,
} from 'date-fns';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useComciganStore } from '../../store/comciganStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DRAG_THRESHOLD = 5;
const MAX_VISIBLE_EVENTS = 20;

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

  // 최신 events/personalEvents를 ref에 저장 (드래그 콜백에서 stale closure 방지)
  const eventsRef = useRef(events);
  const personalEventsRef = useRef(personalEvents);
  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { personalEventsRef.current = personalEvents; }, [personalEvents]);

  const unreadEventIds = new Set(
    notifications.filter((n) => !n.read && n.eventId).map((n) => n.eventId)
  );

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const numWeeks = Math.ceil(days.length / 7);

  // 날짜별 일정 필터 (WeekView와 동일한 로직)
  function getEventsForDay(date: Date): CalendarEvent[] {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    return events.filter((e) => {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    });
  }

  function getPersonalEventsForDay(date: Date): PersonalEvent[] {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    return personalEvents.filter((e) => {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
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
    if (user) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setQuickAdd({
        dayStr,
        x: rect.left + rect.width / 2,
        y: rect.bottom,
      });
    }
  }

  function handleQuickAddShared() {
    if (quickAdd) {
      const [y, m, d] = quickAdd.dayStr.split('-').map(Number);
      setSelectedDate(new Date(y, m - 1, d));
    }
    setQuickAdd(null);
    setTimeout(() => setShowEventModal(true), 0);
  }

  function handleQuickAddPersonal() {
    if (quickAdd) {
      const [y, m, d] = quickAdd.dayStr.split('-').map(Number);
      setSelectedDate(new Date(y, m - 1, d));
    }
    setQuickAdd(null);
    setTimeout(() => { if (onAddPersonalEvent) onAddPersonalEvent(); }, 0);
  }

  // 팝업 외부 클릭 → 닫기
  useEffect(() => {
    if (!quickAdd) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-quick-add]')) setQuickAdd(null);
    };
    window.addEventListener('mousedown', close, true);
    return () => window.removeEventListener('mousedown', close, true);
  }, [quickAdd]);

  // ─── 드래그 핸들러 ───
  function handleSharedMouseDown(e: React.MouseEvent, event: CalendarEvent, dayStr: string) {
    if (event.createdBy !== user?.id) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { eventId: event.id, type: 'shared', startX: e.clientX, startY: e.clientY, activated: false, originDayStr: dayStr };
  }

  function handlePersonalMouseDown(e: React.MouseEvent, pe: PersonalEvent, dayStr: string) {
    if (pe.source !== 'local') return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { eventId: pe.id, type: 'personal', startX: e.clientX, startY: e.clientY, activated: false, originDayStr: dayStr };
  }

  // mousemove: 드래그 활성화 + 시각 피드백
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.activated) {
        if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.activated = true;
        setQuickAdd(null);
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const cell = el.closest('[data-day-str]') as HTMLElement | null;
      if (cell) {
        setDragVisual({ eventId: drag.eventId, overDayStr: cell.getAttribute('data-day-str') || '' });
      }
    }

    async function onMouseUp(e: MouseEvent) {
      const drag = dragRef.current;
      dragRef.current = null;

      if (!drag || !drag.activated) {
        setDragVisual(null);
        return;
      }

      setDragVisual(null);

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest('[data-day-str]') as HTMLElement | null;
      if (!cell) { console.log('[Drag] No target cell found'); return; }
      const dayStr = cell.getAttribute('data-day-str');
      if (!dayStr) { console.log('[Drag] No data-day-str attribute'); return; }
      if (dayStr === drag.originDayStr) { console.log('[Drag] Same day, skip'); return; }

      // 로컬 날짜로 파싱 (UTC 문제 방지)
      const [ty, tm, td] = dayStr.split('-').map(Number);
      const [oy, om, od] = drag.originDayStr.split('-').map(Number);
      const targetDay = new Date(ty, tm - 1, td, 12, 0, 0);
      const originDay = new Date(oy, om - 1, od, 12, 0, 0);
      const daysDiff = differenceInCalendarDays(targetDay, originDay);

      console.log('[Drag] Target:', dayStr, 'Origin:', drag.originDayStr, 'Diff:', daysDiff);

      if (daysDiff === 0) return;

      if (drag.type === 'shared') {
        const event = eventsRef.current.find((ev) => ev.id === drag.eventId);
        if (!event) { console.log('[Drag] Shared event not found:', drag.eventId); return; }

        const newStart = addDays(new Date(event.startDate), daysDiff);
        const newEnd = addDays(new Date(event.endDate), daysDiff);
        console.log('[Drag] Moving shared:', event.title, '→', format(newStart, 'yyyy-MM-dd'), '~', format(newEnd, 'yyyy-MM-dd'));

        try {
          await updateEvent(event.id, { startDate: newStart, endDate: newEnd });
          console.log('[Drag] ✅ Shared event update success');
        } catch (err) {
          console.error('[Drag] ❌ Shared event update failed:', err);
          alert('일정 이동 실패: ' + (err instanceof Error ? err.message : String(err)));
        }
      } else if (drag.type === 'personal') {
        if (!user) return;
        const pe = personalEventsRef.current.find((p) => p.id === drag.eventId);
        if (!pe) { console.log('[Drag] Personal event not found:', drag.eventId); return; }

        const newStart = addDays(new Date(pe.startDate), daysDiff);
        const newEnd = addDays(new Date(pe.endDate), daysDiff);
        console.log('[Drag] Moving personal:', pe.title, '→', format(newStart, 'yyyy-MM-dd'), '~', format(newEnd, 'yyyy-MM-dd'));

        try {
          await updatePersonalEvent(user.id, pe.id, { startDate: newStart, endDate: newEnd });
          console.log('[Drag] ✅ Personal event update success');
        } catch (err) {
          console.error('[Drag] ❌ Personal event update failed:', err);
          alert('일정 이동 실패: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [user, updateEvent, updatePersonalEvent]);

  // ─── 렌더링 ───
  return (
    <div style={styles.container}>
      <div style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} style={{
            ...styles.weekdayCell,
            color: i === 0 ? 'var(--weekend-text)' : i === 6 ? 'var(--accent)' : 'var(--text-secondary)',
          }}>
            {label}
          </div>
        ))}
      </div>

      <div style={{ ...styles.grid, gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}>
        {days.map((day) => {
          const dayEvents = getEventsForDay(day);
          const dayPersonal = getPersonalEventsForDay(day);
          const dayOfWeek = day.getDay();
          const isCurrentWeek = isSameWeek(day, new Date(), { weekStartsOn: 0 });
          const comciganPeriods = (isCurrentWeek && dayOfWeek >= 1 && dayOfWeek <= 5 && comciganConfig)
            ? getPeriodsForWeekday(dayOfWeek) : [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const dayStr = format(day, 'yyyy-MM-dd');
          const isDropTarget = dragVisual?.overDayStr === dayStr;

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
              {/* 날짜 헤더 */}
              <div style={styles.dayHeader}>
                <span style={{
                  ...styles.dayNumber,
                  color: dayOfWeek === 0 ? 'var(--weekend-text)' : dayOfWeek === 6 ? 'var(--accent)' : 'var(--text-primary)',
                }}>
                  {format(day, 'd')}
                </span>
                {dayEvents.some((e) => unreadEventIds.has(e.id)) && (
                  <span style={styles.newBadge}>N</span>
                )}
              </div>

              {/* 이벤트 목록 (스크롤 가능) */}
              <div style={styles.eventList}>
                {/* 공유 일정 */}
                {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => {
                  const isOwner = event.createdBy === user?.id;
                  return (
                    <div
                      key={event.id}
                      onMouseDown={(e) => handleSharedMouseDown(e, event, dayStr)}
                      onClick={(e) => handleEventClick(e, event)}
                      style={{
                        ...styles.eventDot,
                        background: event.adminColor,
                        opacity: dragVisual?.eventId === event.id ? 0.4 : 1,
                        cursor: isOwner ? 'grab' : 'pointer',
                      }}
                      title={`${event.title} (${event.adminName})${isOwner ? ' — 드래그로 이동' : ''}`}
                    >
                      <span style={styles.eventDotText}>
                        {event.title.length > 8 ? event.title.slice(0, 8) + '..' : event.title}
                      </span>
                    </div>
                  );
                })}

                {/* 개인 일정 */}
                {dayPersonal.slice(0, MAX_VISIBLE_EVENTS).map((pe) => {
                  const canDrag = pe.source === 'local';
                  return (
                    <div
                      key={pe.id}
                      onMouseDown={(e) => handlePersonalMouseDown(e, pe, dayStr)}
                      style={{
                        ...styles.eventDot,
                        background: pe.color,
                        opacity: dragVisual?.eventId === pe.id ? 0.4 : 0.85,
                        borderLeft: '2px solid rgba(255,255,255,0.5)',
                        cursor: canDrag ? 'grab' : 'default',
                      }}
                      title={`${pe.title} (개인)${canDrag ? ' — 드래그로 이동' : ''}`}
                    >
                      <span style={styles.eventDotText}>
                        {pe.title.length > 8 ? pe.title.slice(0, 8) + '..' : pe.title}
                      </span>
                    </div>
                  );
                })}

                {/* 시간표: 각 교시 한줄 */}
                {comciganPeriods.map((cp) => (
                  <div key={`cc-${cp.period}`} style={styles.comciganDot}
                    title={`${cp.period}교시 ${cp.subject} ${cp.grade}-${cp.classNum}`}>
                    <span style={styles.comciganText}>
                      {cp.period} {cp.subject}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 퀵 추가 팝업 */}
      {quickAdd && (
        <div data-quick-add style={{
          ...styles.quickAddPopup,
          left: Math.min(quickAdd.x - 70, window.innerWidth - 155),
          top: Math.min(quickAdd.y + 2, window.innerHeight - 80),
        }}>
          <button onClick={handleQuickAddShared} style={styles.quickAddBtn}>📅 공유 일정 추가</button>
          <button onClick={handleQuickAddPersonal} style={styles.quickAddBtn}>🔒 개인 일정 추가</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' },
  weekdayRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 2 },
  weekdayCell: { textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '3px 0', textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 0,
    flex: 1,
    border: '1px solid var(--grid-line)',
    borderRadius: 6,
    overflow: 'auto',
  },
  dayCell: {
    padding: '2px 3px',
    minHeight: 48,
    cursor: 'pointer',
    transition: 'background 0.12s',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--grid-line)',
    borderBottom: '1px solid var(--grid-line)',
    overflow: 'visible',
  },
  today: { background: 'var(--today-bg)' },
  selected: { outline: '2px solid var(--accent)', outlineOffset: -2, zIndex: 1 },
  dragOver: { background: 'rgba(74, 144, 226, 0.25)', outline: '2px dashed var(--accent)', outlineOffset: -2, zIndex: 1 },
  dayHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1, flexShrink: 0 },
  dayNumber: { fontSize: 11, fontWeight: 700, lineHeight: 1, textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)' },
  newBadge: { fontSize: 7, fontWeight: 700, color: '#fff', background: '#E74C3C', borderRadius: 3, padding: '0px 3px', lineHeight: 1.3 },
  eventList: { display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0 },
  eventDot: { borderRadius: 3, padding: '0px 3px', flexShrink: 0 },
  eventDotText: { fontSize: 'var(--schedule-font-size, 9px)' as any, fontWeight: 500, color: '#fff', lineHeight: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textShadow: '0 1px 2px rgba(0,0,0,0.4)' },
  comciganDot: { borderRadius: 2, padding: '0px 3px', background: 'var(--comcigan-bg)', flexShrink: 0 },
  comciganText: { fontSize: 'var(--schedule-font-size, 9px)' as any, fontWeight: 600, color: 'var(--comcigan-text)', lineHeight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textShadow: 'var(--comcigan-shadow)' },
  quickAddPopup: {
    position: 'fixed', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 2,
    padding: 4, borderRadius: 8, background: 'var(--bg-modal, #fff)',
    border: '1px solid var(--border-color)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', minWidth: 140,
  },
  quickAddBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'transparent',
    border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
  },
};

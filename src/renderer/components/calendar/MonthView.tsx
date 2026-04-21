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
import { showToast } from '../common/Toast';
import { formatEventTooltip, formatPersonalTooltip, isEventOnDate, getCreatorTag, canManageEvent, PERSONAL_SUFFIX } from '../../utils/calendarHelpers';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DRAG_THRESHOLD = 5;
const MAX_VISIBLE = 20;

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
  onPersonalClick?: (pe: PersonalEvent) => void;
}

export function MonthView({ onAddPersonalEvent, onPersonalClick }: MonthViewProps) {
  const {
    currentMonth, selectedDate,
    setSelectedDate, setSelectedEvent, setShowEventDetail, setShowEventModal, updateEvent,
  } = useCalendarStore();
  const events = useVisibleEvents();
  const { user } = useAuthStore();
  const { notifications } = useNotificationStore();
  const { allPersonalEvents, updatePersonalEvent } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();
  const { getPeriodsForWeekday, config: comciganConfig } = useComciganStore();

  const dragRef = useRef<DragInfo | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragOverDayStr, setDragOverDayStr] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddPopup | null>(null);
  const justFinishedDragRef = useRef(0); // 드래그 종료 후 클릭 무시용 타임스탬프

  // 최신 데이터를 ref로 유지 (드래그 콜백 stale closure 방지)
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
  const dayStrings = days.map((d) => format(d, 'yyyy-MM-dd'));

  // ─── 그리드 좌표 → 날짜 변환 (elementFromPoint 대신 사용) ───
  function getDayStrFromMousePos(clientX: number, clientY: number): string | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top + grid.scrollTop;
    if (x < 0 || x > rect.width || y < 0) return null;
    const col = Math.floor((x / rect.width) * 7);
    const rowHeight = grid.scrollHeight / numWeeks;
    const row = Math.floor(y / rowHeight);
    const idx = row * 7 + col;
    if (idx < 0 || idx >= dayStrings.length) return null;
    return dayStrings[idx];
  }

  // ─── 이벤트 필터링 ───
  function getEventsForDay(date: Date): CalendarEvent[] {
    return events.filter((e) => isEventOnDate(e, date));
  }

  function getPersonalEventsForDay(date: Date): PersonalEvent[] {
    return personalEvents.filter((e) => isEventOnDate(e, date));
  }

  // ─── 클릭 핸들러 ───
  function handleEventClick(e: React.MouseEvent, event: CalendarEvent) {
    e.stopPropagation();
    if (dragRef.current?.activated) return;
    if (Date.now() - justFinishedDragRef.current < 200) return;
    setSelectedEvent(event);
    setShowEventDetail(true);
  }

  function handleDayCellClick(e: React.MouseEvent, day: Date, dayStr: string) {
    if (dragRef.current?.activated) return;
    if (Date.now() - justFinishedDragRef.current < 200) return;
    setSelectedDate(day);
    if (user) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setQuickAdd({ dayStr, x: rect.left + rect.width / 2, y: rect.bottom });
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

  // 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!quickAdd) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-quick-add]')) setQuickAdd(null);
    };
    window.addEventListener('mousedown', close, true);
    return () => window.removeEventListener('mousedown', close, true);
  }, [quickAdd]);

  // ─── 드래그 핸들러 ───
  function handleSharedMouseDown(e: React.MouseEvent, event: CalendarEvent, dayStr: string) {
    if (!canManageEvent(event, user)) return;
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

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.activated) {
        if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.activated = true;
        setQuickAdd(null);
      }
      // 그리드 좌표로 날짜 계산 (elementFromPoint 대신)
      const dayStr = getDayStrFromMousePos(e.clientX, e.clientY);
      setDragOverDayStr(dayStr);
    }

    async function onMouseUp(e: MouseEvent) {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || !drag.activated) { setDragOverDayStr(null); return; }
      justFinishedDragRef.current = Date.now(); // 클릭 경합 방지

      // 그리드 좌표로 타겟 날짜 계산
      const targetDayStr = getDayStrFromMousePos(e.clientX, e.clientY);
      setDragOverDayStr(null);

      if (!targetDayStr || targetDayStr === drag.originDayStr) return;

      const [ty, tm, td] = targetDayStr.split('-').map(Number);
      const [oy, om, od] = drag.originDayStr.split('-').map(Number);
      const targetDay = new Date(ty, tm - 1, td, 12, 0, 0);
      const originDay = new Date(oy, om - 1, od, 12, 0, 0);
      const daysDiff = differenceInCalendarDays(targetDay, originDay);

      if (daysDiff === 0) return;

      console.log('[Drag]', drag.type, 'event', drag.eventId, ':', drag.originDayStr, '→', targetDayStr, '(', daysDiff, 'days)');

      if (drag.type === 'shared') {
        const event = eventsRef.current.find((ev) => ev.id === drag.eventId);
        if (!event) { console.log('[Drag] Event not found'); return; }
        try {
          await updateEvent(event.id, {
            startDate: addDays(new Date(event.startDate), daysDiff),
            endDate: addDays(new Date(event.endDate), daysDiff),
          });
          console.log('[Drag] ✅ Success');
        } catch (err) {
          console.error('[Drag] ❌ Failed:', err);
          showToast('일정 이동에 실패했습니다', 'error');
        }
      } else if (drag.type === 'personal' && user) {
        const pe = personalEventsRef.current.find((p) => p.id === drag.eventId);
        if (!pe) { console.log('[Drag] Personal event not found'); return; }
        try {
          await updatePersonalEvent(user.id, pe.id, {
            startDate: addDays(new Date(pe.startDate), daysDiff),
            endDate: addDays(new Date(pe.endDate), daysDiff),
          });
          console.log('[Drag] ✅ Success');
        } catch (err) {
          console.error('[Drag] ❌ Failed:', err);
          showToast('일정 이동에 실패했습니다', 'error');
        }
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [user, updateEvent, updatePersonalEvent, numWeeks, dayStrings]);

  // ─── 렌더링 ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '3px 0',
            color: i === 0 ? 'var(--weekend-text)' : i === 6 ? 'var(--accent)' : 'var(--text-secondary)',
            textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* 캘린더 그리드 */}
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: `repeat(${numWeeks}, minmax(50px, 1fr))`,
          flex: 1,
          border: '1px solid var(--grid-line)',
          borderRadius: 6,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {days.map((day, dayIdx) => {
          const dayEvents = getEventsForDay(day);
          const dayPersonal = getPersonalEventsForDay(day);
          const dayOfWeek = day.getDay();
          const isCurrentWeek = isSameWeek(day, new Date(), { weekStartsOn: 0 });
          const comciganPeriods = (isCurrentWeek && dayOfWeek >= 1 && dayOfWeek <= 5)
            ? getPeriodsForWeekday(dayOfWeek) : [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = isSameDay(day, selectedDate);
          const dayStr = dayStrings[dayIdx];
          const isDropTarget = dragOverDayStr === dayStr;

          return (
            <div
              key={dayStr}
              data-day-str={dayStr}
              role="gridcell"
              aria-label={format(day, 'yyyy년 M월 d일')}
              onClick={(e) => handleDayCellClick(e, day, dayStr)}
              style={{
                padding: '2px 3px',
                cursor: 'pointer',
                borderRight: '1px solid var(--grid-line)',
                borderBottom: '1px solid var(--grid-line)',
                // 셀 배경: 투명 윈도우에서 마우스 이벤트 캡처 보장
                background: today ? 'var(--today-bg)' : 'rgba(128,128,128,0.02)',
                opacity: inMonth ? 1 : 0.35,
                outline: selected ? '2px solid var(--accent)' : isDropTarget ? '2px dashed var(--accent)' : 'none',
                outlineOffset: -2,
                ...(isDropTarget ? { background: 'rgba(74,144,226,0.2)' } : {}),
              }}
            >
              {/* 날짜 번호 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: dayOfWeek === 0 ? 'var(--weekend-text)' : dayOfWeek === 6 ? 'var(--accent)' : 'var(--text-primary)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.3), 0 0 8px rgba(255,255,255,0.6)',
                }}>
                  {format(day, 'd')}
                </span>
                {dayEvents.some((e) => unreadEventIds.has(e.id)) && (
                  <span style={{ fontSize: 7, fontWeight: 700, color: '#fff', background: '#E74C3C', borderRadius: 3, padding: '0 3px' }}>N</span>
                )}
              </div>

              {/* 일정 + 시간표 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* 공유 일정 */}
                {dayEvents.slice(0, MAX_VISIBLE).map((event) => {
                  const isOwner = canManageEvent(event, user);
                  return (
                    <div
                      key={event.id}
                      onMouseDown={(e) => handleSharedMouseDown(e, event, dayStr)}
                      onClick={(e) => handleEventClick(e, event)}
                      style={{
                        borderRadius: 3, padding: '1px 4px',
                        background: event.adminColor || '#4A90E2',
                        opacity: dragRef.current?.eventId === event.id ? 0.4 : 1,
                        cursor: isOwner ? 'grab' : 'pointer',
                      }}
                      title={formatEventTooltip(event, isOwner)}
                    >
                      <span style={{
                        fontSize: 'var(--schedule-font-size)', fontWeight: 600, color: '#fff', lineHeight: 1.4,
                        display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}>
                        {getCreatorTag(event) && `${getCreatorTag(event)} `}{event.title}
                      </span>
                    </div>
                  );
                })}

                {/* 개인 일정 */}
                {dayPersonal.slice(0, MAX_VISIBLE).map((pe) => {
                  const canDrag = pe.source === 'local';
                  return (
                    <div
                      key={pe.id}
                      onMouseDown={(e) => handlePersonalMouseDown(e, pe, dayStr)}
                      onClick={(e) => {
                        if (dragRef.current?.activated) return;
                        if (Date.now() - justFinishedDragRef.current < 200) return;
                        e.stopPropagation();
                        onPersonalClick?.(pe);
                      }}
                      style={{
                        borderRadius: 3, padding: '1px 4px',
                        background: pe.color || '#2ECC71',
                        opacity: dragRef.current?.eventId === pe.id ? 0.4 : 0.85,
                        borderLeft: '2px solid rgba(255,255,255,0.5)',
                        cursor: canDrag ? 'grab' : 'pointer',
                      }}
                      title={formatPersonalTooltip(pe, canDrag)}
                    >
                      <span style={{
                        fontSize: 'var(--schedule-font-size)', fontWeight: 600, color: '#fff', lineHeight: 1.4,
                        display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}>
                        {pe.title} {PERSONAL_SUFFIX}
                      </span>
                    </div>
                  );
                })}
                {(dayEvents.length + dayPersonal.length) > MAX_VISIBLE && (
                  <div style={{
                    fontSize: 'calc(var(--schedule-font-size) - 1px)',
                    color: 'var(--text-muted)', fontWeight: 600, padding: '0 3px',
                  }}>
                    +{(dayEvents.length + dayPersonal.length) - MAX_VISIBLE}개 더
                  </div>
                )}

                {/* 시간표: 각 교시 한줄 */}
                {comciganPeriods.map((cp) => (
                  <div key={`cc-${cp.period}`}
                    style={{ borderRadius: 2, padding: '0px 3px', background: 'var(--comcigan-bg)' }}
                    title={`${cp.period}교시 ${cp.subject} ${cp.grade}-${cp.classNum}${cp.startTime ? ` (${cp.startTime})` : ''}`}>
                    <span style={{
                      fontSize: 'calc(var(--schedule-font-size) - 1px)', fontWeight: 600, color: 'var(--comcigan-text)', lineHeight: 1.4,
                      display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textShadow: 'var(--comcigan-shadow)',
                    }}>
                      {cp.startTime || `${cp.period}교시`} {cp.subject}
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
          position: 'fixed', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 2,
          padding: 4, borderRadius: 8, background: 'var(--bg-modal, #fff)',
          border: '1px solid var(--border-color)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', minWidth: 140,
          left: Math.min(quickAdd.x - 70, window.innerWidth - 155),
          top: Math.min(quickAdd.y + 2, window.innerHeight - 80),
        }}>
          <button onClick={handleQuickAddShared} style={quickAddBtnStyle}>📅 공유 일정 추가</button>
          <button onClick={handleQuickAddPersonal} style={quickAddBtnStyle}>🔒 개인 일정 추가</button>
        </div>
      )}
    </div>
  );
}

const quickAddBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'transparent',
  border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
};

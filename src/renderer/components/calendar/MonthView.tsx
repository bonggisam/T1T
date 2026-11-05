import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
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
import { formatEventTooltip, formatPersonalTooltip, isEventOnDate, getCreatorTag, canManageEvent, PERSONAL_SUFFIX, getPersonalEventDisplayColor } from '../../utils/calendarHelpers';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { SchoolBadge } from '../common/SchoolBadge';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
// 실수 클릭으로 일정이 다른 날로 옮겨가는 사고 방지 — 의도적인 드래그만 활성화
const DRAG_THRESHOLD = 12;
// 칸 안 항목 사이 간격(px). 개수 계산과 실제 배치가 같은 값을 쓴다.
const ITEM_GAP = 1;

/** 칸에 넣을 항목 수를 계산하는 데 쓰는 실측 높이(px) */
interface CellMetrics {
  available: number; // 칸에서 날짜 아래 남는 높이
  event: number;
  period: number;
  more: number;
}

/** 전부 들어가면 전체 개수, 아니면 "+N개 더" 줄 자리를 남기고 들어가는 개수 */
function countVisibleItems(heights: number[], metrics: CellMetrics): number {
  const total = heights.reduce((sum, h) => sum + h + ITEM_GAP, -ITEM_GAP);
  if (total <= metrics.available) return heights.length;
  let used = metrics.more;
  let count = 0;
  for (const h of heights) {
    used += h + ITEM_GAP;
    if (used > metrics.available) break;
    count++;
  }
  return count;
}

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
    setSelectedDate, setSelectedEvent, setShowEventDetail, setShowEventModal, setView, updateEvent,
  } = useCalendarStore();
  const events = useVisibleEvents();
  const { user } = useAuthStore();
  const { notifications } = useNotificationStore();
  const { allPersonalEvents, updatePersonalEvent } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();
  const { getPeriodsForWeekday, config: comciganConfig } = useComciganStore();

  const dragRef = useRef<DragInfo | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<CellMetrics | null>(null);
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

  // ─── 칸 높이 실측 ───
  // 행 높이가 모두 같으므로 첫 칸만 재면 된다. 창 크기(격자)와 글자 크기(견본)가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const probe = probeRef.current;
    if (!grid || !probe) return;
    const heightOf = (selector: string, root: HTMLElement) =>
      root.querySelector(selector)?.getBoundingClientRect().height ?? 0;
    const measure = () => {
      const next: CellMetrics = {
        available: heightOf('[data-cell-items]', grid),
        event: heightOf('[data-probe="event"]', probe),
        period: heightOf('[data-probe="period"]', probe),
        more: heightOf('[data-probe="more"]', probe),
      };
      setMetrics((prev) => (
        prev && prev.available === next.available && prev.event === next.event
        && prev.period === next.period && prev.more === next.more ? prev : next
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [numWeeks]);

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
    // 칸에 일부만 보일 수 있으므로 이른 일정부터 (직접 추가한 일정과 Google 일정이 섞여 있어 정렬 필요)
    return personalEvents
      .filter((e) => isEventOnDate(e, date))
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
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

  // "+N개 더" — 그날의 모든 일정과 수업을 볼 수 있는 일 화면으로 이동
  function handleMoreClick(e: React.MouseEvent, day: Date) {
    e.stopPropagation();
    if (Date.now() - justFinishedDragRef.current < 200) return;
    setSelectedDate(day);
    setView('day');
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
      // 2일 이상 이동은 확인 다이얼로그 — 실수로 다른 주로 끌려가는 사고 방지
      if (Math.abs(daysDiff) >= 2) {
        const fmt = (s: string) => {
          const [y, m, d] = s.split('-').map(Number);
          return `${m}월 ${d}일 (${['일','월','화','수','목','금','토'][new Date(y, m-1, d).getDay()]})`;
        };
        if (!confirm(`일정을 ${fmt(drag.originDayStr)} → ${fmt(targetDayStr)}로 이동할까요?`)) {
          return;
        }
      }

      if (drag.type === 'shared') {
        const event = eventsRef.current.find((ev) => ev.id === drag.eventId);
        if (!event) return;
        try {
          await updateEvent(event.id, {
            startDate: addDays(new Date(event.startDate), daysDiff),
            endDate: addDays(new Date(event.endDate), daysDiff),
          });
        } catch (err) {
          console.error('[MonthDrag] update failed:', err);
          showToast('일정 이동에 실패했습니다', 'error');
        }
      } else if (drag.type === 'personal' && user) {
        const pe = personalEventsRef.current.find((p) => p.id === drag.eventId);
        if (!pe) return;
        try {
          await updatePersonalEvent(user.id, pe.id, {
            startDate: addDays(new Date(pe.startDate), daysDiff),
            endDate: addDays(new Date(pe.endDate), daysDiff),
          });
        } catch (err) {
          console.error('[MonthDrag] personal update failed:', err);
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
            textShadow: 'var(--label-halo)',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* 칸에 넣을 수 있는 개수를 재기 위한 보이지 않는 견본. 실제 항목과 같은 스타일을 쓴다. */}
      <div ref={probeRef} aria-hidden="true" style={probeStyle}>
        <div data-probe="event" style={eventChipStyle}>
          <span style={eventTextStyle}><SchoolBadge school="all" size="xs" />가</span>
        </div>
        <div data-probe="period" style={periodChipStyle}>
          <span style={periodTextStyle}>가</span>
        </div>
        <button data-probe="more" tabIndex={-1} style={moreBtnStyle}>+1개 더</button>
      </div>

      {/* 캘린더 그리드 — 창 높이를 채우고 모든 행의 높이가 같다. 칸을 넘는 일정은 "+N개 더"로 표시 */}
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          // 최소 높이는 날짜, 일정 한 줄, "+N개 더"가 들어가는 만큼. 창이 그보다 작을 때만 격자가 스크롤된다.
          gridTemplateRows: `repeat(${numWeeks}, minmax(calc(var(--schedule-font-size) * 1.4 + 34px), 1fr))`,
          flex: 1,
          border: '1px solid var(--grid-line)',
          borderRadius: 8,
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
          // 공유 일정 → 개인 일정 → 시간표 순서로 칸 높이에 맞는 만큼만 그린다
          const totalItems = dayEvents.length + dayPersonal.length + comciganPeriods.length;
          const visibleCount = metrics
            ? countVisibleItems([
              ...[...dayEvents, ...dayPersonal].map(() => metrics.event),
              ...comciganPeriods.map(() => metrics.period),
            ], metrics)
            : totalItems;
          const visibleEvents = dayEvents.slice(0, visibleCount);
          const visiblePersonal = dayPersonal.slice(0, Math.max(0, visibleCount - dayEvents.length));
          const visiblePeriods = comciganPeriods.slice(0, Math.max(0, visibleCount - dayEvents.length - dayPersonal.length));
          const hiddenCount = totalItems - visibleCount;
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
                padding: '2px 3px 1px',
                cursor: 'pointer',
                borderRight: '1px solid var(--grid-line)',
                borderBottom: '1px solid var(--grid-line)',
                // 셀 배경: 투명 윈도우에서 마우스 이벤트 캡처 보장
                background: today ? 'var(--today-bg)' : 'rgba(128,128,128,0.02)',
                // 오늘 셀: 배경색에 더해 안쪽 테두리로 한 번 더 강조 (투명 배경 위에서도 또렷하게)
                ...(today && !selected ? { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)' } : {}),
                opacity: inMonth ? 1 : 0.35,
                transition: 'background 0.15s ease, opacity 0.15s ease',
                outline: selected ? '2px solid var(--accent)' : isDropTarget ? '2px dashed var(--accent)' : 'none',
                outlineOffset: -2,
                // 행 높이는 고정이고 항목은 들어가는 만큼만 그린다.
                // overflow: hidden은 긴 제목이 인접 셀로 침범하지 않게 하는 경계.
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                minHeight: 0,
                overflow: 'hidden',
                ...(isDropTarget ? { background: 'color-mix(in srgb, var(--accent) 20%, transparent)' } : {}),
              }}
            >
              {/* 날짜 번호 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, lineHeight: 1.1,
                  color: dayOfWeek === 0 ? 'var(--weekend-text)' : dayOfWeek === 6 ? 'var(--accent)' : 'var(--text-primary)',
                  textShadow: 'var(--label-halo)',
                }}>
                  {format(day, 'd')}
                </span>
                {dayEvents.some((e) => unreadEventIds.has(e.id)) && (
                  <span style={{ fontSize: 7, fontWeight: 700, color: '#fff', background: '#E74C3C', borderRadius: 3, padding: '0 3px' }}>N</span>
                )}
              </div>

              {/* 일정 + 시간표 */}
              <div data-cell-items style={{ display: 'flex', flexDirection: 'column', gap: ITEM_GAP, minWidth: 0, minHeight: 0, flex: 1, overflow: 'hidden' }}>
                {/* 공유 일정 */}
                {visibleEvents.map((event) => {
                  const isOwner = canManageEvent(event, user);
                  return (
                    <div
                      key={event.id}
                      onMouseDown={(e) => handleSharedMouseDown(e, event, dayStr)}
                      onClick={(e) => handleEventClick(e, event)}
                      style={{
                        ...eventChipStyle,
                        background: event.adminColor || '#4A90E2',
                        opacity: dragRef.current?.eventId === event.id ? 0.4 : 1,
                        cursor: isOwner ? 'grab' : 'pointer',
                      }}
                      title={formatEventTooltip(event, isOwner)}
                    >
                      <span style={eventTextStyle}>
                        <SchoolBadge school={event.school} size="xs" />{event.title}
                      </span>
                    </div>
                  );
                })}

                {/* 개인 일정 */}
                {visiblePersonal.map((pe) => {
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
                        ...eventChipStyle,
                        background: getPersonalEventDisplayColor(pe, user?.profileColor),
                        opacity: dragRef.current?.eventId === pe.id ? 0.4 : 0.88,
                        borderLeft: '3px solid rgba(255,255,255,0.6)',
                        cursor: canDrag ? 'grab' : 'pointer',
                      }}
                      title={formatPersonalTooltip(pe, canDrag)}
                    >
                      <span style={eventTextStyle}>
                        {pe.title} {PERSONAL_SUFFIX}
                      </span>
                    </div>
                  );
                })}

                {/* 시간표: 각 교시 한줄 */}
                {visiblePeriods.map((cp) => (
                  <div key={`cc-${cp.period}`}
                    style={periodChipStyle}
                    title={`${cp.period}교시 ${cp.subject} ${cp.grade}-${cp.classNum}${cp.startTime ? ` (${cp.startTime})` : ''}`}>
                    <span style={periodTextStyle}>
                      {cp.startTime || `${cp.period}교시`} {cp.subject}
                    </span>
                  </div>
                ))}

                {hiddenCount > 0 && (
                  <button
                    onClick={(e) => handleMoreClick(e, day)}
                    style={moreBtnStyle}
                    title="이 날의 일정 모두 보기"
                    aria-label={`${format(day, 'M월 d일')} 일정 ${hiddenCount}개 더 보기`}
                  >
                    +{hiddenCount}개 더
                  </button>
                )}
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

const probeStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, width: 120, visibility: 'hidden', pointerEvents: 'none',
};

// flexShrink: 0 — 칸이 좁아도 항목이 눌리지 않게 한다 (개수 계산이 항목 높이를 그대로 쓴다)
const eventChipStyle: React.CSSProperties = {
  borderRadius: 4, padding: '1px 5px',
  boxShadow: '0 1px 1px rgba(0,0,0,0.12)',
  transition: 'opacity 0.15s ease, filter 0.15s ease',
  flexShrink: 0,
  // 셀 너비 일정 유지: 긴 제목이 줄바꿈/스트레치 안 되도록
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
};

const eventTextStyle: React.CSSProperties = {
  fontSize: 'var(--schedule-font-size)', fontWeight: 600, color: '#fff', lineHeight: 1.4,
  display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  minWidth: 0,
};

const periodChipStyle: React.CSSProperties = {
  borderRadius: 2, padding: '0px 3px', background: 'var(--comcigan-bg)', flexShrink: 0,
};

const periodTextStyle: React.CSSProperties = {
  fontSize: 'calc(var(--schedule-font-size) - 1px)', fontWeight: 600, color: 'var(--comcigan-text)', lineHeight: 1.4,
  display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  textShadow: 'var(--comcigan-shadow)',
};

// 일정 글자를 키워도 이 줄은 작게 유지해 작은 칸에서도 일정 한 줄과 함께 들어가게 한다
const moreBtnStyle: React.CSSProperties = {
  display: 'block', width: '100%', flexShrink: 0, padding: '0 3px',
  fontSize: 'clamp(9px, calc(var(--schedule-font-size) - 1px), 11px)', fontWeight: 600, lineHeight: 1.2,
  color: 'var(--text-secondary)', textShadow: 'var(--label-halo)', textAlign: 'left',
  background: 'none', border: 'none', cursor: 'pointer',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const quickAddBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'transparent',
  border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
};

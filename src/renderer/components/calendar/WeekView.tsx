import React, { useRef, useEffect, useState } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, isToday, isSameWeek,
  addHours, differenceInHours, differenceInCalendarDays, addDays,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useComciganStore } from '../../store/comciganStore';
import type { CalendarEvent, PersonalEvent, TeacherPeriod } from '@shared/types';
import { showToast } from '../common/Toast';
import { formatEventTooltip, formatPersonalTooltip, getCreatorTag, canManageEvent, PERSONAL_SUFFIX, getPersonalEventDisplayColor } from '../../utils/calendarHelpers';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { SchoolBadge } from '../common/SchoolBadge';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DragInfo {
  eventId: string;
  type: 'shared' | 'personal';
  startX: number;
  startY: number;
  activated: boolean;
  originDay: number; // 0-6 (column index)
  originHour: number; // 0-23
  allDay: boolean; // 종일 줄에서 시작한 드래그 — 날짜만 옮긴다
}

interface QuickAdd {
  dayIdx: number;
  hour: number;
  x: number;
  y: number;
}

interface WeekViewProps {
  onAddPersonalEvent?: () => void;
  onPersonalClick?: (pe: PersonalEvent) => void;
}

export function WeekView({ onAddPersonalEvent, onPersonalClick }: WeekViewProps) {
  const { selectedDate, setSelectedDate, setSelectedEvent, setShowEventDetail, setShowEventModal, updateEvent } = useCalendarStore();
  const events = useVisibleEvents();
  const { user } = useAuthStore();
  const { allPersonalEvents, updatePersonalEvent } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();
  const { getPeriodsForWeekday, timetableData, config: comciganConfig } = useComciganStore();

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const justFinishedDragRef = useRef(0);
  const eventsRef = useRef(events);
  const personalEventsRef = useRef(personalEvents);
  const [dragOver, setDragOver] = useState<{ col: number; hour: number } | null>(null);
  const [dragOverAllDayCol, setDragOverAllDayCol] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null);
  const [nowMinute, setNowMinute] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { personalEventsRef.current = personalEvents; }, [personalEvents]);

  // 현재 시간선 1분마다 업데이트
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowMinute(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 퀵 추가 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!quickAdd) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-quick-add]')) setQuickAdd(null);
    };
    window.addEventListener('mousedown', close, true);
    return () => window.removeEventListener('mousedown', close, true);
  }, [quickAdd]);

  function handleQuickAddShared() {
    if (!quickAdd) return;
    const day = days[quickAdd.dayIdx];
    const d = new Date(day);
    d.setHours(quickAdd.hour, 0, 0, 0);
    setSelectedDate(d);
    setQuickAdd(null);
    setTimeout(() => setShowEventModal(true), 0);
  }

  function handleQuickAddPersonal() {
    if (!quickAdd) return;
    const day = days[quickAdd.dayIdx];
    const d = new Date(day);
    d.setHours(quickAdd.hour, 0, 0, 0);
    setSelectedDate(d);
    setQuickAdd(null);
    setTimeout(() => { if (onAddPersonalEvent) onAddPersonalEvent(); }, 0);
  }

  const isCurrentWeek = isSameWeek(selectedDate, new Date(), { weekStartsOn: 0 });

  // 한국 중·고등학교 기본 교시 시간 (fallback)
  const DEFAULT_PERIOD_START_HOURS: Record<number, number> = {
    1: 9, 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 15, 8: 16,
  };

  const comciganByDayHour = React.useMemo(() => {
    if (!isCurrentWeek || !comciganConfig || !timetableData) return new Map<string, TeacherPeriod[]>();
    const map = new Map<string, TeacherPeriod[]>();
    for (const period of timetableData.teacherSchedule) {
      const hour = period.startTime
        ? parseInt(period.startTime.split(':')[0], 10)
        : DEFAULT_PERIOD_START_HOURS[period.period] ?? -1;
      if (hour < 0 || hour > 23) continue; // 잘못된 교시는 skip
      const key = `${period.weekday}-${hour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(period);
    }
    return map;
  }, [isCurrentWeek, comciganConfig, timetableData]);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const todayIdx = days.findIndex((d) => isToday(d));
  const nowHour = Math.floor(nowMinute / 60);

  useTimelineScroll(
    gridRef,
    days,
    comciganConfig ? timetableData : null,
    days.flatMap((d) => [...getEventsForDay(d), ...getPersonalEventsForDay(d)]),
  );

  // 종일 일정은 시간 격자 위의 별도 줄에 표시
  const allDayByDay = days.map((day) => ({
    shared: getEventsForDay(day).filter((e) => e.allDay),
    personal: getPersonalEventsForDay(day).filter((e) => e.allDay),
  }));
  const hasAllDay = allDayByDay.some((d) => d.shared.length + d.personal.length > 0);

  function getEventsForDay(date: Date): CalendarEvent[] {
    return events.filter((e) => {
      const start = new Date(e.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(e.endDate); end.setHours(23, 59, 59, 999);
      const d = new Date(date); d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  }

  function getPersonalEventsForDay(date: Date): PersonalEvent[] {
    return personalEvents.filter((e) => {
      const start = new Date(e.startDate); start.setHours(0, 0, 0, 0);
      const end = new Date(e.endDate); end.setHours(23, 59, 59, 999);
      const d = new Date(date); d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  }

  // ─── 그리드 좌표 → 열(day)+행(hour) 계산 ───
  function getColumn(clientX: number): number | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < 0 || x > rect.width) return null;
    const gutterWidth = 40;
    const colWidth = (rect.width - gutterWidth) / 7;
    const col = Math.floor((x - gutterWidth) / colWidth);
    return col < 0 || col > 6 ? null : col;
  }

  function getGridPos(clientX: number, clientY: number): { col: number; hour: number } | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    // 스크롤된 상태에서 격자 밖(머리글·종일 줄 등)에 놓으면 엉뚱한 시각으로 옮겨지므로 취소한다
    if (clientY < rect.top || clientY > rect.bottom) return null;
    const col = getColumn(clientX);
    if (col === null) return null;
    const y = clientY - rect.top + grid.scrollTop;
    const rowHeight = grid.scrollHeight / 24;
    const hour = Math.min(23, Math.max(0, Math.floor(y / rowHeight)));
    return { col, hour };
  }

  // ─── 드래그 핸들러 ───
  function handleEventMouseDown(e: React.MouseEvent, eventId: string, type: 'shared' | 'personal', dayIdx: number, hour: number, allDay = false) {
    if (type === 'shared') {
      const ev = events.find((x) => x.id === eventId);
      if (!ev || !canManageEvent(ev, user)) return;
    } else {
      const pe = personalEvents.find((x) => x.id === eventId);
      if (!pe || pe.source !== 'local') return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { eventId, type, startX: e.clientX, startY: e.clientY, activated: false, originDay: dayIdx, originHour: hour, allDay };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.activated) {
        // 실수 클릭으로 옮겨가는 사고 방지 — 12px 이상 움직여야 드래그 활성화
        if (Math.abs(e.clientX - drag.startX) < 12 && Math.abs(e.clientY - drag.startY) < 12) return;
        drag.activated = true;
      }
      if (drag.allDay) {
        setDragOverAllDayCol(getColumn(e.clientX));
      } else {
        setDragOver(getGridPos(e.clientX, e.clientY));
      }
    }

    async function onMouseUp(e: MouseEvent) {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragOver(null);
      setDragOverAllDayCol(null);
      if (!drag || !drag.activated) return;
      justFinishedDragRef.current = Date.now();

      let daysDiff: number;
      let hoursDiff = 0;
      if (drag.allDay) {
        const col = getColumn(e.clientX);
        if (col === null) return;
        daysDiff = col - drag.originDay;
      } else {
        const pos = getGridPos(e.clientX, e.clientY);
        if (!pos) return;
        daysDiff = pos.col - drag.originDay;
        hoursDiff = pos.hour - drag.originHour;
      }
      if (daysDiff === 0 && hoursDiff === 0) return;

      if (drag.type === 'shared') {
        const event = eventsRef.current.find((ev) => ev.id === drag.eventId);
        if (!event) return;
        const oldStart = new Date(event.startDate);
        const oldEnd = new Date(event.endDate);
        const newStart = addHours(addDays(oldStart, daysDiff), hoursDiff);
        const newEnd = addHours(addDays(oldEnd, daysDiff), hoursDiff);
        try {
          await updateEvent(event.id, { startDate: newStart, endDate: newEnd });
        } catch (err) {
          console.error('[WeekDrag] Failed:', err);
          showToast('일정 이동에 실패했습니다', 'error');
        }
      } else if (drag.type === 'personal' && user) {
        const pe = personalEventsRef.current.find((p) => p.id === drag.eventId);
        if (!pe) return;
        const oldStart = new Date(pe.startDate);
        const oldEnd = new Date(pe.endDate);
        const newStart = addHours(addDays(oldStart, daysDiff), hoursDiff);
        const newEnd = addHours(addDays(oldEnd, daysDiff), hoursDiff);
        try {
          await updatePersonalEvent(user.id, pe.id, { startDate: newStart, endDate: newEnd });
        } catch (err) {
          console.error('[WeekDrag] Failed:', err);
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
  }, [user, updateEvent, updatePersonalEvent]);

  return (
    <div style={styles.container}>
      {/* Day headers */}
      <div style={styles.headerRow}>
        <div style={styles.timeGutter}></div>
        {days.map((day) => (
          <div key={day.toISOString()} style={{ ...styles.dayHeader, ...(isToday(day) ? styles.todayHeader : {}) }}>
            <span style={styles.dayName}>{format(day, 'EEE', { locale: ko })}</span>
            <span style={{ ...styles.dayNum, ...(isToday(day) ? styles.todayNum : {}) }}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* 종일 일정 — 시간 격자 밖에 두어 스크롤 위치와 상관없이 항상 보인다 */}
      {hasAllDay && (
        <div style={styles.allDayRow}>
          <div style={styles.timeGutter}>
            <span style={styles.timeLabel}>종일</span>
          </div>
          {allDayByDay.map(({ shared, personal }, dayIdx) => {
            const isDropTarget = dragOverAllDayCol === dayIdx;
            return (
              <div key={dayIdx} style={{
                ...styles.allDayCell,
                background: isDropTarget ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(128,128,128,0.02)',
                outline: isDropTarget ? '2px dashed var(--accent)' : 'none',
                outlineOffset: -1,
              }}>
                {shared.map((event) => {
                  const isOwner = canManageEvent(event, user);
                  return (
                    <div
                      key={event.id}
                      onMouseDown={(e) => handleEventMouseDown(e, event.id, 'shared', dayIdx, 0, true)}
                      onClick={() => {
                        if (Date.now() - justFinishedDragRef.current < 200) return;
                        setSelectedEvent(event);
                        setShowEventDetail(true);
                      }}
                      style={{
                        ...styles.eventBlock, background: event.adminColor,
                        cursor: isOwner ? 'grab' : 'pointer',
                        opacity: dragRef.current?.eventId === event.id ? 0.4 : 1,
                      }}
                      title={formatEventTooltip(event, isOwner)}
                    >
                      <span style={styles.eventText}>
                        <SchoolBadge school={event.school} size="xs" />{event.title}
                      </span>
                    </div>
                  );
                })}
                {personal.map((pe) => {
                  const canDrag = pe.source === 'local';
                  return (
                    <div
                      key={pe.id}
                      onMouseDown={(e) => handleEventMouseDown(e, pe.id, 'personal', dayIdx, 0, true)}
                      onClick={() => {
                        if (Date.now() - justFinishedDragRef.current < 200) return;
                        onPersonalClick?.(pe);
                      }}
                      style={{
                        ...styles.eventBlock, background: getPersonalEventDisplayColor(pe, user?.profileColor), opacity: 0.85,
                        borderLeft: '2px solid rgba(255,255,255,0.5)',
                        cursor: canDrag ? 'grab' : 'pointer',
                      }}
                      title={formatPersonalTooltip(pe, canDrag)}
                    >
                      <span style={styles.eventText}>{pe.title} {PERSONAL_SUFFIX}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div ref={gridRef} style={styles.gridScroll}>
        <div style={styles.grid}>
          {HOURS.map((hour) => (
            <div key={hour} data-hour={hour} style={{ ...styles.hourRow, position: 'relative' }}>
              {/* 현재 시간선 — 행 안에 두어 행 높이가 달라져도 시각과 맞는다 */}
              {todayIdx >= 0 && hour === nowHour && (
                <div style={{
                  position: 'absolute',
                  left: `calc(40px + (100% - 40px) * ${todayIdx} / 7)`,
                  width: 'calc((100% - 40px) / 7)',
                  top: `${((nowMinute % 60) / 60) * 100}%`,
                  height: 2,
                  background: '#E74C3C',
                  zIndex: 10,
                  pointerEvents: 'none',
                  boxShadow: '0 0 4px rgba(231,76,60,0.5)',
                }}>
                  <div style={{
                    position: 'absolute',
                    left: -4,
                    top: -3,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#E74C3C',
                  }} />
                </div>
              )}
              <div style={styles.timeGutter}>
                <span style={styles.timeLabel}>{hour.toString().padStart(2, '0')}:00</span>
              </div>
              {days.map((day, dayIdx) => {
                const dayEvents = getEventsForDay(day).filter((e) => {
                  return !e.allDay && new Date(e.startDate).getHours() === hour;
                });
                const dayPersonal = getPersonalEventsForDay(day).filter((e) => {
                  return !e.allDay && new Date(e.startDate).getHours() === hour;
                });
                const jsDay = day.getDay();
                const comciganPeriods = comciganByDayHour.get(`${jsDay}-${hour}`) || [];
                const isDropTarget = dragOver?.col === dayIdx && dragOver?.hour === hour;

                return (
                  <div key={`${dayIdx}-${hour}`}
                    onClick={(e) => {
                      if (dragRef.current?.activated) return;
                      if (Date.now() - justFinishedDragRef.current < 200) return;
                      if (user) {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setQuickAdd({ dayIdx, hour, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                      }
                    }}
                    style={{
                    ...styles.hourCell,
                    background: isDropTarget ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'rgba(128,128,128,0.02)',
                    outline: isDropTarget ? '2px dashed var(--accent)' : 'none',
                    outlineOffset: -1,
                  }}>
                    {dayEvents.map((event) => {
                      const isOwner = canManageEvent(event, user);
                      return (
                        <div
                          key={event.id}
                          onMouseDown={(e) => handleEventMouseDown(e, event.id, 'shared', dayIdx, hour)}
                          onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
                          style={{
                            ...styles.eventBlock, background: event.adminColor,
                            cursor: isOwner ? 'grab' : 'pointer',
                            opacity: dragRef.current?.eventId === event.id ? 0.4 : 1,
                          }}
                          title={formatEventTooltip(event, isOwner)}
                        >
                          <span style={styles.eventText}>
                            {format(new Date(event.startDate), 'HH:mm')} <SchoolBadge school={event.school} size="xs" />{event.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayPersonal.map((pe) => {
                      const canDrag = pe.source === 'local';
                      return (
                        <div
                          key={pe.id}
                          onMouseDown={(e) => handleEventMouseDown(e, pe.id, 'personal', dayIdx, hour)}
                          onClick={(e) => {
                            if (dragRef.current?.activated) return;
                      if (Date.now() - justFinishedDragRef.current < 200) return;
                            e.stopPropagation();
                            onPersonalClick?.(pe);
                          }}
                          style={{
                            ...styles.eventBlock, background: getPersonalEventDisplayColor(pe, user?.profileColor), opacity: 0.85,
                            borderLeft: '2px solid rgba(255,255,255,0.5)',
                            cursor: canDrag ? 'grab' : 'pointer',
                          }}
                          title={formatPersonalTooltip(pe, canDrag)}
                        >
                          <span style={styles.eventText}>
                            {format(new Date(pe.startDate), 'HH:mm')} {pe.title} {PERSONAL_SUFFIX}
                          </span>
                        </div>
                      );
                    })}
                    {comciganPeriods.map((cp) => (
                      <div key={`cc-${cp.weekday}-${cp.period}`} style={styles.comciganBlock}
                        title={`${cp.period}교시 ${cp.grade}-${cp.classNum}`}>
                        <span style={styles.comciganText}>📚{cp.period} {cp.subject} {cp.grade}-{cp.classNum}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 퀵 추가 팝업 */}
      {quickAdd && (
        <div data-quick-add style={{
          position: 'fixed', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 2,
          padding: 4, borderRadius: 8, background: 'var(--bg-modal, #fff)',
          border: '1px solid var(--border-color)', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', minWidth: 140,
          left: Math.min(quickAdd.x - 70, window.innerWidth - 155),
          top: Math.min(quickAdd.y, window.innerHeight - 80),
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 10px', fontWeight: 600 }}>
            {format(days[quickAdd.dayIdx], 'M/d')} {quickAdd.hour.toString().padStart(2, '0')}:00
          </div>
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

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  headerRow: { display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: 1, borderBottom: '1px solid var(--grid-line)', flexShrink: 0 },
  timeGutter: { width: 40, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2 },
  dayHeader: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0', borderRight: '1px solid var(--grid-line)' },
  todayHeader: {},
  dayName: { fontSize: 10, color: 'var(--text-muted)' },
  dayNum: { fontSize: 14, fontWeight: 700, textShadow: 'var(--label-halo)' },
  todayNum: { background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 },
  allDayRow: { display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: 1, borderBottom: '1px solid var(--grid-line)', flexShrink: 0, maxHeight: 84, overflowX: 'hidden', overflowY: 'auto' },
  // overflow: hidden을 주면 행이 내용만큼 커지지 않아 넘친 일정이 스크롤 없이 잘린다
  allDayCell: { padding: 1, minWidth: 0, borderRight: '1px solid var(--grid-line)' },
  gridScroll: { flex: 1, overflow: 'auto' },
  grid: { display: 'flex', flexDirection: 'column' },
  hourRow: { display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', gap: 1, minHeight: 40, borderBottom: '1px solid var(--grid-line)' },
  timeLabel: { fontSize: 9, color: 'var(--text-muted)' },
  hourCell: { padding: 1, overflow: 'hidden', borderRight: '1px solid var(--grid-line)' },
  eventBlock: { borderRadius: 3, padding: '1px 4px', marginBottom: 1, cursor: 'pointer' },
  eventText: { fontSize: 'var(--schedule-font-size)', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textShadow: '0 0 2px rgba(0,0,0,0.3)' },
  comciganBlock: { borderRadius: 3, padding: '1px 4px', marginBottom: 1, background: 'var(--comcigan-bg)', cursor: 'default' },
  comciganText: { fontSize: 'var(--schedule-font-size)', fontWeight: 600, color: 'var(--comcigan-text)', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textShadow: 'var(--comcigan-shadow)' },
};

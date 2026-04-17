import React, { useRef, useEffect, useState } from 'react';
import { format, addHours } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const CATEGORY_LABELS: Record<string, string> = {
  event: '행사', meeting: '회의', deadline: '마감일', notice: '공지', other: '기타',
};

function formatEventTooltip(event: CalendarEvent, isOwner: boolean): string {
  const lines: string[] = [event.title];
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (event.allDay) {
    lines.push(`종일 | ${format(start, 'M/d')} ~ ${format(end, 'M/d')}`);
  } else {
    lines.push(`${format(start, 'M/d HH:mm')} ~ ${format(end, 'M/d HH:mm')}`);
  }
  if (event.category) lines.push(`[${CATEGORY_LABELS[event.category] || event.category}]`);
  if (event.adminName) lines.push(`작성: ${event.adminName}`);
  if (event.description) lines.push(`\n${event.description}`);
  if (isOwner) lines.push('\n🖱 드래그로 이동');
  return lines.join('\n');
}

function formatPersonalTooltip(pe: PersonalEvent, canDrag: boolean): string {
  const lines: string[] = [`${pe.title} (개인)`];
  const start = new Date(pe.startDate);
  const end = new Date(pe.endDate);
  lines.push(`${format(start, 'M/d HH:mm')} ~ ${format(end, 'M/d HH:mm')}`);
  if (pe.description) lines.push(`\n${pe.description}`);
  if (canDrag) lines.push('\n🖱 드래그로 이동');
  return lines.join('\n');
}

interface QuickAdd {
  hour: number;
  x: number;
  y: number;
}

interface DayViewProps {
  onAddPersonalEvent?: () => void;
}

interface DragInfo {
  eventId: string;
  type: 'shared' | 'personal';
  startX: number;
  startY: number;
  activated: boolean;
  originHour: number;
}

export function DayView({ onAddPersonalEvent }: DayViewProps = {}) {
  const { selectedDate, events, setSelectedDate, setSelectedEvent, setShowEventDetail, setShowEventModal, updateEvent } = useCalendarStore();
  const { user } = useAuthStore();
  const { allPersonalEvents, updatePersonalEvent } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const eventsRef = useRef(events);
  const personalEventsRef = useRef(personalEvents);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAdd | null>(null);

  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { personalEventsRef.current = personalEvents; }, [personalEvents]);

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
    const d = new Date(selectedDate);
    d.setHours(quickAdd.hour, 0, 0, 0);
    setSelectedDate(d);
    setQuickAdd(null);
    setTimeout(() => setShowEventModal(true), 0);
  }

  function handleQuickAddPersonal() {
    if (!quickAdd) return;
    const d = new Date(selectedDate);
    d.setHours(quickAdd.hour, 0, 0, 0);
    setSelectedDate(d);
    setQuickAdd(null);
    setTimeout(() => { if (onAddPersonalEvent) onAddPersonalEvent(); }, 0);
  }

  const dayEvents = events.filter((e) => {
    const start = new Date(e.startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(e.endDate); end.setHours(23, 59, 59, 999);
    const d = new Date(selectedDate); d.setHours(12, 0, 0, 0);
    return d >= start && d <= end;
  });

  const dayPersonalEvents = personalEvents.filter((e) => {
    const start = new Date(e.startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(e.endDate); end.setHours(23, 59, 59, 999);
    const d = new Date(selectedDate); d.setHours(12, 0, 0, 0);
    return d >= start && d <= end;
  });

  const allDayEvents = dayEvents.filter((e) => e.allDay);
  const timedEvents = dayEvents.filter((e) => !e.allDay);

  function getHourFromMouse(clientY: number): number | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const y = clientY - rect.top + grid.scrollTop;
    if (y < 0) return null;
    const rowHeight = grid.scrollHeight / 24;
    return Math.min(23, Math.max(0, Math.floor(y / rowHeight)));
  }

  function handleEventMouseDown(e: React.MouseEvent, eventId: string, type: 'shared' | 'personal', hour: number) {
    if (type === 'shared') {
      const ev = events.find((x) => x.id === eventId);
      if (!ev || ev.createdBy !== user?.id) return;
    } else {
      const pe = personalEvents.find((x) => x.id === eventId);
      if (!pe || pe.source !== 'local') return;
    }
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { eventId, type, startX: e.clientX, startY: e.clientY, activated: false, originHour: hour };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.activated) {
        if (Math.abs(e.clientX - drag.startX) < 5 && Math.abs(e.clientY - drag.startY) < 5) return;
        drag.activated = true;
      }
      setDragOverHour(getHourFromMouse(e.clientY));
    }

    async function onMouseUp(e: MouseEvent) {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || !drag.activated) { setDragOverHour(null); return; }

      const targetHour = getHourFromMouse(e.clientY);
      setDragOverHour(null);
      if (targetHour === null || targetHour === drag.originHour) return;

      const hoursDiff = targetHour - drag.originHour;
      console.log('[DayDrag]', drag.type, drag.eventId, ': hour', hoursDiff);

      if (drag.type === 'shared') {
        const event = eventsRef.current.find((ev) => ev.id === drag.eventId);
        if (!event) return;
        try {
          await updateEvent(event.id, {
            startDate: addHours(new Date(event.startDate), hoursDiff),
            endDate: addHours(new Date(event.endDate), hoursDiff),
          });
        } catch (err) {
          console.error('[DayDrag] Failed:', err);
          alert('일정 이동 실패: ' + (err instanceof Error ? err.message : String(err)));
        }
      } else if (drag.type === 'personal' && user) {
        const pe = personalEventsRef.current.find((p) => p.id === drag.eventId);
        if (!pe) return;
        try {
          await updatePersonalEvent(user.id, pe.id, {
            startDate: addHours(new Date(pe.startDate), hoursDiff),
            endDate: addHours(new Date(pe.endDate), hoursDiff),
          });
        } catch (err) {
          console.error('[DayDrag] Failed:', err);
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

  return (
    <div style={styles.container}>
      <div style={styles.dayLabel}>
        {format(selectedDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
      </div>

      {allDayEvents.length > 0 && (
        <div style={styles.allDaySection}>
          <span style={styles.allDayLabel}>종일</span>
          {allDayEvents.map((event) => (
            <div key={event.id} onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
              style={{ ...styles.allDayEvent, background: event.adminColor }}>
              <span style={styles.eventTextSmall}>{event.title}</span>
            </div>
          ))}
        </div>
      )}

      <div ref={gridRef} style={styles.hourGrid}>
        {HOURS.map((hour) => {
          const hourEvents = timedEvents.filter((e) => new Date(e.startDate).getHours() === hour);
          const hourPersonal = dayPersonalEvents.filter((e) => new Date(e.startDate).getHours() === hour);
          const isDropTarget = dragOverHour === hour;

          return (
            <div key={hour}
              onClick={(e) => {
                if (dragRef.current?.activated) return;
                if (user) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setQuickAdd({ hour, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }
              }}
              style={{
              ...styles.hourRow,
              background: isDropTarget ? 'rgba(74,144,226,0.2)' : 'rgba(128,128,128,0.02)',
              outline: isDropTarget ? '2px dashed var(--accent)' : 'none',
              outlineOffset: -1,
              cursor: 'pointer',
            }}>
              <div style={styles.timeLabel}>{hour.toString().padStart(2, '0')}:00</div>
              <div style={styles.hourContent}>
                {hourEvents.map((event) => {
                  const isOwner = event.createdBy === user?.id;
                  return (
                    <div key={event.id}
                      onMouseDown={(e) => handleEventMouseDown(e, event.id, 'shared', hour)}
                      onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
                      style={{
                        ...styles.eventBlock, background: event.adminColor,
                        cursor: isOwner ? 'grab' : 'pointer',
                        opacity: dragRef.current?.eventId === event.id ? 0.4 : 1,
                      }}
                      title={formatEventTooltip(event, isOwner)}
                    >
                      <span style={styles.eventTitle}>{event.title}</span>
                      <span style={styles.eventTime}>
                        {format(new Date(event.startDate), 'HH:mm')} - {format(new Date(event.endDate), 'HH:mm')}
                      </span>
                    </div>
                  );
                })}
                {hourPersonal.map((pe) => {
                  const canDrag = pe.source === 'local';
                  return (
                    <div key={pe.id}
                      onMouseDown={(e) => handleEventMouseDown(e, pe.id, 'personal', hour)}
                      style={{
                        ...styles.eventBlock, background: pe.color, opacity: 0.85,
                        borderLeft: '3px solid rgba(255,255,255,0.5)',
                        cursor: canDrag ? 'grab' : 'default',
                      }}
                      title={formatPersonalTooltip(pe, canDrag)}
                    >
                      <span style={styles.eventTitle}>{pe.title}</span>
                      <span style={styles.eventTime}>
                        {format(new Date(pe.startDate), 'HH:mm')} - {format(new Date(pe.endDate), 'HH:mm')} (개인)
                      </span>
                    </div>
                  );
                })}
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
          top: Math.min(quickAdd.y, window.innerHeight - 80),
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 10px', fontWeight: 600 }}>
            {format(selectedDate, 'M/d')} {quickAdd.hour.toString().padStart(2, '0')}:00
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
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  dayLabel: { fontSize: 14, fontWeight: 600, padding: '8px 4px', color: 'var(--text-primary)', flexShrink: 0 },
  allDaySection: { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 4px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 },
  allDayLabel: { fontSize: 10, color: 'var(--text-muted)', marginRight: 4 },
  allDayEvent: { borderRadius: 4, padding: '2px 8px', cursor: 'pointer' },
  eventTextSmall: { fontSize: 11, color: '#fff', fontWeight: 500, textShadow: '0 0 2px rgba(0,0,0,0.3)' },
  hourGrid: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' },
  hourRow: { display: 'flex', minHeight: 44, borderBottom: '1px solid var(--border-subtle)' },
  timeLabel: { width: 48, flexShrink: 0, fontSize: 10, color: 'var(--text-muted)', padding: '4px 4px 0 0', textAlign: 'right' },
  hourContent: { flex: 1, padding: 2, display: 'flex', flexDirection: 'column', gap: 2 },
  eventBlock: { borderRadius: 4, padding: '4px 8px', cursor: 'pointer' },
  eventTitle: { fontSize: 12, color: '#fff', fontWeight: 600, display: 'block', textShadow: '0 0 2px rgba(0,0,0,0.3)' },
  eventTime: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
};

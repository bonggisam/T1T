import React, { useRef, useEffect, useState } from 'react';
import { format, addHours } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface DragInfo {
  eventId: string;
  type: 'shared' | 'personal';
  startX: number;
  startY: number;
  activated: boolean;
  originHour: number;
}

export function DayView() {
  const { selectedDate, events, setSelectedEvent, setShowEventDetail, updateEvent } = useCalendarStore();
  const { user } = useAuthStore();
  const { allPersonalEvents, updatePersonalEvent } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const eventsRef = useRef(events);
  const personalEventsRef = useRef(personalEvents);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);

  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { personalEventsRef.current = personalEvents; }, [personalEvents]);

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
            <div key={hour} style={{
              ...styles.hourRow,
              background: isDropTarget ? 'rgba(74,144,226,0.2)' : 'rgba(128,128,128,0.02)',
              outline: isDropTarget ? '2px dashed var(--accent)' : 'none',
              outlineOffset: -1,
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
                      title={`${event.title}${isOwner ? ' — 드래그로 이동' : ''}`}
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
                      title={`${pe.title} (개인)${canDrag ? ' — 드래그로 이동' : ''}`}
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
    </div>
  );
}

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

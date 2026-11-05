import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays, differenceInCalendarDays, eachDayOfInterval, endOfWeek, format, isSameDay, isSameWeek, isToday, startOfWeek,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CalendarEvent, PersonalEvent } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useComciganStore } from '../../store/comciganStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';
import { useVisiblePersonalEvents } from '../../hooks/useVisiblePersonalEvents';
import { canManageEvent, isEventOnDate } from '../../utils/calendarHelpers';
import { getHoliday } from '../../utils/holidays';
import { buildPeriodRows, rowIndexForMinute } from '../../utils/periodRows';
import { useAppearanceStore } from '../../store/appearanceStore';
import { TodayNumber } from './TodayNumber';
import { showToast } from '../common/Toast';
import { InlineAdd } from './InlineAdd';
import { PersonalChip, SharedChip } from './EventChip';

const DRAG_THRESHOLD = 12;
const ALL_DAY_ROW = -2;
const BEFORE_ROW = -1;

type Item = { kind: 'shared'; event: CalendarEvent } | { kind: 'personal'; event: PersonalEvent };

interface DragInfo {
  item: Item;
  startX: number;
  startY: number;
  active: boolean;
}

interface PeriodWeekProps {
  onAddPersonalEvent?: () => void;
  onPersonalClick?: (pe: PersonalEvent) => void;
}

function slotKey(day: Date, row: number): string {
  return `${format(day, 'yyyy-MM-dd')}|${row}`;
}

/** 주 화면의 교시 표. 가로는 요일, 세로는 교시다. 주말은 일정이 있는 주에만 나타난다. */
export function PeriodWeek({ onAddPersonalEvent, onPersonalClick }: PeriodWeekProps) {
  const { selectedDate, setSelectedEvent, setShowEventDetail, updateEvent } = useCalendarStore();
  const events = useCalendarEvents();
  const personalEvents = useVisiblePersonalEvents();
  const updatePersonalEvent = usePersonalEventStore((s) => s.updatePersonalEvent);
  const user = useAuthStore((s) => s.user);
  const timetableData = useComciganStore((s) => s.timetableData);
  const showTimetable = useComciganStore((s) => s.showTimetable);
  const hideWeekend = useAppearanceStore((s) => s.hideWeekend);
  const dragRef = useRef<DragInfo | null>(null);
  const justDragged = useRef(0);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [inline, setInline] = useState<{ day: Date; startMin?: number; endMin?: number; anchor: { left: number; top: number; bottom: number } } | null>(null);

  const rows = useMemo(() => buildPeriodRows(timetableData?.classTimes) ?? [], [timetableData?.classTimes]);
  const weekDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
    end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
  }), [selectedDate]);

  const allItems = useMemo<Item[]>(() => [
    ...events.map((event): Item => ({ kind: 'shared', event })),
    ...personalEvents.map((event): Item => ({ kind: 'personal', event })),
  ], [events, personalEvents]);

  // 수업 표가 중심이라 평일을 기본으로 두고, 주말은 일정이 있을 때만 보여 준다
  const days = useMemo(() => weekDays.filter((d, i) => (
    i < 5 || (!hideWeekend && allItems.some((item) => isEventOnDate(item.event, d)))
  )), [weekDays, allItems, hideWeekend]);

  // 컴시간은 이번 주 시간표만 알려 준다
  const isCurrentWeek = isSameWeek(selectedDate, new Date(), { weekStartsOn: 1 });

  const cells = useMemo(() => {
    const map = new Map<string, Item[]>();
    const push = (key: string, item: Item) => map.set(key, [...(map.get(key) ?? []), item]);
    for (const day of days) {
      for (const item of allItems) {
        if (!isEventOnDate(item.event, day)) continue;
        const start = new Date(item.event.startDate);
        if (item.event.allDay || !isSameDay(start, day)) {
          push(slotKey(day, ALL_DAY_ROW), item);
          continue;
        }
        const index = rowIndexForMinute(rows, start.getHours() * 60 + start.getMinutes());
        push(slotKey(day, index < 0 ? BEFORE_ROW : index), item);
      }
    }
    return map;
  }, [days, allItems, rows]);

  const classesAt = (day: Date, period: number) => {
    if (!showTimetable || !isCurrentWeek || !timetableData || getHoliday(day)) return [];
    const weekday = day.getDay() === 0 ? 7 : day.getDay();
    return timetableData.teacherSchedule.filter((p) => p.weekday === weekday && p.period === period);
  };

  function slotFromPoint(x: number, y: number): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const key = (el as HTMLElement).dataset?.slot;
      if (key) return key;
    }
    return null;
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.active) {
        if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.active = true;
        setDraggingId(drag.item.event.id);
      }
      setDropKey(slotFromPoint(e.clientX, e.clientY));
    }

    async function onUp(e: MouseEvent) {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      setDropKey(null);
      if (!drag?.active) return;
      justDragged.current = Date.now();
      const target = slotFromPoint(e.clientX, e.clientY);
      if (!target) return;
      const [dayText, rowText] = target.split('|');
      const [y, m, d] = dayText.split('-').map(Number);
      const targetDay = new Date(y, m - 1, d);
      const rowIndex = Number(rowText);
      const start = new Date(drag.item.event.startDate);
      const end = new Date(drag.item.event.endDate);
      const duration = end.getTime() - start.getTime();
      const newStart = addDays(start, differenceInCalendarDays(targetDay, start));
      // 시각이 있는 일정을 교시 줄에 놓으면 그 교시 시작으로 옮긴다. 종일 일정은 날짜만 옮긴다.
      if (!drag.item.event.allDay && rowIndex >= 0 && rows[rowIndex]) {
        newStart.setHours(Math.floor(rows[rowIndex].startMin / 60), rows[rowIndex].startMin % 60, 0, 0);
      }
      if (newStart.getTime() === start.getTime()) return;
      const newEnd = new Date(newStart.getTime() + duration);
      try {
        if (drag.item.kind === 'shared') {
          await updateEvent(drag.item.event.id, { startDate: newStart, endDate: newEnd });
        } else if (user) {
          await updatePersonalEvent(user.id, drag.item.event.id, { startDate: newStart, endDate: newEnd });
        }
      } catch (err) {
        console.error('[PeriodWeek] move failed:', err);
        showToast('일정 이동에 실패했습니다', 'error');
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [rows, updateEvent, updatePersonalEvent, user]);

  function beginDrag(e: React.MouseEvent, item: Item) {
    const canMove = item.kind === 'shared' ? canManageEvent(item.event, user) : item.event.source === 'local';
    if (!canMove) return;
    e.preventDefault();
    dragRef.current = { item, startX: e.clientX, startY: e.clientY, active: false };
  }

  function renderItem(item: Item, showTime: boolean) {
    const open = () => {
      if (Date.now() - justDragged.current < 200) return;
      if (item.kind === 'shared') { setSelectedEvent(item.event); setShowEventDetail(true); }
      else onPersonalClick?.(item.event);
    };
    const common = {
      showTime,
      dragging: draggingId === item.event.id,
      style: styles.chip,
      onMouseDown: (e: React.MouseEvent) => beginDrag(e, item),
      onClick: open,
    };
    return item.kind === 'shared'
      ? <SharedChip key={item.event.id} event={item.event} {...common} />
      : <PersonalChip key={item.event.id} event={item.event} {...common} />;
  }

  function openInline(e: React.MouseEvent, day: Date, startMin?: number, endMin?: number) {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setInline({ day, startMin, endMin, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } });
  }

  const hasBefore = days.some((day) => (cells.get(slotKey(day, BEFORE_ROW)) ?? []).length > 0);
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    // 점심 줄은 그때 일정이 있을 때만 둔다. 수업이 없는 줄이라 자리만 차지한다.
    .filter(({ row, index }) => row.kind === 'period' || days.some((day) => (cells.get(slotKey(day, index)) ?? []).length > 0));

  const template = `44px repeat(${days.length}, minmax(0, 1fr))`;
  // 머리, 종일, 교시들, 방과후. 줄이 창 높이를 채우고, 일정이 많으면 그 줄만 늘어난다.
  const rowCount = 2 + (hasBefore ? 1 : 0) + visibleRows.length;
  const rowTemplate = `auto repeat(${rowCount}, minmax(min-content, 1fr))`;

  function slotProps(day: Date, row: number, startMin?: number, endMin?: number) {
    const key = slotKey(day, row);
    return {
      'data-slot': key,
      onDoubleClick: (e: React.MouseEvent) => openInline(e, day, startMin, endMin),
      style: {
        ...styles.cell,
        ...(isToday(day) ? styles.todayColumn : {}),
        ...(getHoliday(day) ? styles.holidayColumn : {}),
        ...(dropKey === key ? styles.dropCell : {}),
      },
    };
  }

  return (
    <div style={{ ...styles.grid, gridTemplateColumns: template, gridTemplateRows: rowTemplate }}>
      <div style={styles.corner} />
      {days.map((day) => {
        const holiday = getHoliday(day);
        const today = isToday(day);
        return (
          <div key={day.toISOString()} style={{ ...styles.head, ...(today ? styles.todayColumn : {}) }}>
            <span style={{ ...styles.dow, ...(holiday || day.getDay() === 0 ? { color: 'var(--weekend-text)' } : day.getDay() === 6 ? { color: 'var(--saturday-text)' } : {}) }}>
              {format(day, 'EEE', { locale: ko })}
            </span>
            {today ? <TodayNumber>{format(day, 'd')}</TodayNumber> : <span style={{ ...styles.dayNum, ...(holiday ? { color: 'var(--weekend-text)' } : {}) }}>{format(day, 'd')}</span>}
            {holiday && <span style={styles.holidayName} title={holiday}>{holiday}</span>}
          </div>
        );
      })}

      <div style={styles.rowHead}>종일</div>
      {days.map((day) => (
        <div key={`a-${day.toISOString()}`} {...slotProps(day, ALL_DAY_ROW)}>
          {(cells.get(slotKey(day, ALL_DAY_ROW)) ?? []).map((item) => renderItem(item, false))}
        </div>
      ))}

      {hasBefore && (
        <>
          <div style={styles.rowHead}>아침</div>
          {days.map((day) => (
            <div key={`b-${day.toISOString()}`} {...slotProps(day, BEFORE_ROW)}>
              {(cells.get(slotKey(day, BEFORE_ROW)) ?? []).map((item) => renderItem(item, true))}
            </div>
          ))}
        </>
      )}

      {visibleRows.map(({ row, index }) => (
        <React.Fragment key={`${row.kind}-${row.period}`}>
          <div style={styles.rowHead}>
            {row.label}
            <small style={styles.rowTime}>{row.time}</small>
          </div>
          {days.map((day) => (
            <div key={`${index}-${day.toISOString()}`} {...slotProps(day, index, row.startMin, row.kind === 'period' ? row.endMin : undefined)}>
              {row.kind === 'period' && classesAt(day, row.period).map((p) => (
                <div key={`${p.grade}-${p.classNum}`} style={styles.classChip}>
                  {p.grade}-{p.classNum}<small style={styles.classSubject}>{p.subject}</small>
                </div>
              ))}
              {(cells.get(slotKey(day, index)) ?? []).map((item) => renderItem(item, false))}
            </div>
          ))}
        </React.Fragment>
      ))}

      <div style={styles.rowHead}>방과후</div>
      {days.map((day) => (
        <div key={`z-${day.toISOString()}`} {...slotProps(day, rows.length)}>
          {(cells.get(slotKey(day, rows.length)) ?? []).map((item) => renderItem(item, true))}
        </div>
      ))}

      {inline && (
        <InlineAdd
          day={inline.day}
          anchor={inline.anchor}
          startMin={inline.startMin}
          endMin={inline.endMin}
          onClose={() => setInline(null)}
          onMorePersonal={onAddPersonalEvent}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    height: '100%',
    overflow: 'auto',
  },
  corner: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: 'color-mix(in srgb, var(--bg-modal) 92%, transparent)',
  },
  head: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 0,
    padding: '4px 2px',
    background: 'color-mix(in srgb, var(--bg-modal) 92%, transparent)',
  },
  dow: {
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  dayNum: {
    fontSize: 'var(--fs-lead)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  holidayName: {
    maxWidth: '100%',
    fontSize: 'var(--fs-caption)',
    fontWeight: 600,
    color: 'var(--weekend-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowHead: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderTop: '1px solid var(--grid-line)',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    lineHeight: 1.15,
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  rowTime: {
    fontWeight: 500,
    fontSize: 'var(--fs-label)',
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
    minHeight: 37,
    padding: 2,
    borderTop: '1px solid var(--grid-line)',
    boxShadow: 'inset 1px 0 0 var(--border-subtle)',
  },
  todayColumn: {
    background: 'var(--accent-soft)',
  },
  holidayColumn: {
    background: 'color-mix(in srgb, var(--weekend-text) 7%, transparent)',
  },
  dropCell: {
    background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
    outline: '2px dashed var(--accent)',
    outlineOffset: -2,
  },
  chip: {
    margin: 0,
    minHeight: 18,
    width: '100%',
    fontSize: 'min(var(--schedule-font-size), 12px)',
  },
  classChip: {
    padding: '2px 5px',
    borderRadius: 5,
    background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  classSubject: {
    marginLeft: 3,
    fontSize: 'inherit',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
};

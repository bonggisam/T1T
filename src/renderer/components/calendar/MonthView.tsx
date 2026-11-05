import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  addDays, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns';
import type { CalendarEvent, PersonalEvent } from '@shared/types';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useVisiblePersonalEvents } from '../../hooks/useVisiblePersonalEvents';
import { NARROW_MAX, useWindowSize, WIDE_MIN } from '../../hooks/useWindowSize';
import { canManageEvent } from '../../utils/calendarHelpers';
import { personalChipVars, sharedChipVars } from '../../utils/eventColors';
import { getHoliday } from '../../utils/holidays';
import { layoutWeekToFit, toWeekItem, type WeekItem } from '../../utils/monthLayout';
import { showToast } from '../common/Toast';
import { DayAgenda } from './DayAgenda';
import { DaySidePanel } from './DaySidePanel';
import { InlineAdd } from './InlineAdd';
import { PersonalChip, SharedChip } from './EventChip';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
// 실수 클릭으로 일정이 다른 날로 옮겨가는 사고 방지 — 의도적인 드래그만 활성화
const DRAG_THRESHOLD = 12;
/** 주말은 일정이 적으므로 좁게 두어 평일 칸에 글자를 더 넣는다 */
const COLUMN_TEMPLATE = '.66fr 1fr 1fr 1fr 1fr 1fr .66fr';
/** 칸 위쪽 날짜 줄 높이 */
const DATE_ROW = 22;
const LANE_GAP = 2;
/** 좁은 창에서 한 칸에 넣는 색 막대 수 */
const COMPACT_LANES = 3;

type MonthItem = { kind: 'shared'; event: CalendarEvent } | { kind: 'personal'; event: PersonalEvent };

interface DragInfo {
  item: MonthItem;
  originDayStr: string | null;
  startX: number;
  startY: number;
  activated: boolean;
}

interface MonthViewProps {
  onAddPersonalEvent?: () => void;
  onPersonalClick?: (pe: PersonalEvent) => void;
}

function sortKeyOf(event: { startDate: Date | string; allDay: boolean }): number {
  if (event.allDay) return -1;
  const start = new Date(event.startDate);
  return start.getHours() * 60 + start.getMinutes();
}

function dayFromPoint(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const day = (el as HTMLElement).dataset?.dayStr;
    if (day) return day;
  }
  return null;
}

export function MonthView({ onAddPersonalEvent, onPersonalClick }: MonthViewProps) {
  const {
    currentMonth, selectedDate, setSelectedDate, setSelectedEvent, setShowEventDetail, setView, updateEvent,
  } = useCalendarStore();
  const events = useVisibleEvents();
  const user = useAuthStore((s) => s.user);
  const { notifications } = useNotificationStore();
  const updatePersonalEvent = usePersonalEventStore((s) => s.updatePersonalEvent);
  const personalEvents = useVisiblePersonalEvents();
  const { width } = useWindowSize();
  const narrow = width < NARROW_MAX;
  const wide = width >= WIDE_MIN;

  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const justFinishedDragRef = useRef(0); // 드래그 종료 후 클릭 무시용 타임스탬프
  const [lanesThatFit, setLanesThatFit] = useState(2);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [inline, setInline] = useState<{ day: Date; anchor: { left: number; top: number; bottom: number } } | null>(null);

  const weeks = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
      end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }),
    });
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [currentMonth]);

  const unreadEventIds = useMemo(() => new Set(
    notifications.filter((n) => !n.read && n.eventId).map((n) => n.eventId),
  ), [notifications]);

  const items = useMemo<MonthItem[]>(() => [
    ...events.map((event): MonthItem => ({ kind: 'shared', event })),
    ...personalEvents.map((event): MonthItem => ({ kind: 'personal', event })),
  ], [events, personalEvents]);

  // 칸에 들어가는 레인 수. 창과 글자 크기가 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || narrow) return undefined;
    const measure = () => {
      const font = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--schedule-font-size')) || 13;
      const laneHeight = Math.ceil(font * 1.45) + LANE_GAP;
      const rowHeight = grid.clientHeight / weeks.length;
      setLanesThatFit(Math.max(1, Math.floor((rowHeight - DATE_ROW - LANE_GAP) / laneHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [narrow, weeks.length]);

  // ─── 드래그 ───
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.activated) {
        if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.activated = true;
        setDraggingId(drag.item.event.id);
      }
      setDropDay(dayFromPoint(e.clientX, e.clientY));
    }

    async function onMouseUp(e: MouseEvent) {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      setDropDay(null);
      if (!drag || !drag.activated) return;
      justFinishedDragRef.current = Date.now(); // 클릭 경합 방지

      const targetDayStr = dayFromPoint(e.clientX, e.clientY);
      if (!targetDayStr || !drag.originDayStr || targetDayStr === drag.originDayStr) return;
      const [ty, tm, td] = targetDayStr.split('-').map(Number);
      const [oy, om, od] = drag.originDayStr.split('-').map(Number);
      const daysDiff = differenceInCalendarDays(new Date(ty, tm - 1, td, 12), new Date(oy, om - 1, od, 12));
      if (daysDiff === 0) return;
      // 2일 이상 이동은 확인 다이얼로그 — 실수로 다른 주로 끌려가는 사고 방지
      if (Math.abs(daysDiff) >= 2) {
        const label = (y: number, m: number, d: number) => `${m}월 ${d}일 (${WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()]})`;
        if (!confirm(`일정을 ${label(oy, om, od)} → ${label(ty, tm, td)}로 이동할까요?`)) return;
      }
      const { event } = drag.item;
      const moved = {
        startDate: addDays(new Date(event.startDate), daysDiff),
        endDate: addDays(new Date(event.endDate), daysDiff),
      };
      try {
        if (drag.item.kind === 'shared') await updateEvent(event.id, moved);
        else if (user) await updatePersonalEvent(user.id, event.id, moved);
      } catch (err) {
        console.error('[MonthDrag] update failed:', err);
        showToast('일정 이동에 실패했습니다', 'error');
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [user, updateEvent, updatePersonalEvent]);

  function beginDrag(e: React.MouseEvent, item: MonthItem) {
    const canMove = item.kind === 'shared' ? canManageEvent(item.event, user) : item.event.source === 'local';
    if (!canMove) return;
    e.preventDefault();
    dragRef.current = {
      item,
      // 여러 날 막대는 잡은 자리의 날짜를 기준으로 옮긴다
      originDayStr: dayFromPoint(e.clientX, e.clientY),
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
    };
  }

  function openItem(item: MonthItem) {
    if (dragRef.current?.activated || Date.now() - justFinishedDragRef.current < 200) return;
    if (item.kind === 'shared') {
      setSelectedEvent(item.event);
      setShowEventDetail(true);
    } else {
      onPersonalClick?.(item.event);
    }
  }

  function selectDay(day: Date) {
    if (Date.now() - justFinishedDragRef.current < 200) return;
    setSelectedDate(day);
  }

  function showMore(day: Date) {
    setSelectedDate(day);
    // 옆 칸이나 아래 목록이 있으면 그날을 고르는 것으로 충분하다
    if (!wide && !narrow) setView('day');
  }

  function renderWeek(week: Date[]) {
    const weekItems = items
      .map((item) => toWeekItem(item, new Date(item.event.startDate), new Date(item.event.endDate), week, sortKeyOf(item.event)))
      .filter((entry): entry is WeekItem<MonthItem> => entry !== null);
    const layout = layoutWeekToFit(weekItems, 7, narrow ? COMPACT_LANES : lanesThatFit);

    return (
      <div key={week[0].toISOString()} style={narrow ? styles.weekCompact : styles.week}>
        <div style={styles.weekBack}>
          {week.map((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const holiday = getHoliday(day);
            const classes = ['cal-cell'];
            if (day.getDay() === 0 || day.getDay() === 6) classes.push('weekend');
            if (holiday) classes.push('holiday');
            if (isSameDay(day, selectedDate)) classes.push('selected');
            if (dropDay === dayStr) classes.push('drop');
            return (
              <div
                key={dayStr}
                data-day-str={dayStr}
                role="gridcell"
                aria-label={`${format(day, 'yyyy년 M월 d일')}${holiday ? ` ${holiday}` : ''}`}
                aria-selected={isSameDay(day, selectedDate)}
                className={classes.join(' ')}
                onClick={() => selectDay(day)}
                onDoubleClick={(e) => {
                  if (!user) return;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setSelectedDate(day);
                  setInline({ day, anchor: { left: rect.left, top: rect.top, bottom: rect.bottom } });
                }}
              />
            );
          })}
        </div>

        <div style={narrow ? styles.weekFrontCompact : styles.weekFront}>
          {week.map((day, col) => {
            const holiday = getHoliday(day);
            const dow = day.getDay();
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const color = dow === 0 || holiday ? 'var(--weekend-text)' : dow === 6 ? 'var(--saturday-text)' : 'var(--text-primary)';
            const unread = items.some((item) => (
              item.kind === 'shared' && unreadEventIds.has(item.event.id) && isSameDay(new Date(item.event.startDate), day)
            ));
            return (
              <div
                key={`d-${col}`}
                style={{ ...(narrow ? styles.dateCompact : styles.date), gridColumn: col + 1, gridRow: 1, opacity: inMonth ? 1 : 0.45 }}
              >
                <span style={today ? styles.todayNum : { ...styles.dateNum, color }}>{format(day, 'd')}</span>
                {!narrow && holiday && <span style={styles.holiday} title={holiday}>{holiday}</span>}
                {!narrow && unread && <span style={styles.newBadge}>N</span>}
              </div>
            );
          })}

          {layout.placed.map((entry) => {
            const position: React.CSSProperties = {
              gridColumn: `${entry.col + 1} / span ${entry.span}`,
              gridRow: entry.lane + 2,
            };
            const { item } = entry;
            if (narrow) {
              const vars = item.kind === 'shared' ? sharedChipVars(item.event) : personalChipVars(item.event, user?.profileColor);
              const className = `bar${entry.continuesLeft ? ' cl' : ''}${entry.continuesRight ? ' cr' : ''}${item.kind === 'personal' ? ' lock' : ''}`;
              return <span key={`${item.kind}-${item.event.id}`} className={className} style={{ ...vars, ...position }} />;
            }
            const common = {
              continuesLeft: entry.continuesLeft,
              continuesRight: entry.continuesRight,
              style: position,
              dragging: draggingId === item.event.id,
              onMouseDown: (e: React.MouseEvent) => beginDrag(e, item),
              onClick: () => openItem(item),
            };
            return item.kind === 'shared'
              ? <SharedChip key={`s-${item.event.id}`} event={item.event} {...common} />
              : <PersonalChip key={`p-${item.event.id}`} event={item.event} {...common} />;
          })}

          {!narrow && layout.overflow.map((count, col) => (count > 0 ? (
            <button
              key={`m-${col}`}
              onClick={() => showMore(week[col])}
              style={{ ...styles.more, gridColumn: col + 1, gridRow: layout.lanes + 2 }}
              title="이 날의 일정 모두 보기"
              aria-label={`${format(week[col], 'M월 d일')} 일정 ${count}개 더 보기`}
            >
              +{count}
            </button>
          ) : null))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <div style={styles.main}>
        <div style={styles.weekdays}>
          {WEEKDAY_LABELS.map((label, i) => (
            <span
              key={label}
              style={{
                ...styles.weekday,
                ...(i === 0 ? { color: 'var(--weekend-text)' } : i === 6 ? { color: 'var(--saturday-text)' } : {}),
              }}
            >
              {label}
            </span>
          ))}
        </div>

        <div ref={gridRef} role="grid" aria-label={format(currentMonth, 'yyyy년 M월')} style={narrow ? styles.gridCompact : styles.grid}>
          {weeks.map(renderWeek)}
        </div>

        {narrow && (
          <div style={styles.agenda}>
            <DayAgenda date={selectedDate} onPersonalClick={onPersonalClick} />
          </div>
        )}
      </div>

      {wide && <DaySidePanel date={selectedDate} onPersonalClick={onPersonalClick} />}

      {inline && (
        <InlineAdd
          day={inline.day}
          anchor={inline.anchor}
          onClose={() => setInline(null)}
          onMorePersonal={onAddPersonalEvent}
        />
      )}
    </div>
  );
}

const weekBase: React.CSSProperties = {
  position: 'relative',
  minHeight: 0,
  borderTop: '1px solid var(--grid-line)',
};

const frontBase: React.CSSProperties = {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: COLUMN_TEMPLATE,
  height: '100%',
  pointerEvents: 'none',
  alignContent: 'start',
};

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  weekdays: {
    display: 'grid',
    gridTemplateColumns: COLUMN_TEMPLATE,
    flexShrink: 0,
    padding: '4px 6px 2px',
  },
  weekday: {
    textAlign: 'center',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    padding: '0 6px 6px',
  },
  gridCompact: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    padding: '0 6px',
  },
  week: {
    ...weekBase,
    flex: 1,
  },
  weekCompact: {
    ...weekBase,
    flexShrink: 0,
    height: 38,
  },
  weekBack: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    gridTemplateColumns: COLUMN_TEMPLATE,
  },
  weekFront: {
    ...frontBase,
    gridTemplateRows: `${DATE_ROW}px`,
    gridAutoRows: 'calc(var(--schedule-font-size) * 1.45)',
    rowGap: LANE_GAP,
  },
  weekFrontCompact: {
    ...frontBase,
    gridTemplateRows: '23px repeat(3, 5px)',
  },
  date: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    minWidth: 0,
    padding: '0 5px',
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
  },
  dateCompact: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
  },
  dateNum: {
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    minWidth: 20,
    height: 20,
  },
  todayNum: {
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    minWidth: 20,
    height: 20,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontWeight: 700,
  },
  holiday: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--weekend-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  newBadge: {
    flexShrink: 0,
    marginLeft: 'auto',
    padding: '0 3px',
    borderRadius: 3,
    background: 'var(--badge)',
    color: 'var(--on-accent)',
    fontSize: 'var(--fs-micro)',
    fontWeight: 700,
  },
  more: {
    alignSelf: 'center',
    justifySelf: 'start',
    pointerEvents: 'auto',
    padding: '0 6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  agenda: {
    flex: 1,
    minHeight: 80,
    overflowY: 'auto',
    borderTop: '1px solid var(--grid-line)',
  },
};

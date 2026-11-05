import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import type { CalendarEvent, PersonalEvent, School, TeacherPeriod } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useComciganStore } from '../../store/comciganStore';
import { getTimedPeriods } from '../../utils/classPeriods';
import { buildPeriodRows, rowIndexForMinute, type PeriodRow } from '../../utils/periodRows';
import { InlineAdd } from './InlineAdd';
import { PersonalChip, SharedChip } from './EventChip';

interface PeriodBoardProps {
  date: Date;
  events: CalendarEvent[];
  personalEvents: PersonalEvent[];
  onPersonalClick?: (pe: PersonalEvent) => void;
  onAddPersonal?: () => void;
}

type Item = { kind: 'shared'; event: CalendarEvent } | { kind: 'personal'; event: PersonalEvent };

function minuteOf(item: Item, date: Date): number | null {
  const start = new Date(item.event.startDate);
  if (item.event.allDay || !isSameDay(start, date)) return null;
  return start.getHours() * 60 + start.getMinutes();
}

/** 오늘 급식 메뉴. 점심 줄에 보여 주며, 받지 못하면 줄만 남는다. */
function useTodayMenu(date: Date): string | null {
  const school = useAuthStore((s) => s.user?.school) as School | undefined;
  const [menu, setMenu] = useState<string | null>(null);
  const ymd = format(date, 'yyyy-MM-dd');
  useEffect(() => {
    let active = true;
    if (school !== 'taeseong_middle' && school !== 'taeseong_high') return undefined;
    window.electronAPI?.schoolFetchMeal(school, ymd)
      .then((res: any) => {
        if (!active) return;
        const day = res?.days?.find((d: any) => d.date === ymd);
        setMenu(day?.menu?.length ? day.menu.join(', ') : null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [school, ymd]);
  return menu;
}

/** 오늘 화면의 교시 표. 학교 하루는 시각보다 교시로 나뉘므로 교시마다 수업과 일정을 함께 놓는다. */
export function PeriodBoard({ date, events, personalEvents, onPersonalClick, onAddPersonal }: PeriodBoardProps) {
  const setSelectedEvent = useCalendarStore((s) => s.setSelectedEvent);
  const setShowEventDetail = useCalendarStore((s) => s.setShowEventDetail);
  const timetableData = useComciganStore((s) => s.timetableData);
  const showTimetable = useComciganStore((s) => s.showTimetable);
  const [now, setNow] = useState(() => new Date());
  const [inline, setInline] = useState<{ row: PeriodRow | null; anchor: { left: number; top: number; bottom: number } } | null>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const menu = useTodayMenu(date);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const rows = useMemo(() => buildPeriodRows(timetableData?.classTimes) ?? [], [timetableData?.classTimes]);
  const periods = useMemo<TeacherPeriod[]>(
    () => (showTimetable ? getTimedPeriods(timetableData, date) : []),
    [showTimetable, timetableData, date],
  );

  const { allDay, before, byRow, after } = useMemo(() => {
    const groups = { allDay: [] as Item[], before: [] as Item[], byRow: new Map<number, Item[]>(), after: [] as Item[] };
    const items: Item[] = [
      ...events.map((event): Item => ({ kind: 'shared', event })),
      ...personalEvents.map((event): Item => ({ kind: 'personal', event })),
    ];
    for (const item of items) {
      const minute = minuteOf(item, date);
      if (minute === null) { groups.allDay.push(item); continue; }
      const index = rows.length ? rowIndexForMinute(rows, minute) : -1;
      if (index < 0) groups.before.push(item);
      else if (index >= rows.length) groups.after.push(item);
      else groups.byRow.set(index, [...(groups.byRow.get(index) ?? []), item]);
    }
    return groups;
  }, [events, personalEvents, rows, date]);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = isSameDay(date, now);

  // 처음 열면 지금 교시가 보이게 한다
  const scrolled = useRef(false);
  useEffect(() => {
    if (!scrolled.current && currentRef.current) {
      currentRef.current.scrollIntoView({ block: 'nearest' });
      scrolled.current = true;
    }
  });

  function renderItem(item: Item, showTime: boolean) {
    if (item.kind === 'shared') {
      return (
        <SharedChip
          key={item.event.id}
          event={item.event}
          showTime={showTime}
          style={styles.chip}
          onClick={() => { setSelectedEvent(item.event); setShowEventDetail(true); }}
        />
      );
    }
    return (
      <PersonalChip
        key={item.event.id}
        event={item.event}
        showTime={showTime}
        style={styles.chip}
        onClick={() => onPersonalClick?.(item.event)}
      />
    );
  }

  function openInline(e: React.MouseEvent, row: PeriodRow | null) {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setInline({ row, anchor: { left: rect.left + 90, top: rect.top, bottom: rect.bottom } });
  }

  return (
    <div style={styles.board}>
      {allDay.length > 0 && (
        <div style={styles.row}>
          <div style={styles.label}><b style={styles.labelMain}>종일</b></div>
          <div style={styles.cell}>{allDay.map((item) => renderItem(item, false))}</div>
        </div>
      )}
      {before.length > 0 && (
        <div style={styles.row}>
          <div style={styles.label}><b style={styles.labelMain}>아침</b></div>
          <div style={styles.cell}>{before.map((item) => renderItem(item, true))}</div>
        </div>
      )}

      {rows.map((row, index) => {
        const current = today && nowMin >= row.startMin && nowMin < row.endMin;
        const past = today && nowMin >= row.endMin;
        const classes = row.kind === 'period' ? periods.filter((p) => p.period === row.period) : [];
        const items = byRow.get(index) ?? [];
        return (
          <div
            key={`${row.kind}-${row.period}`}
            ref={current ? currentRef : undefined}
            style={{
              ...styles.row,
              ...(row.kind === 'lunch' ? styles.lunchRow : {}),
              ...(current ? styles.currentRow : {}),
            }}
            onDoubleClick={(e) => openInline(e, row)}
          >
            <div style={styles.label}>
              <b style={{ ...styles.labelMain, ...(past ? styles.past : {}) }}>{row.label}</b>
              <small style={styles.labelTime}>{row.time}</small>
            </div>
            <div style={styles.cell}>
              {row.kind === 'lunch' && <div style={styles.menu}>{menu ?? '급식 정보 없음'}</div>}
              {classes.map((p) => (
                <div key={`${p.grade}-${p.classNum}`} style={{ ...styles.classLine, ...(past ? styles.past : {}) }}>
                  {p.grade}-{p.classNum} {p.subject}
                </div>
              ))}
              {row.kind === 'period' && classes.length === 0 && items.length === 0 && <div style={styles.free}>공강</div>}
              {items.map((item) => renderItem(item, true))}
            </div>
          </div>
        );
      })}

      <div style={styles.row} onDoubleClick={(e) => openInline(e, null)}>
        <div style={styles.label}><b style={styles.labelMain}>방과후</b></div>
        <div style={styles.cell}>
          {after.length > 0 ? after.map((item) => renderItem(item, true)) : <div style={styles.free}>일정 없음</div>}
        </div>
      </div>

      {inline && (
        <InlineAdd
          day={date}
          anchor={inline.anchor}
          startMin={inline.row?.startMin}
          endMin={inline.row?.kind === 'period' ? inline.row.endMin : undefined}
          onClose={() => setInline(null)}
          onMorePersonal={onAddPersonal}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  board: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '84px minmax(0, 1fr)',
    alignItems: 'center',
    minHeight: 30,
    borderTop: '1px solid var(--grid-line)',
  },
  currentRow: {
    background: 'var(--accent-soft)',
  },
  lunchRow: {
    background: 'var(--tint-neutral)',
  },
  label: {
    padding: '3px 0 3px 12px',
    whiteSpace: 'nowrap',
  },
  labelMain: {
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  labelTime: {
    marginLeft: 4,
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
    padding: '3px 10px 3px 2px',
  },
  chip: {
    margin: 0,
    minHeight: 20,
    width: '100%',
  },
  classLine: {
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  past: {
    color: 'var(--text-muted)',
  },
  free: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-muted)',
  },
  menu: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
};

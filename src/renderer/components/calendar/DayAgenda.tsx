import React, { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { AlertTriangle, Lock } from 'lucide-react';
import type { CalendarEvent, PersonalEvent } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useComciganStore } from '../../store/comciganStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useVisiblePersonalEvents } from '../../hooks/useVisiblePersonalEvents';
import { CATEGORY_LABELS, getSchoolTag, isEventOnDate } from '../../utils/calendarHelpers';
import { formatMinutes, getTimedPeriods, isTimetableWeek } from '../../utils/classPeriods';
import { personalChipVars, sharedChipVars } from '../../utils/eventColors';
import { getHoliday } from '../../utils/holidays';
import { hasTimetableOverlap } from '../../utils/timetableOverlap';

const SCHOOL_NAMES: Record<string, string> = { taeseong_middle: '태성중', taeseong_high: '태성고', all: '공통' };

interface DayAgendaProps {
  date: Date;
  onPersonalClick?: (pe: PersonalEvent) => void;
  /** 내 수업도 시간 순서에 넣는다 */
  showClasses?: boolean;
  /** 일정이 없을 때 안내를 생략한다 (목록 화면) */
  hideEmpty?: boolean;
}

type Row =
  | { kind: 'shared'; key: string; minute: number; event: CalendarEvent }
  | { kind: 'personal'; key: string; minute: number; event: PersonalEvent }
  | { kind: 'class'; key: string; minute: number; label: string; room: string };

function startMinute(event: { startDate: Date | string; allDay: boolean }, date: Date): number {
  const start = new Date(event.startDate);
  if (event.allDay || !isSameDay(start, date)) return -1;
  return start.getHours() * 60 + start.getMinutes();
}

function spanLabel(event: { startDate: Date | string; endDate: Date | string }): string {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return isSameDay(start, end) ? '' : ` ${format(start, 'M/d')}~${format(end, 'M/d')}`;
}

/** 하루 일정을 시간 순서로 보여 주는 목록. 좁은 창의 달력 아래, 넓은 창의 오늘 칸, 목록 화면에서 쓴다. */
export function DayAgenda({ date, onPersonalClick, showClasses = true, hideEmpty }: DayAgendaProps) {
  const user = useAuthStore((s) => s.user);
  const setSelectedEvent = useCalendarStore((s) => s.setSelectedEvent);
  const setShowEventDetail = useCalendarStore((s) => s.setShowEventDetail);
  const events = useVisibleEvents();
  const personalEvents = useVisiblePersonalEvents();
  const timetableData = useComciganStore((s) => s.timetableData);
  const hasConfig = useComciganStore((s) => !!s.config);
  const showTimetable = useComciganStore((s) => s.showTimetable);

  // 받아 둔 주의 수업만 보여 준다. 주말에는 다음 주를 받는다. 다른 주는 달라질 수 있다.
  const periods = useMemo(() => (
    showClasses && hasConfig && showTimetable && isTimetableWeek(timetableData, date)
      ? getTimedPeriods(timetableData, date)
      : []
  ), [showClasses, hasConfig, showTimetable, date, timetableData]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const event of events) {
      if (isEventOnDate(event, date)) out.push({ kind: 'shared', key: event.id, minute: startMinute(event, date), event });
    }
    for (const event of personalEvents) {
      if (isEventOnDate(event, date)) out.push({ kind: 'personal', key: event.id, minute: startMinute(event, date), event });
    }
    for (const p of periods) {
      out.push({
        kind: 'class',
        key: `class-${p.period}-${p.grade}-${p.classNum}`,
        minute: p.startMin,
        label: `${p.period}교시 ${p.subject}`,
        room: `${p.grade}-${p.classNum}`,
      });
    }
    return out.sort((a, b) => a.minute - b.minute);
  }, [events, personalEvents, periods, date]);

  const holiday = getHoliday(date);
  const today = isSameDay(date, new Date());

  if (hideEmpty && rows.length === 0 && !holiday) return null;

  return (
    <div>
      <div style={styles.head}>
        <strong style={styles.day}>{format(date, 'M월 d일 EEEE', { locale: ko })}</strong>
        {today && <span style={styles.tag}>오늘</span>}
        {holiday && <span style={{ ...styles.tag, color: 'var(--weekend-text)' }}>{holiday}</span>}
      </div>

      {rows.length === 0 && <p style={styles.empty}>등록된 일정이 없습니다.</p>}

      {rows.map((row) => {
        const time = row.minute < 0 ? '종일' : formatMinutes(row.minute);
        if (row.kind === 'class') {
          return (
            <div key={row.key} className="ag-row static">
              <span style={styles.time}>{time}</span>
              <span style={{ ...styles.mark, background: 'var(--accent)' }} />
              <span style={styles.body}>
                <span style={styles.title}>{row.label}</span>
                <span style={styles.sub}>내 수업 {row.room}</span>
              </span>
            </div>
          );
        }
        if (row.kind === 'personal') {
          const vars = personalChipVars(row.event, user?.profileColor);
          return (
            <button key={row.key} className="ag-row" onClick={() => onPersonalClick?.(row.event)}>
              <span style={styles.time}>{time}</span>
              <span style={{ ...styles.mark, background: vars['--c-base'] }} />
              <span style={styles.body}>
                <span style={styles.title}>
                  <Lock size="0.9em" strokeWidth={2.4} aria-label="개인 일정" style={styles.lock} />
                  {row.event.title}
                </span>
                <span style={styles.sub}>나만 보기{spanLabel(row.event)}</span>
              </span>
            </button>
          );
        }
        const vars = sharedChipVars(row.event);
        const overlaps = row.minute >= 0 ? hasTimetableOverlap(row.event, periods) : [];
        return (
          <button
            key={row.key}
            className="ag-row"
            onClick={() => { setSelectedEvent(row.event); setShowEventDetail(true); }}
          >
            <span style={styles.time}>{time}</span>
            <span style={{ ...styles.mark, background: vars['--c-base'] }} />
            <span style={styles.body}>
              <span style={styles.title}>
                <span style={{ ...styles.letter, color: vars['--c-ink'] }}>{getSchoolTag(row.event.school)}</span>
                {row.event.title}
              </span>
              <span style={styles.sub}>
                {SCHOOL_NAMES[row.event.school] ?? ''} {CATEGORY_LABELS[row.event.category] ?? ''}{spanLabel(row.event)}
              </span>
              {overlaps.length > 0 && (
                <span style={styles.warn}>
                  <AlertTriangle size="1em" strokeWidth={2.4} />
                  {overlaps.map((p) => p.period).join('·')}교시 수업과 겹침
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  head: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '9px 12px 3px',
  },
  day: {
    fontSize: 'var(--fs-lead)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  tag: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  empty: {
    padding: '6px 12px 12px',
    fontSize: 'var(--fs-control)',
    color: 'var(--text-secondary)',
  },
  time: {
    flexShrink: 0,
    width: 40,
    paddingTop: 1,
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  mark: {
    flexShrink: 0,
    alignSelf: 'stretch',
    width: 3,
    minHeight: 18,
    borderRadius: 2,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 'var(--schedule-font-size)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflowWrap: 'anywhere',
  },
  letter: {
    flexShrink: 0,
    fontSize: '0.85em',
    fontWeight: 800,
  },
  lock: {
    flexShrink: 0,
    color: 'var(--text-secondary)',
  },
  sub: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  warn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--warning)',
  },
};

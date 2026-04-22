import React, { useState, useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import type { PersonalEvent, CalendarEvent } from '@shared/types';
import { getCreatorTag, PERSONAL_SUFFIX, formatEventTooltip, formatPersonalTooltip, canManageEvent } from '../../utils/calendarHelpers';

interface TodayViewProps {
  onAddPersonalEvent?: () => void;
  onPersonalClick?: (pe: PersonalEvent) => void;
}

/**
 * 오늘부터 N일간의 일정을 리스트로 표시.
 * - 기본: 오늘 하루 (N=1)
 * - + 버튼: 표시 범위 +1일 (최대 30일)
 * - − 버튼: 표시 범위 −1일 (최소 1일)
 */
export function TodayView({ onAddPersonalEvent, onPersonalClick }: TodayViewProps = {}) {
  const { setSelectedEvent, setShowEventDetail, setShowEventModal } = useCalendarStore();
  const { user } = useAuthStore();
  const events = useVisibleEvents();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  const [days, setDays] = useState(1);

  // 날짜 배열 (오늘 ~ 오늘+days-1)
  const dateRange = useMemo(() => {
    const arr: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [days]);

  const rangeStart = dateRange[0];
  const rangeEnd = new Date(dateRange[dateRange.length - 1]);
  rangeEnd.setHours(23, 59, 59, 999);

  function eventsOnDate(date: Date) {
    const t = new Date(date); t.setHours(12, 0, 0, 0);
    const shared = events.filter((e) => {
      const s = new Date(e.startDate); s.setHours(0, 0, 0, 0);
      const en = new Date(e.endDate); en.setHours(23, 59, 59, 999);
      return t >= s && t <= en;
    }).sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
    const personal = personalEvents.filter((pe) => {
      const s = new Date(pe.startDate); s.setHours(0, 0, 0, 0);
      const en = new Date(pe.endDate); en.setHours(23, 59, 59, 999);
      return t >= s && t <= en;
    }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return { shared, personal };
  }

  const totalCount = dateRange.reduce((acc, d) => {
    const { shared, personal } = eventsOnDate(d);
    return acc + shared.length + personal.length;
  }, 0);

  const rangeLabel = days === 1
    ? format(rangeStart, 'M월 d일 (EEE)', { locale: ko })
    : `${format(rangeStart, 'M/d')} – ${format(dateRange[dateRange.length - 1], 'M/d')}`;

  return (
    <div style={styles.container}>
      {/* 범위 조절 바 */}
      <div style={styles.navBar}>
        <button
          onClick={() => setDays((n) => Math.max(1, n - 1))}
          style={{ ...styles.navBtn, opacity: days <= 1 ? 0.4 : 1 }}
          disabled={days <= 1}
          title="표시 일수 −1"
          aria-label="표시 일수 줄이기"
        >
          −
        </button>
        <div style={styles.dateBlock}>
          <div style={styles.dateMain}>
            {days === 1 ? '오늘' : `오늘부터 ${days}일`}
          </div>
          <div style={styles.dateSub}>
            {rangeLabel} · 일정 {totalCount}건
          </div>
        </div>
        <button
          onClick={() => setDays((n) => Math.min(30, n + 1))}
          style={{ ...styles.navBtn, opacity: days >= 30 ? 0.4 : 1 }}
          disabled={days >= 30}
          title="표시 일수 +1 (최대 30일)"
          aria-label="표시 일수 늘리기"
        >
          +
        </button>
      </div>

      {/* 일정 리스트 (날짜별 그룹) */}
      <div style={styles.list}>
        {totalCount === 0 && (
          <div style={styles.empty}>
            <span style={{ fontSize: 36 }}>📭</span>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              이 기간에는 일정이 없습니다
            </div>
            {user && (
              <div style={styles.emptyActions}>
                <button onClick={() => setShowEventModal(true)} style={styles.addBtn}>+ 공유 일정</button>
                {onAddPersonalEvent && (
                  <button onClick={onAddPersonalEvent} style={styles.addBtnSecondary}>+ 개인 일정</button>
                )}
              </div>
            )}
          </div>
        )}

        {dateRange.map((d) => {
          const { shared, personal } = eventsOnDate(d);
          const count = shared.length + personal.length;
          if (days > 1 && count === 0) {
            // 다일 뷰에서 빈 날도 헤더는 표시
            return (
              <div key={d.toISOString()} style={styles.dateGroup}>
                <DateHeader date={d} count={0} />
                <div style={styles.emptyRow}>일정 없음</div>
              </div>
            );
          }
          if (count === 0) return null;
          return (
            <div key={d.toISOString()} style={styles.dateGroup}>
              {days > 1 && <DateHeader date={d} count={count} />}
              {shared.map((event) => (
                <SharedRow
                  key={event.id}
                  event={event}
                  user={user}
                  onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
                />
              ))}
              {personal.map((pe) => (
                <PersonalRow
                  key={pe.id}
                  pe={pe}
                  onClick={() => onPersonalClick?.(pe)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateHeader({ date, count }: { date: Date; count: number }) {
  const today = isSameDay(date, new Date());
  return (
    <div style={styles.dateHeader}>
      <span style={{
        ...styles.dateHeaderMain,
        color: today ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {format(date, 'M/d (EEE)', { locale: ko })}
        {today && <span style={styles.todayBadge}>오늘</span>}
      </span>
      <span style={styles.dateHeaderCount}>{count}건</span>
    </div>
  );
}

function SharedRow({ event, user, onClick }: { event: CalendarEvent; user: any; onClick: () => void }) {
  const isOwner = canManageEvent(event, user);
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const timeText = event.allDay ? '종일' : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
  return (
    <button
      onClick={onClick}
      style={{ ...styles.row, borderLeft: `4px solid ${event.adminColor}` }}
      title={formatEventTooltip(event, isOwner)}
    >
      <span style={styles.time}>{timeText}</span>
      <span style={styles.title}>
        {getCreatorTag(event) && <span style={styles.tag}>{getCreatorTag(event)}</span>}
        {event.title}
      </span>
      {event.adminName && <span style={styles.author}>· {event.adminName}</span>}
    </button>
  );
}

function PersonalRow({ pe, onClick }: { pe: PersonalEvent; onClick: () => void }) {
  const start = new Date(pe.startDate);
  const end = new Date(pe.endDate);
  const timeText = pe.allDay ? '종일' : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
  const canDrag = pe.source === 'local';
  return (
    <button
      onClick={onClick}
      style={{ ...styles.row, borderLeft: `4px solid ${pe.color}`, opacity: 0.92 }}
      title={formatPersonalTooltip(pe, canDrag)}
    >
      <span style={styles.time}>{timeText}</span>
      <span style={styles.title}>
        {pe.title} <span style={styles.personalTag}>{PERSONAL_SUFFIX}</span>
      </span>
      <span style={styles.author}>· 개인</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  navBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 8px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 20,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  dateBlock: {
    flex: 1,
    textAlign: 'center' as const,
  },
  dateMain: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  dateSub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: 500,
    color: 'var(--text-muted)',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  dateGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  dateHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    marginBottom: 2,
  },
  dateHeaderMain: {
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  todayBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#fff',
  },
  dateHeaderCount: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background 0.15s',
    width: '100%',
  },
  time: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    minWidth: 92,
    fontVariantNumeric: 'tabular-nums' as any,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tag: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 5px',
    marginRight: 6,
    borderRadius: 4,
    background: 'var(--accent)',
    color: '#fff',
  },
  personalTag: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: 4,
    background: 'var(--success, #10B981)',
    color: '#fff',
    marginLeft: 4,
  },
  author: {
    fontSize: 11,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  empty: {
    padding: '40px 16px',
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
  },
  emptyRow: {
    padding: '6px 12px',
    fontSize: 11,
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
  },
  emptyActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
  },
  addBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  addBtnSecondary: {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--success, #10B981)',
    background: 'transparent',
    color: 'var(--success, #10B981)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

import React from 'react';
import { format, isToday, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import type { PersonalEvent } from '@shared/types';
import { getCreatorTag, PERSONAL_SUFFIX, formatEventTooltip, formatPersonalTooltip, canManageEvent } from '../../utils/calendarHelpers';

interface TodayViewProps {
  onAddPersonalEvent?: () => void;
  onPersonalClick?: (pe: PersonalEvent) => void;
}

/**
 * 하루 일정 간단 리스트 뷰.
 * - 상단에 -/+ 버튼으로 1일씩 이동
 * - '오늘' 버튼으로 즉시 복귀
 * - 종일 / 시간별 정렬된 리스트로 표시
 */
export function TodayView({ onAddPersonalEvent, onPersonalClick }: TodayViewProps = {}) {
  const {
    selectedDate, setSelectedDate, setCurrentMonth,
    setSelectedEvent, setShowEventDetail, setShowEventModal,
  } = useCalendarStore();
  const { user } = useAuthStore();
  const events = useVisibleEvents();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  const d = new Date(selectedDate);
  const dayEvents = events
    .filter((e) => {
      const s = new Date(e.startDate); s.setHours(0, 0, 0, 0);
      const en = new Date(e.endDate); en.setHours(23, 59, 59, 999);
      const t = new Date(d); t.setHours(12, 0, 0, 0);
      return t >= s && t <= en;
    })
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });

  const dayPersonal = personalEvents
    .filter((pe) => {
      const s = new Date(pe.startDate); s.setHours(0, 0, 0, 0);
      const en = new Date(pe.endDate); en.setHours(23, 59, 59, 999);
      const t = new Date(d); t.setHours(12, 0, 0, 0);
      return t >= s && t <= en;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  function changeDay(delta: number) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    setSelectedDate(next);
    setCurrentMonth(next);
  }

  function goToday() {
    const today = new Date();
    setSelectedDate(today);
    setCurrentMonth(today);
  }

  const isTodaySelected = isToday(selectedDate);
  const total = dayEvents.length + dayPersonal.length;

  return (
    <div style={styles.container}>
      {/* 날짜 네비 바 */}
      <div style={styles.navBar}>
        <button onClick={() => changeDay(-1)} style={styles.navBtn} title="전일 (−1일)" aria-label="전일">
          −
        </button>
        <div style={styles.dateBlock}>
          <div style={styles.dateMain}>
            {format(d, 'yyyy년 M월 d일', { locale: ko })}
          </div>
          <div style={{ ...styles.dateSub, color: isTodaySelected ? 'var(--accent)' : 'var(--text-muted)' }}>
            {format(d, 'EEEE', { locale: ko })}{isTodaySelected ? ' · 오늘' : ''} · 일정 {total}건
          </div>
        </div>
        <button onClick={() => changeDay(1)} style={styles.navBtn} title="익일 (+1일)" aria-label="익일">
          +
        </button>
        {!isTodaySelected && (
          <button onClick={goToday} style={styles.todayBtn} title="오늘로 이동">
            오늘
          </button>
        )}
      </div>

      {/* 일정 리스트 */}
      <div style={styles.list}>
        {total === 0 && (
          <div style={styles.empty}>
            <span style={{ fontSize: 36 }}>📭</span>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              이 날에는 일정이 없습니다
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

        {dayEvents.map((event) => {
          const isOwner = canManageEvent(event, user);
          const start = new Date(event.startDate);
          const end = new Date(event.endDate);
          const timeText = event.allDay
            ? '종일'
            : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
          return (
            <button
              key={event.id}
              onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
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
        })}

        {dayPersonal.map((pe) => {
          const start = new Date(pe.startDate);
          const end = new Date(pe.endDate);
          const timeText = pe.allDay ? '종일' : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
          const canDrag = pe.source === 'local';
          return (
            <button
              key={pe.id}
              onClick={() => onPersonalClick?.(pe)}
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
        })}
      </div>
    </div>
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
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 18,
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
  },
  todayBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--accent)',
    background: 'transparent',
    color: 'var(--accent)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
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

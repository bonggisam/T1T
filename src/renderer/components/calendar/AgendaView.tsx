import React, { useMemo } from 'react';
import { format, isSameDay, startOfToday, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useUIStore } from '../../store/uiStore';
import { getCreatorTag } from '../../utils/calendarHelpers';
import type { CalendarEvent } from '@shared/types';

const CATEGORY_LABELS: Record<string, string> = {
  event: '행사', meeting: '회의', deadline: '마감일', notice: '공지', other: '기타',
};

export function AgendaView() {
  const { setSelectedEvent, setShowEventDetail } = useCalendarStore();
  const { categoryFilter } = useUIStore();
  // useVisibleEvents가 이미 학교+카테고리 필터를 적용함 — 여기서는 날짜만 필터
  const events = useVisibleEvents();

  // 앞으로 60일간 일정
  const upcoming = useMemo(() => {
    const today = startOfToday();
    const end = addDays(today, 60);
    return events
      .filter((e) => {
        const start = new Date(e.startDate);
        return start >= today && start <= end;
      })
      .sort((a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
  }, [events]);

  // 날짜별로 그룹화
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of upcoming) {
      const key = format(new Date(e.startDate), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [upcoming]);

  return (
    <div style={styles.container}>
      {groups.length === 0 ? (
        <div style={styles.empty}>
          <span style={{ fontSize: 24 }} role="img" aria-label="빈 상자">📭</span>
          <span>{categoryFilter !== 'all' ? '해당 카테고리에 예정된 일정이 없습니다' : '예정된 일정이 없습니다'}</span>
        </div>
      ) : (
        groups.map(([dateKey, dayEvents]) => {
          const date = new Date(dateKey);
          const today = isSameDay(date, new Date());
          return (
            <div key={dateKey} style={styles.group}>
              <div style={{ ...styles.dateHeader, color: today ? 'var(--accent)' : 'var(--text-primary)' }}>
                {today && <span style={styles.todayBadge}>TODAY</span>}
                {format(date, 'M월 d일 (EEEE)', { locale: ko })}
              </div>
              <div style={styles.eventList}>
                {dayEvents.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => { setSelectedEvent(e); setShowEventDetail(true); }}
                    style={{ ...styles.eventRow, borderLeftColor: e.adminColor }}
                  >
                    <div style={styles.timeCol}>
                      {e.allDay ? '종일' : format(new Date(e.startDate), 'HH:mm')}
                    </div>
                    <div style={styles.contentCol}>
                      <div style={styles.titleRow}>
                        <span style={styles.eventTitle}>{getCreatorTag(e) && `${getCreatorTag(e)} `}{e.title}</span>
                        <span style={{ ...styles.categoryBadge, background: e.adminColor }}>
                          {CATEGORY_LABELS[e.category] || e.category}
                        </span>
                      </div>
                      {e.adminName && <span style={styles.meta}>{e.adminName}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', overflow: 'auto', padding: 8 },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, padding: '40px 0', color: 'var(--text-muted)', fontSize: 13,
  },
  group: { marginBottom: 12 },
  dateHeader: {
    fontSize: 12, fontWeight: 700,
    padding: '6px 4px',
    borderBottom: '1px solid var(--border-subtle)',
    marginBottom: 6,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  todayBadge: {
    fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
    background: 'var(--accent)', color: '#fff',
  },
  eventList: { display: 'flex', flexDirection: 'column', gap: 4 },
  eventRow: {
    display: 'flex', gap: 8, padding: 8, borderRadius: 6,
    background: 'var(--bg-secondary)', cursor: 'pointer',
    borderLeft: '3px solid',
    transition: 'background 0.12s',
  },
  timeCol: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
    minWidth: 44,
  },
  contentCol: { flex: 1, minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' },
  eventTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' },
  categoryBadge: {
    fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
    color: '#fff',
  },
  meta: { fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 2 },
};

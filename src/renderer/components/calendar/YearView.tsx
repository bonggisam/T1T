import React, { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, format, addMonths, startOfYear,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function YearView() {
  const { currentMonth, setCurrentMonth, setView, setSelectedDate } = useCalendarStore();
  const events = useVisibleEvents();
  const year = currentMonth.getFullYear();

  const months = useMemo(() => {
    const yearStart = startOfYear(new Date(year, 0, 1));
    return Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
  }, [year]);

  // 월별 일정 개수
  const eventCountByMonth = useMemo(() => {
    const counts = new Array(12).fill(0);
    for (const event of events) {
      const d = new Date(event.startDate);
      if (d.getFullYear() === year) counts[d.getMonth()]++;
    }
    return counts;
  }, [events, year]);

  // 일자별 이벤트 있음 표시 (year 필드 내)
  function hasEventOn(day: Date): boolean {
    return events.some((e) => {
      const s = new Date(e.startDate); s.setHours(0,0,0,0);
      const ee = new Date(e.endDate); ee.setHours(23,59,59,999);
      return day >= s && day <= ee;
    });
  }

  function clickDay(day: Date) {
    setCurrentMonth(day);
    setSelectedDate(day);
    setView('month');
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => setCurrentMonth(new Date(year - 1, 0, 1))} style={styles.navBtn}>← {year - 1}</button>
        <span style={styles.yearTitle}>{year}년</span>
        <button onClick={() => setCurrentMonth(new Date(year + 1, 0, 1))} style={styles.navBtn}>{year + 1} →</button>
      </div>

      <div style={styles.grid}>
        {months.map((monthDate, i) => {
          const monthStart = startOfMonth(monthDate);
          const monthEnd = endOfMonth(monthDate);
          const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
          const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
          const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

          return (
            <div key={i} style={styles.monthCard}>
              <div style={styles.monthHeader}>
                <span style={styles.monthTitle}>{i + 1}월</span>
                <span style={styles.eventCount}>📅 {eventCountByMonth[i]}</span>
              </div>
              <div style={styles.weekRow}>
                {WEEKDAYS.map((w, j) => (
                  <span key={j} style={{
                    ...styles.weekdayLabel,
                    color: j === 0 ? '#EF4444' : j === 6 ? '#3B82F6' : 'var(--text-muted)',
                  }}>{w}</span>
                ))}
              </div>
              <div style={styles.daysGrid}>
                {days.map((day) => {
                  const isCurrentMonth = isSameMonth(day, monthDate);
                  const today = isSameDay(day, new Date());
                  const hasEvt = hasEventOn(day);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => clickDay(day)}
                      style={{
                        ...styles.day,
                        color: !isCurrentMonth ? 'var(--text-muted)' :
                               day.getDay() === 0 ? '#EF4444' :
                               day.getDay() === 6 ? '#3B82F6' : 'var(--text-primary)',
                        opacity: !isCurrentMonth ? 0.3 : 1,
                        background: today ? 'var(--accent)' : 'transparent',
                        fontWeight: today ? 700 : 400,
                      }}
                    >
                      <span style={{ color: today ? '#fff' : undefined }}>{format(day, 'd')}</span>
                      {hasEvt && isCurrentMonth && !today && <span style={styles.dot} />}
                    </button>
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
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: 8, overflow: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', marginBottom: 8 },
  navBtn: {
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  yearTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  monthCard: {
    padding: 8, borderRadius: 10,
    background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
  },
  monthHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  monthTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' },
  eventCount: { fontSize: 9, color: 'var(--text-muted)' },
  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 },
  weekdayLabel: { fontSize: 8, textAlign: 'center', fontWeight: 600, padding: '2px 0' },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginTop: 2 },
  day: {
    position: 'relative',
    fontSize: 9, padding: '3px 0',
    border: 'none', borderRadius: 4,
    textAlign: 'center', cursor: 'pointer',
    minHeight: 16,
  },
  dot: {
    position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
    width: 3, height: 3, borderRadius: '50%',
    background: 'var(--accent)',
  },
};

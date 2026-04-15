import React from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CalendarView } from '@shared/types';

interface CalendarHeaderProps {
  onAddPersonalEvent?: () => void;
}

export function CalendarHeader({ onAddPersonalEvent }: CalendarHeaderProps = {}) {
  const { currentMonth, view, setView, navigateMonth, setShowEventModal, setCurrentMonth, setSelectedDate } = useCalendarStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const viewButtons: { key: CalendarView; label: string }[] = [
    { key: 'month', label: '월' },
    { key: 'week', label: '주' },
    { key: 'day', label: '일' },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.nav}>
        <button onClick={() => navigateMonth(-1)} style={styles.navBtn}>◀</button>
        <span style={styles.monthLabel}>
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </span>
        <button onClick={() => navigateMonth(1)} style={styles.navBtn}>▶</button>
        <button
          onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
          style={styles.todayBtn}
        >
          오늘
        </button>
      </div>
      <div style={styles.actions}>
        <div style={styles.viewToggle}>
          {viewButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                ...styles.viewBtn,
                ...(view === key ? styles.viewBtnActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {onAddPersonalEvent && (
          <button onClick={onAddPersonalEvent} style={styles.addPersonalBtn}>
            + 개인
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setShowEventModal(true)} style={styles.addBtn}>
            + 일정
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    flexShrink: 0,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--text-secondary)',
    padding: '4px 6px',
    borderRadius: 6,
    transition: 'background 0.15s',
  },
  todayBtn: {
    background: 'none',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--accent)',
    padding: '2px 8px',
    borderRadius: 6,
    marginLeft: 4,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
    minWidth: 100,
    textAlign: 'center' as const,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--bg-secondary)',
    borderRadius: 8,
    padding: 2,
  },
  viewBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    borderRadius: 6,
    transition: 'all 0.15s',
  },
  viewBtnActive: {
    background: 'var(--accent)',
    color: '#fff',
  },
  addPersonalBtn: {
    background: 'transparent',
    color: 'var(--success)',
    border: '1px solid var(--success)',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 8,
    transition: 'all 0.15s',
  },
  addBtn: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 8,
    transition: 'background 0.15s',
  },
};

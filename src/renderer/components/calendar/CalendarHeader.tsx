import React from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CalendarView, EventCategory } from '@shared/types';

interface CalendarHeaderProps {
  onAddPersonalEvent?: () => void;
  onToggleSearch?: () => void;
  onPrint?: () => void;
  categoryFilter: EventCategory | 'all';
  setCategoryFilter: (c: EventCategory | 'all') => void;
}

const CATEGORIES: { key: EventCategory | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: '전체', icon: '📋' },
  { key: 'event', label: '행사', icon: '🎉' },
  { key: 'meeting', label: '회의', icon: '💼' },
  { key: 'deadline', label: '마감', icon: '⏰' },
  { key: 'notice', label: '공지', icon: '📢' },
  { key: 'other', label: '기타', icon: '📌' },
];

export function CalendarHeader({ onAddPersonalEvent, onToggleSearch, onPrint, categoryFilter, setCategoryFilter }: CalendarHeaderProps) {
  const { currentMonth, view, setView, navigateMonth, setShowEventModal, setCurrentMonth, setSelectedDate } = useCalendarStore();
  const { user } = useAuthStore();
  const isLoggedIn = !!user;

  const viewButtons: { key: CalendarView; label: string }[] = [
    { key: 'month', label: '월' },
    { key: 'week', label: '주' },
    { key: 'day', label: '일' },
    { key: 'year', label: '년' },
    { key: 'agenda', label: '📋' },
    { key: 'stats', label: '📊' },
  ];

  return (
    <>
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
        {onToggleSearch && (
          <button onClick={onToggleSearch} style={styles.searchBtn} title="일정 검색">
            🔍
          </button>
        )}
        {onPrint && (
          <button onClick={onPrint} style={styles.searchBtn} title="인쇄">
            🖨️
          </button>
        )}
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
        {isLoggedIn && (
          <button onClick={() => setShowEventModal(true)} style={styles.addBtn}>
            + 일정
          </button>
        )}
      </div>
    </div>

    {/* 카테고리 필터 바 */}
    <div style={styles.filterBar}>
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          onClick={() => setCategoryFilter(c.key)}
          style={{
            ...styles.categoryChip,
            ...(categoryFilter === c.key ? styles.categoryChipActive : {}),
          }}
        >
          {c.icon} {c.label}
        </button>
      ))}
    </div>
    </>
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
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)',
    minWidth: 110,
    textAlign: 'center' as const,
    textShadow: '0 1px 3px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,0.7)',
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
    padding: '5px 14px',
    fontSize: 14,
    fontWeight: 600,
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
  searchBtn: {
    background: 'none',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    padding: '3px 6px',
    fontSize: 12,
    borderRadius: 6,
    transition: 'background 0.15s',
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
  filterBar: {
    display: 'flex',
    gap: 4,
    padding: '4px 12px 8px',
    overflowX: 'auto',
    flexShrink: 0,
  },
  categoryChip: {
    background: 'var(--bg-secondary)',
    border: '1px solid transparent',
    cursor: 'pointer',
    padding: '5px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    borderRadius: 14,
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  },
  categoryChipActive: {
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 600,
  },
};

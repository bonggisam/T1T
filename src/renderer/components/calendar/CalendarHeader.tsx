import React from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { downloadICS } from '../../utils/icsExport';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CalendarView, EventCategory, School } from '@shared/types';

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
  const { viewingSchool, setViewingSchool } = useUIStore();
  const visibleEvents = useVisibleEvents();
  const isLoggedIn = !!user;

  const handleExportICS = () => {
    if (visibleEvents.length === 0) {
      alert('내보낼 일정이 없습니다.');
      return;
    }
    const ym = format(currentMonth, 'yyyy-MM');
    downloadICS(visibleEvents, `tonet-${ym}.ics`);
  };

  const schoolButtons: { key: 'all' | School; label: string; icon: string }[] = [
    { key: 'taeseong_middle', label: '태성중', icon: '🏫' },
    { key: 'taeseong_high', label: '태성고', icon: '🎓' },
    { key: 'all', label: '전체', icon: '🌐' },
  ];

  const viewButtons: { key: CalendarView; label: string }[] = [
    { key: 'today', label: '오늘' },
    { key: 'month', label: '월' },
    { key: 'week', label: '주' },
    { key: 'day', label: '일' },
    { key: 'year', label: '년' },
    { key: 'agenda', label: '📋' },
    { key: 'stats', label: '📊' },
  ];

  const handleViewClick = (key: CalendarView) => {
    // '오늘' 뷰 클릭 시 날짜를 today로 리셋
    if (key === 'today') {
      const today = new Date();
      setCurrentMonth(today);
      setSelectedDate(today);
    }
    setView(key);
  };

  return (
    <>
    <div style={styles.container}>
      <div style={styles.nav}>
        <button onClick={() => navigateMonth(-1)} style={styles.navBtn} aria-label="이전 달" title="이전 달">◀</button>
        <span style={styles.monthLabel}>
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </span>
        <button onClick={() => navigateMonth(1)} style={styles.navBtn} aria-label="다음 달" title="다음 달">▶</button>
        <button
          onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
          style={styles.todayBtn}
        >
          오늘
        </button>
      </div>
      <div style={styles.actions}>
        {onToggleSearch && (
          <button onClick={onToggleSearch} style={styles.searchBtn} aria-label="일정 검색" title="일정 검색">
            🔍
          </button>
        )}
        {onPrint && (
          <button onClick={onPrint} style={styles.searchBtn} aria-label="인쇄" title="인쇄">
            🖨️
          </button>
        )}
        <button onClick={handleExportICS} style={styles.searchBtn} aria-label="ics 내보내기" title=".ics 파일로 내보내기 (Google/Apple 캘린더 호환)">
          📤
        </button>
        <div style={styles.viewToggle}>
          {viewButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleViewClick(key)}
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

    {/* 학교 선택 토글 바 */}
    {isLoggedIn && (
      <div style={styles.schoolToggleBar}>
        {schoolButtons.map((s) => (
          <button
            key={s.key}
            onClick={() => setViewingSchool(s.key)}
            style={{
              ...styles.schoolChip,
              ...(viewingSchool === s.key ? styles.schoolChipActive : {}),
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>
    )}

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
  schoolToggleBar: {
    display: 'flex',
    gap: 4,
    padding: '4px 12px 2px',
    overflowX: 'auto',
    flexShrink: 0,
    borderBottom: '1px dashed var(--border-subtle)',
    paddingBottom: 6,
    marginBottom: 4,
  },
  schoolChip: {
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
  schoolChipActive: {
    background: 'linear-gradient(135deg, #8B5CF6, #4A90E2)',
    color: '#fff',
    fontWeight: 700,
    border: '1px solid transparent',
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

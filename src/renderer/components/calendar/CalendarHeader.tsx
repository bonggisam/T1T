import React from 'react';
import {
  ChevronLeft, ChevronRight, Search, Printer, Share, List, BarChart3, Plus,
  School as SchoolIcon, GraduationCap, Globe2,
} from 'lucide-react';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';
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

const CATEGORIES: { key: EventCategory | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'event', label: '행사' },
  { key: 'meeting', label: '회의' },
  { key: 'deadline', label: '마감' },
  { key: 'notice', label: '공지' },
  { key: 'other', label: '기타' },
];

export function CalendarHeader({ onAddPersonalEvent, onToggleSearch, onPrint, categoryFilter, setCategoryFilter }: CalendarHeaderProps) {
  const { currentMonth, view, setView, navigateMonth, setShowEventModal, setCurrentMonth, setSelectedDate } = useCalendarStore();
  const { user } = useAuthStore();
  const { viewingSchool, setViewingSchool } = useUIStore();
  const visibleEvents = useVisibleEvents();
  const isLoggedIn = !!user;
  const filterScrollRef = useHorizontalScroll<HTMLDivElement>();

  const handleExportICS = () => {
    if (visibleEvents.length === 0) {
      alert('내보낼 일정이 없습니다.');
      return;
    }
    const ym = format(currentMonth, 'yyyy-MM');
    downloadICS(visibleEvents, `t1t-${ym}.ics`);
  };

  const schoolButtons: { key: 'all' | School; label: string; Icon: React.ComponentType<any> }[] = [
    { key: 'taeseong_middle', label: '태성중', Icon: SchoolIcon },
    { key: 'taeseong_high', label: '태성고', Icon: GraduationCap },
    { key: 'all', label: '전체', Icon: Globe2 },
  ];

  const viewButtons: { key: CalendarView; label: string; Icon?: React.ComponentType<any> }[] = [
    { key: 'today', label: '오늘' },
    { key: 'month', label: '월' },
    { key: 'week', label: '주' },
    { key: 'day', label: '일' },
    { key: 'year', label: '년' },
    { key: 'agenda', label: '목록', Icon: List },
    { key: 'stats', label: '통계', Icon: BarChart3 },
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
        <button onClick={() => navigateMonth(-1)} style={styles.navBtn} aria-label="이전 달" title="이전 달">
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>
        <span style={styles.monthLabel}>
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </span>
        <button onClick={() => navigateMonth(1)} style={styles.navBtn} aria-label="다음 달" title="다음 달">
          <ChevronRight size={16} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
          style={styles.todayBtn}
        >
          오늘
        </button>
        <div style={styles.toolGroup}>
          {onToggleSearch && (
            <button onClick={onToggleSearch} style={styles.toolBtn} aria-label="일정 검색" title="일정 검색">
              <Search size={14} strokeWidth={2.2} />
            </button>
          )}
          {onPrint && (
            <button onClick={onPrint} style={styles.toolBtn} aria-label="인쇄" title="인쇄">
              <Printer size={14} strokeWidth={2.2} />
            </button>
          )}
          <button onClick={handleExportICS} style={styles.toolBtn} aria-label="ics 내보내기" title=".ics 파일로 내보내기 (Google/Apple 캘린더 호환)">
            <Share size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div style={styles.actions}>
        <div style={styles.viewToggle} role="tablist" aria-label="보기 전환">
          {viewButtons.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => handleViewClick(key)}
              role="tab"
              aria-selected={view === key}
              title={Icon ? label : undefined}
              aria-label={label}
              style={{
                ...styles.viewBtn,
                ...(view === key ? styles.viewBtnActive : {}),
              }}
            >
              {Icon ? <Icon size={14} strokeWidth={2.3} /> : label}
            </button>
          ))}
        </div>
        <div style={styles.addGroup}>
          {onAddPersonalEvent && (
            <button onClick={onAddPersonalEvent} style={styles.addPersonalBtn} title="개인 일정 추가">
              <Plus size={12} strokeWidth={2.6} /> 개인
            </button>
          )}
          {isLoggedIn && (
            <button onClick={() => setShowEventModal(true)} style={styles.addBtn} title="공유 일정 추가">
              <Plus size={12} strokeWidth={2.6} /> 일정
            </button>
          )}
        </div>
      </div>
    </div>

    {/* 학교 선택 + 카테고리 필터 */}
    <div ref={filterScrollRef} style={styles.filterBar}>
      {isLoggedIn && (
        <div style={styles.schoolSegment} role="tablist" aria-label="학교 선택">
          {schoolButtons.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setViewingSchool(key)}
              role="tab"
              aria-selected={viewingSchool === key}
              style={{
                ...styles.schoolBtn,
                ...(viewingSchool === key ? styles.schoolBtnActive : {}),
              }}
            >
              <Icon size={12} strokeWidth={2.4} /> {label}
            </button>
          ))}
        </div>
      )}
      <div style={styles.categoryGroup}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategoryFilter(c.key)}
            style={{
              ...styles.categoryChip,
              ...(categoryFilter === c.key ? styles.categoryChipActive : {}),
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 8,
    padding: '10px 12px 6px',
    flexShrink: 0,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  navBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    width: 26,
    height: 26,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-primary)',
    height: 24,
    padding: '0 9px',
    borderRadius: 999,
    marginLeft: 2,
    whiteSpace: 'nowrap',
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '-0.03em',
    color: 'var(--text-primary)',
    textAlign: 'center' as const,
    whiteSpace: 'nowrap',
    padding: '0 2px',
    fontVariantNumeric: 'tabular-nums',
  },
  toolGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    marginLeft: 4,
  },
  toolBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    width: 26,
    height: 26,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    padding: 2,
    gap: 1,
  },
  viewBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    height: 26,
    minWidth: 28,
    padding: '0 8px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    borderRadius: 8,
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  viewBtnActive: {
    background: 'var(--bg-modal)',
    color: 'var(--accent)',
    boxShadow: '0 1px 3px rgba(15,23,42,0.12), 0 0 0 1px var(--border-subtle)',
  },
  addGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  addPersonalBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    height: 28,
    padding: '0 10px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 9,
    whiteSpace: 'nowrap',
  },
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    height: 28,
    padding: '0 11px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 9,
    boxShadow: '0 1px 2px rgba(15,23,42,0.15), inset 0 1px 0 rgba(255,255,255,0.18)',
    whiteSpace: 'nowrap',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '2px 12px 8px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-subtle)',
    marginBottom: 4,
  },
  schoolSegment: {
    display: 'flex',
    flexShrink: 0,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 9,
    padding: 2,
    gap: 1,
  },
  schoolBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    height: 22,
    padding: '0 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    borderRadius: 7,
    whiteSpace: 'nowrap',
  },
  schoolBtnActive: {
    background: 'var(--text-primary)',
    color: 'var(--bg-modal)',
  },
  categoryGroup: {
    display: 'flex',
    gap: 2,
    flexShrink: 0,
  },
  categoryChip: {
    background: 'none',
    border: '1px solid transparent',
    cursor: 'pointer',
    height: 24,
    padding: '0 9px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  },
  categoryChipActive: {
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
  },
};

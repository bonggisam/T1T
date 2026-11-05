import React from 'react';
import { ChevronDown, ListFilter, Plus } from 'lucide-react';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { usePopover } from '../../hooks/usePopover';
import { useWindowSize } from '../../hooks/useWindowSize';
import { SCHOOL_LABELS } from '@shared/types';
import type { CalendarView, EventCategory, School } from '@shared/types';

interface CalendarHeaderProps {
  onAddPersonalEvent?: () => void;
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

const SCHOOLS: { key: 'all' | School; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'taeseong_middle', label: '태성중' },
  { key: 'taeseong_high', label: '태성고' },
];

const MAIN_VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'month', label: '월' },
  { key: 'week', label: '주' },
  { key: 'agenda', label: '목록' },
];

const MORE_VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'year', label: '년' },
  { key: 'stats', label: '통계' },
];

/** 좁은 창에서 글자를 줄이는 폭 */
const TIGHT_MAX = 370;

/** 머리글 둘째 줄: 보기 전환, 필터, 추가 */
export function CalendarHeader({ onAddPersonalEvent, categoryFilter, setCategoryFilter }: CalendarHeaderProps) {
  const { view, setView, setShowEventModal, setCurrentMonth, setSelectedDate } = useCalendarStore();
  const { user } = useAuthStore();
  const { viewingSchool, setViewingSchool } = useUIStore();
  const { width } = useWindowSize();
  const filter = usePopover();
  const more = usePopover();
  const tight = width < TIGHT_MAX;

  function chooseView(key: CalendarView) {
    // '오늘' 뷰 클릭 시 날짜를 today로 리셋
    if (key === 'today') {
      const today = new Date();
      setCurrentMonth(today);
      setSelectedDate(today);
    }
    setView(key);
    more.setOpen(false);
  }

  const parts: string[] = [];
  if (viewingSchool !== 'all') parts.push(SCHOOL_LABELS[viewingSchool]);
  if (categoryFilter !== 'all') parts.push(CATEGORIES.find((c) => c.key === categoryFilter)?.label ?? '');
  const filtered = parts.length > 0;
  const moreLabel = MORE_VIEWS.find((v) => v.key === view)?.label;

  return (
    <div style={styles.bar}>
      <div className="seg" role="group" aria-label="보기">
        {MAIN_VIEWS.map(({ key, label }) => (
          <button key={key} onClick={() => chooseView(key)} aria-pressed={view === key}>{label}</button>
        ))}
        <button
          ref={more.anchorRef}
          onClick={() => more.setOpen((v) => !v)}
          aria-pressed={!!moreLabel}
          aria-expanded={more.open}
          aria-label="다른 보기"
          title="다른 보기"
          style={styles.moreBtn}
        >
          {moreLabel}
          <ChevronDown size={13} strokeWidth={2.4} />
        </button>
      </div>

      <button
        ref={filter.anchorRef}
        onClick={() => filter.setOpen((v) => !v)}
        aria-expanded={filter.open}
        aria-label="학교와 분류 필터"
        title="학교와 분류 필터"
        style={{
          ...styles.filterBtn,
          ...(filtered ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : {}),
        }}
      >
        <ListFilter size={14} strokeWidth={2.2} />
        {!tight && (filtered ? parts.join(' ') : '전체')}
      </button>

      <span style={styles.spacer} />

      {onAddPersonalEvent && (
        <button onClick={onAddPersonalEvent} style={styles.addPersonal} title="개인 일정 추가" aria-label="개인 일정 추가">
          <Plus size={13} strokeWidth={2.6} />{!tight && '개인'}
        </button>
      )}
      {user && (
        <button onClick={() => setShowEventModal(true)} style={styles.add} title="공유 일정 추가" aria-label="공유 일정 추가">
          <Plus size={13} strokeWidth={2.6} />{!tight && '일정'}
        </button>
      )}

      {more.open && (
        <div ref={more.popRef} className="menu-pop" style={more.position(150)}>
          <div className="seg">
            {MORE_VIEWS.map(({ key, label }) => (
              <button key={key} onClick={() => chooseView(key)} aria-pressed={view === key}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {filter.open && (
        <div ref={filter.popRef} className="menu-pop" style={filter.position(250)}>
          <h4 style={styles.popTitle}>학교</h4>
          <div className="seg" style={styles.popGroup}>
            {SCHOOLS.map(({ key, label }) => (
              <button key={key} onClick={() => setViewingSchool(key)} aria-pressed={viewingSchool === key}>{label}</button>
            ))}
          </div>
          <h4 style={styles.popTitle}>분류</h4>
          <div className="seg" style={{ ...styles.popGroup, marginBottom: 0, flexWrap: 'wrap' }}>
            {CATEGORIES.map(({ key, label }) => (
              <button key={key} onClick={() => setCategoryFilter(key)} aria-pressed={categoryFilter === key}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: 38,
    padding: '0 8px',
    flexShrink: 0,
    borderBottom: '1px solid var(--grid-line)',
  },
  spacer: {
    flex: 1,
    minWidth: 2,
  },
  moreBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
    paddingLeft: 4,
    paddingRight: 4,
  },
  filterBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    padding: '3px 7px',
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  add: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
    padding: '4px 8px 4px 6px',
    border: 'none',
    borderRadius: 7,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  addPersonal: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
    padding: '3px 8px 3px 6px',
    border: '1px solid var(--border-color)',
    borderRadius: 7,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  popTitle: {
    margin: '0 0 5px',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  popGroup: {
    marginBottom: 9,
  },
};

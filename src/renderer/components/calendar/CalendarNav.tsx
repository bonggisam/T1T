import React from 'react';
import { addDays, format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCalendarStore } from '../../store/calendarStore';

/**
 * 제목 줄의 날짜 이동. 보기에 맞는 단위로 움직인다: 주 화면은 한 주, 일 화면은 하루, 나머지는 한 달.
 * short면 날짜를 줄이고 연도를 뺀다. today는 오늘 단추를 넣을 자리가 있는지, dayYear는 날짜가 긴 일 화면에 연도를 넣을 자리가 있는지다.
 */
export function CalendarNav({ short, today, dayYear }: { short?: boolean; today?: boolean; dayYear?: boolean }) {
  const {
    view, currentMonth, selectedDate,
    navigateMonth, setCurrentMonth, setSelectedDate,
  } = useCalendarStore();

  function step(direction: -1 | 1) {
    if (view === 'week' || view === 'day') {
      const next = addDays(selectedDate, direction * (view === 'week' ? 7 : 1));
      setSelectedDate(next);
      setCurrentMonth(next);
      return;
    }
    if (view === 'year') {
      setCurrentMonth(new Date(currentMonth.getFullYear() + direction, 0, 1));
      return;
    }
    navigateMonth(direction);
  }

  function goToday() {
    const now = new Date();
    setCurrentMonth(now);
    setSelectedDate(now);
  }

  const base = view === 'week' || view === 'day' ? selectedDate : currentMonth;
  const unit = view === 'week' ? '주' : view === 'day' ? '일' : view === 'year' ? '해' : '달';
  const labelFormat = view === 'year'
    ? (short ? 'yyyy' : 'yyyy년')
    : view === 'day' ? (short ? 'M.d' : 'M월 d일') : 'M월';
  const showYear = !short && view !== 'year' && (view !== 'day' || dayYear);

  return (
    <div style={styles.nav}>
      <button onClick={() => step(-1)} style={styles.arrow} aria-label={`이전 ${unit}`} title={`이전 ${unit}`}>
        <ChevronLeft size={16} strokeWidth={2.4} />
      </button>
      <strong style={styles.label} aria-live="polite">
        {format(base, labelFormat)}
        {showYear && <small style={styles.year}>{format(base, 'yyyy')}</small>}
      </strong>
      <button onClick={() => step(1)} style={styles.arrow} aria-label={`다음 ${unit}`} title={`다음 ${unit}`}>
        <ChevronRight size={16} strokeWidth={2.4} />
      </button>
      {today && <button onClick={goToday} style={styles.today}>오늘</button>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    minWidth: 0,
  },
  arrow: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 24,
    height: 26,
    padding: 0,
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  label: {
    padding: '0 2px',
    fontSize: 'var(--fs-title)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    color: 'var(--text-primary)',
  },
  year: {
    marginLeft: 3,
    fontSize: 'var(--fs-body)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  today: {
    flexShrink: 0,
    marginLeft: 3,
    padding: '3px 8px',
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
};

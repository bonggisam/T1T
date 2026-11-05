import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO, addDays, isSameDay, isWithinInterval, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuthStore } from '../../store/authStore';
import { useDarkMode } from '../../hooks/useDarkMode';
import type { School } from '@shared/types';
import { Ic, type IconName } from '../common/Ic';

interface MealDay {
  date: string; // YYYY-MM-DD
  weekday: string; // 일~토
  menu: string[];
  calorie: string;
}

interface MealData {
  weekStart: string;
  weekEnd: string;
  days: MealDay[];
}

// 학교 색상 — 라이트/다크 분리 (다크는 더 밝은 톤)
const SCHOOL_OPTIONS_LIGHT: { key: School; label: string; icon: IconName; color: string }[] = [
  { key: 'taeseong_middle', label: '태성중', icon: 'school', color: 'var(--school-middle)' },
  { key: 'taeseong_high', label: '태성고', icon: 'graduation', color: 'var(--school-high)' },
];
const SCHOOL_OPTIONS_DARK: { key: School; label: string; icon: IconName; color: string }[] = [
  { key: 'taeseong_middle', label: '태성중', icon: 'school', color: 'var(--school-middle-bright)' },
  { key: 'taeseong_high', label: '태성고', icon: 'graduation', color: 'var(--school-high-bright)' },
];

interface MealViewProps {
  onBack: () => void;
}

/**
 * 급식 메뉴 — 학교 홈페이지를 스크래핑해서 주별로 정리된 UI로 표시.
 * 양교 토글 + 주간 네비 + 카드 형식.
 */
export function MealView({ onBack }: MealViewProps) {
  const { user } = useAuthStore();
  const defaultSchool: School = (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high')
    ? user.school : 'taeseong_middle';
  const [selectedSchool, setSelectedSchool] = useState<School>(defaultSchool);
  const [weekDate, setWeekDate] = useState<Date>(new Date());
  const [data, setData] = useState<MealData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const isDark = useDarkMode();
  const SCHOOL_OPTIONS = isDark ? SCHOOL_OPTIONS_DARK : SCHOOL_OPTIONS_LIGHT;
  const palette = SCHOOL_OPTIONS.find((s) => s.key === selectedSchool)!;

  async function load() {
    // 학교나 주를 빨리 바꾸면 늦게 온 앞 요청이 지금 화면을 덮는다
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const ymd = format(weekDate, 'yyyyMMdd');
      const res = await window.electronAPI?.schoolFetchMeal(selectedSchool, ymd);
      if (request !== requestRef.current) return;
      if (!res) throw new Error('응답 없음');
      setData(res);
    } catch (err: any) {
      if (request !== requestRef.current) return;
      console.error('[Meal] fetch failed:', err);
      setError(err?.message || '급식 정보를 가져올 수 없습니다');
      setData(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchool, weekDate]);

  function changeWeek(delta: number) {
    setWeekDate((d) => addDays(d, delta * 7));
  }

  function goToday() {
    setWeekDate(new Date());
  }

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  /** date-fns가 throw하지 않도록 안전한 포매터 */
  function safeFormat(dateStr: string | undefined, fmt: string): string {
    if (!dateStr) return '';
    try {
      const d = parseISO(dateStr);
      if (!isValid(d)) return '';
      return format(d, fmt, { locale: ko });
    } catch {
      return '';
    }
  }

  const weekLabel = data && data.weekStart && data.weekEnd
    ? `${safeFormat(data.weekStart, 'M월 d일')} ~ ${safeFormat(data.weekEnd, 'M월 d일')}`
    : '';

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기">
          <Ic name="calendar" />캘린더
        </button>
        <span style={styles.label}><Ic name="meal" />급식 메뉴</span>
        <button onClick={load} style={styles.iconBtn} title="새로고침" aria-label="새로고침" disabled={loading}>
          <Ic name="refresh" gap={false} />
        </button>
      </div>

      {/* 학교 토글 */}
      <div style={styles.schoolToggle}>
        {SCHOOL_OPTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelectedSchool(s.key)}
            style={{
              ...styles.schoolBtn,
              ...(selectedSchool === s.key
                ? { background: s.color, color: 'var(--on-accent)', border: '1px solid transparent', fontWeight: 700 }
                : {}),
            }}
          >
            <Ic name={s.icon} />{s.label}
          </button>
        ))}
      </div>

      {/* 주간 네비 */}
      <div style={styles.weekNav}>
        <button onClick={() => changeWeek(-1)} style={styles.navBtn} title="이전 주">◀ 이전 주</button>
        <div style={styles.weekInfo}>
          <div style={styles.weekRange}>{weekLabel || '—'}</div>
          <button onClick={goToday} style={styles.todayLink} title="이번 주로">오늘</button>
        </div>
        <button onClick={() => changeWeek(1)} style={styles.navBtn} title="다음 주">다음 주 ▶</button>
      </div>

      <div style={styles.content}>
        {loading && (
          <div style={styles.empty}>
            <div className="spinner" />
            <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>급식 메뉴 불러오는 중...</p>
          </div>
        )}
        {!loading && error && (
          <div style={styles.error}><Ic name="alert" />{error}</div>
        )}
        {!loading && !error && data && (!data.days || data.days.length === 0) && (
          <div style={styles.empty}><Ic name="inbox" />이번 주 급식 정보가 없습니다</div>
        )}
        {!loading && !error && data && data.days && data.days.map((day) => {
          const isToday = day.date === todayStr;
          const hasMenu = day.menu && day.menu.length > 0;
          const dayLabel = safeFormat(day.date, 'M/d');
          return (
            <div
              key={day.date}
              style={{
                ...styles.dayCard,
                borderLeft: `4px solid ${isToday ? palette.color : 'var(--border-subtle)'}`,
                background: isToday ? `color-mix(in srgb, ${palette.color} 6%, transparent)` : 'var(--bg-secondary)',
              }}
            >
              <div style={styles.dayHeader}>
                <div style={styles.dayDate}>
                  {isToday && <span style={{ ...styles.todayBadge, background: palette.color }}>오늘</span>}
                  <span style={{ ...styles.dayLabel, color: day.weekday === '일' ? 'var(--weekend-text)' : day.weekday === '토' ? 'var(--saturday-text)' : 'var(--text-primary)' }}>
                    {dayLabel || day.date} ({day.weekday})
                  </span>
                </div>
                {day.calorie && (
                  <span style={styles.calorie}><Ic name="flame" />{day.calorie}</span>
                )}
              </div>
              {hasMenu ? (
                <ul style={styles.menuList}>
                  {day.menu.map((item, i) => (
                    <li key={i} style={styles.menuItem}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p style={styles.noMeal}>—</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0, background: 'var(--tint-neutral)',
  },
  backBtn: {
    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
    fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--accent)',
  },
  label: { flex: 1, fontSize: 'var(--fs-control)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 'var(--fs-lead)', padding: '4px 6px', borderRadius: 6,
  },
  schoolToggle: {
    display: 'flex', gap: 6,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  schoolBtn: {
    flex: 1,
    padding: '6px 10px',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  weekNav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', gap: 8,
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  navBtn: {
    padding: '5px 10px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  weekInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  weekRange: { fontSize: 'var(--fs-control)', fontWeight: 700, color: 'var(--text-primary)' },
  todayLink: {
    fontSize: 'var(--fs-caption)', fontWeight: 500,
    border: 'none', background: 'transparent',
    color: 'var(--accent)', cursor: 'pointer',
    padding: 0,
  },
  content: { flex: 1, overflow: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  empty: { textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 'var(--fs-control)' },
  error: {
    margin: 8, padding: 12, borderRadius: 8,
    background: 'var(--danger-soft)', color: 'var(--danger)',
    fontSize: 'var(--fs-body)', textAlign: 'center',
  },
  dayCard: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
  },
  dayHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  dayDate: { display: 'flex', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 'var(--fs-subtitle)', fontWeight: 700 },
  todayBadge: {
    fontSize: 'var(--fs-caption)', fontWeight: 800,
    padding: '2px 7px', borderRadius: 8,
    color: 'var(--on-accent)',
  },
  calorie: {
    fontSize: 'var(--fs-body)', fontWeight: 600,
    color: 'var(--text-muted)',
    background: 'var(--warning-soft)',
    padding: '3px 9px',
    borderRadius: 12,
  },
  menuList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 5,
  },
  menuItem: {
    fontSize: 'var(--fs-control)', // 사용자 요청 — 급식 메뉴 글자 크게
    fontWeight: 500,
    color: 'var(--text-primary)',
    background: 'var(--bg-primary)',
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
  },
  noMeal: {
    margin: 0, fontSize: 'var(--fs-control)', color: 'var(--text-muted)', fontStyle: 'italic' as const,
  },
};

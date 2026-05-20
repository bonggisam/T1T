import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO, addDays, isSameDay, isWithinInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';

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

const SCHOOL_OPTIONS: { key: School; label: string; icon: string; color: string }[] = [
  { key: 'taeseong_middle', label: '태성중', icon: '🏫', color: '#10B981' },
  { key: 'taeseong_high', label: '태성고', icon: '🎓', color: '#8B5CF6' },
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

  const palette = SCHOOL_OPTIONS.find((s) => s.key === selectedSchool)!;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const ymd = format(weekDate, 'yyyyMMdd');
      const res = await window.electronAPI?.schoolFetchMeal(selectedSchool, ymd);
      if (!res) throw new Error('응답 없음');
      setData(res);
    } catch (err: any) {
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

  const weekLabel = data
    ? `${format(parseISO(data.weekStart), 'M월 d일', { locale: ko })} ~ ${format(parseISO(data.weekEnd), 'M월 d일', { locale: ko })}`
    : '';

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기">
          📅 캘린더
        </button>
        <span style={styles.label}>🍱 급식 메뉴</span>
        <button onClick={load} style={styles.iconBtn} title="새로고침" aria-label="새로고침" disabled={loading}>
          🔄
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
                ? { background: s.color, color: '#fff', border: '1px solid transparent', fontWeight: 700 }
                : {}),
            }}
          >
            {s.icon} {s.label}
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
          <div style={styles.error}>⚠️ {error}</div>
        )}
        {!loading && !error && data && data.days.length === 0 && (
          <div style={styles.empty}>📭 이번 주 급식 정보가 없습니다</div>
        )}
        {!loading && !error && data && data.days.map((day) => {
          const isToday = day.date === todayStr;
          const hasMenu = day.menu.length > 0;
          return (
            <div
              key={day.date}
              style={{
                ...styles.dayCard,
                borderLeft: `4px solid ${isToday ? palette.color : 'var(--border-subtle)'}`,
                background: isToday ? `${palette.color}10` : 'var(--bg-secondary)',
              }}
            >
              <div style={styles.dayHeader}>
                <div style={styles.dayDate}>
                  {isToday && <span style={{ ...styles.todayBadge, background: palette.color }}>오늘</span>}
                  <span style={{ ...styles.dayLabel, color: day.weekday === '일' ? '#EF4444' : day.weekday === '토' ? '#3B82F6' : 'var(--text-primary)' }}>
                    {format(parseISO(day.date), 'M/d', { locale: ko })} ({day.weekday})
                  </span>
                </div>
                {day.calorie && (
                  <span style={styles.calorie}>🔥 {day.calorie}</span>
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
    flexShrink: 0, background: 'rgba(128,128,128,0.05)',
  },
  backBtn: {
    background: 'rgba(74, 144, 226, 0.15)',
    border: '1px solid rgba(74, 144, 226, 0.3)',
    cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
    fontSize: 12, fontWeight: 600, color: 'var(--accent)',
  },
  label: { flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, padding: '4px 6px', borderRadius: 6,
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
    fontSize: 12,
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
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  weekInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  weekRange: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' },
  todayLink: {
    fontSize: 10, fontWeight: 500,
    border: 'none', background: 'transparent',
    color: 'var(--accent)', cursor: 'pointer',
    padding: 0,
  },
  content: { flex: 1, overflow: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  empty: { textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 },
  error: {
    margin: 8, padding: 12, borderRadius: 8,
    background: 'rgba(239,68,68,0.1)', color: '#EF4444',
    fontSize: 12, textAlign: 'center',
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
  dayLabel: { fontSize: 13, fontWeight: 700 },
  todayBadge: {
    fontSize: 9, fontWeight: 800,
    padding: '1px 6px', borderRadius: 8,
    color: '#fff',
  },
  calorie: {
    fontSize: 11, fontWeight: 600,
    color: 'var(--text-muted)',
    background: 'rgba(245, 158, 11, 0.1)',
    padding: '2px 8px',
    borderRadius: 12,
  },
  menuList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  menuItem: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-primary)',
    background: 'var(--bg-primary)',
    padding: '3px 8px',
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
  },
  noMeal: {
    margin: 0, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' as const,
  },
};

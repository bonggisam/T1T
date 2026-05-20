import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';

const SCHOOL_OPTIONS: { key: School; label: string; icon: string; color: string }[] = [
  { key: 'taeseong_middle', label: '태성중', icon: '🏫', color: '#10B981' },
  { key: 'taeseong_high', label: '태성고', icon: '🎓', color: '#8B5CF6' },
];

interface SchoolScheduleItem {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  title: string;
  seq: string;
}

interface ScheduleViewProps {
  onBack: () => void;
}

/**
 * 학사일정 — 학교 홈페이지를 스크래핑해서 캘린더 형식으로 표시.
 * 양교 토글, 월별 분류, 날짜순 정렬.
 */
export function ScheduleView({ onBack }: ScheduleViewProps) {
  const { user } = useAuthStore();
  const defaultSchool: School = (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high')
    ? user.school : 'taeseong_middle';
  const [selectedSchool, setSelectedSchool] = useState<School>(defaultSchool);
  const [events, setEvents] = useState<SchoolScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palette = SCHOOL_OPTIONS.find((s) => s.key === selectedSchool)!;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI?.schoolFetchSchedule(selectedSchool);
      if (!res) throw new Error('응답 없음');
      setEvents(res.events);
    } catch (err: any) {
      console.error('[Schedule] fetch failed:', err);
      setError(err?.message || '학사일정을 가져올 수 없습니다');
      setEvents([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchool]);

  // 월별 그룹화
  const grouped = useMemo(() => {
    const map = new Map<string, SchoolScheduleItem[]>();
    for (const ev of events) {
      const month = ev.startDate.slice(0, 7); // YYYY-MM
      if (!map.has(month)) map.set(month, []);
      map.get(month)!.push(ev);
    }
    // 각 월 내부 정렬
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startDate.localeCompare(b.startDate));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  // 오늘 기준 가까운 일정만 강조
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기">
          📅 캘린더
        </button>
        <span style={styles.label}>📚 학사일정</span>
        <button onClick={load} style={styles.iconBtn} title="새로고침" aria-label="새로고침" disabled={loading}>
          🔄
        </button>
      </div>

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

      <div style={styles.content}>
        {loading && (
          <div style={styles.empty}>
            <div className="spinner" />
            <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>학사일정 불러오는 중...</p>
          </div>
        )}
        {!loading && error && (
          <div style={styles.error}>
            ⚠️ {error}
          </div>
        )}
        {!loading && !error && events.length === 0 && (
          <div style={styles.empty}>📭 학사일정이 없습니다</div>
        )}
        {!loading && !error && grouped.map(([month, items]) => {
          const [year, monthNum] = month.split('-');
          return (
            <div key={month} style={styles.monthSection}>
              <div style={{ ...styles.monthHeader, color: palette.color }}>
                {year}년 {parseInt(monthNum)}월
                <span style={styles.monthCount}>{items.length}개</span>
              </div>
              <div style={styles.eventList}>
                {items.map((ev) => {
                  const isToday = ev.startDate === today;
                  const start = parseISO(ev.startDate);
                  const end = parseISO(ev.endDate);
                  const sameDay = isSameDay(start, end);
                  const dateLabel = sameDay
                    ? format(start, 'M/d (EEE)', { locale: ko })
                    : `${format(start, 'M/d (EEE)', { locale: ko })} ~ ${format(end, 'M/d (EEE)', { locale: ko })}`;
                  return (
                    <div
                      key={ev.seq}
                      style={{
                        ...styles.eventRow,
                        borderLeft: `4px solid ${palette.color}`,
                        background: isToday ? `${palette.color}15` : 'var(--bg-secondary)',
                      }}
                    >
                      <div style={styles.eventDate}>
                        {isToday && <span style={{ ...styles.todayBadge, background: palette.color }}>오늘</span>}
                        {dateLabel}
                      </div>
                      <div style={styles.eventTitle}>{ev.title}</div>
                    </div>
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
  content: { flex: 1, overflow: 'auto', padding: '8px 12px' },
  empty: { textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 },
  error: {
    margin: 8, padding: 12, borderRadius: 8,
    background: 'rgba(239,68,68,0.1)', color: '#EF4444',
    fontSize: 12, textAlign: 'center',
  },
  monthSection: { marginBottom: 16 },
  monthHeader: {
    fontSize: 14, fontWeight: 700,
    padding: '6px 4px',
    borderBottom: '2px solid currentColor',
    marginBottom: 6,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  monthCount: { fontSize: 11, fontWeight: 500, opacity: 0.7 },
  eventList: { display: 'flex', flexDirection: 'column', gap: 4 },
  eventRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 10px', borderRadius: 6,
    fontSize: 12,
  },
  eventDate: {
    fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)',
    minWidth: 130,
    fontVariantNumeric: 'tabular-nums' as any,
    display: 'flex', alignItems: 'center', gap: 6,
  },
  todayBadge: {
    fontSize: 9, fontWeight: 800,
    padding: '1px 6px', borderRadius: 8,
    color: '#fff',
  },
  eventTitle: {
    flex: 1, fontSize: 13, fontWeight: 600,
    color: 'var(--text-primary)',
  },
};

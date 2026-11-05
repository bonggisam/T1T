import React, { useMemo } from 'react';
import { startOfMonth, endOfMonth, isWithinInterval, format } from 'date-fns';
import { useCalendarStore } from '../../store/calendarStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import type { EventCategory } from '@shared/types';
import { Ic, type IconName } from '../common/Ic';

const CATEGORY_META: Record<EventCategory, { label: string; color: string; icon: IconName }> = {
  event: { label: '행사', color: '#4A90E2', icon: 'party' },
  meeting: { label: '회의', color: '#F59E0B', icon: 'briefcase' },
  deadline: { label: '마감일', color: '#EF4444', icon: 'clock' },
  notice: { label: '공지', color: '#10B981', icon: 'megaphone' },
  other: { label: '기타', color: '#8B5CF6', icon: 'pin' },
};

export function StatsView() {
  const { currentMonth } = useCalendarStore();
  const events = useVisibleEvents();

  const stats = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthEvents = events.filter((e) => {
      const start = new Date(e.startDate);
      return isWithinInterval(start, { start: monthStart, end: monthEnd });
    });

    // 카테고리별 개수
    const byCategory: Record<string, number> = {};
    for (const e of monthEvents) byCategory[e.category] = (byCategory[e.category] || 0) + 1;

    // 교사별 개수
    const byTeacher: Record<string, { name: string; color: string; count: number }> = {};
    for (const e of monthEvents) {
      if (!e.adminName) continue;
      const key = e.createdBy;
      if (!byTeacher[key]) byTeacher[key] = { name: e.adminName, color: e.adminColor, count: 0 };
      byTeacher[key].count++;
    }

    // 주차별 (요일별?) 분포
    const byDay = new Array(7).fill(0);
    for (const e of monthEvents) byDay[new Date(e.startDate).getDay()]++;

    // 가장 바쁜 날
    const byDate: Record<string, number> = {};
    for (const e of monthEvents) {
      const key = format(new Date(e.startDate), 'M/d');
      byDate[key] = (byDate[key] || 0) + 1;
    }
    const busiestDay = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];

    return {
      total: monthEvents.length,
      byCategory,
      byTeacher: Object.values(byTeacher).sort((a, b) => b.count - a.count),
      byDay,
      busiestDay,
    };
  }, [events, currentMonth]);

  const maxCategory = Math.max(...Object.values(stats.byCategory), 1);
  const maxDay = Math.max(...stats.byDay, 1);

  return (
    <div style={styles.container}>
      <div style={styles.monthTitle}>
        <Ic name="chart" />{format(currentMonth, 'yyyy년 M월')} 통계
      </div>

      {/* 총 일정 */}
      <div style={styles.statsCards}>
        <StatCard label="총 일정" value={stats.total.toString()} icon="calendar" />
        <StatCard
          label="가장 바쁜 날"
          value={stats.busiestDay && stats.busiestDay[0] ? `${stats.busiestDay[0]} (${stats.busiestDay[1]}건)` : '-'}
          icon="flame"
        />
      </div>

      {/* 카테고리별 */}
      <section style={styles.section}>
        <h4 style={styles.sectionTitle}><Ic name="folder" />카테고리별</h4>
        {(Object.keys(CATEGORY_META) as EventCategory[]).map((cat) => {
          const count = stats.byCategory[cat] || 0;
          const meta = CATEGORY_META[cat];
          return (
            <div key={cat} style={styles.barRow}>
              <span style={styles.barLabel}><Ic name={meta.icon} />{meta.label}</span>
              <div style={styles.barTrack}>
                <div style={{
                  ...styles.barFill,
                  width: `${(count / maxCategory) * 100}%`,
                  background: meta.color,
                }} />
              </div>
              <span style={styles.barValue}>{count}</span>
            </div>
          );
        })}
      </section>

      {/* 교사별 */}
      {stats.byTeacher.length > 0 && (
        <section style={styles.section}>
          <h4 style={styles.sectionTitle}><Ic name="users" />작성자별 TOP 10</h4>
          {stats.byTeacher.slice(0, 10).map((t, i) => {
            const max = stats.byTeacher[0].count;
            return (
              <div key={i} style={styles.barRow}>
                <span style={styles.barLabel}>
                  <span style={{ ...styles.colorDot, background: t.color }} />
                  {t.name}
                </span>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${(t.count / max) * 100}%`, background: t.color }} />
                </div>
                <span style={styles.barValue}>{t.count}</span>
              </div>
            );
          })}
        </section>
      )}

      {/* 요일별 */}
      <section style={styles.section}>
        <h4 style={styles.sectionTitle}><Ic name="calendarDays" />요일별 분포</h4>
        <div style={styles.weekGrid}>
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => {
            const count = stats.byDay[i];
            return (
              <div key={i} style={styles.dayCol}>
                <div style={styles.dayBar}>
                  <div style={{
                    ...styles.dayBarFill,
                    height: `${(count / maxDay) * 100}%`,
                    background: i === 0 ? 'var(--weekend-text)' : i === 6 ? 'var(--saturday-text)' : 'var(--accent)',
                  }} />
                </div>
                <span style={styles.dayLabel}>{d}</span>
                <span style={styles.dayCount}>{count}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statIcon}><Ic name={icon} gap={false} /></span>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', overflow: 'auto', padding: 8 },
  monthTitle: { fontSize: 'var(--fs-lead)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 },
  statsCards: { display: 'flex', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 4,
    padding: 12, borderRadius: 10,
    background: 'var(--bg-secondary)',
  },
  statIcon: { fontSize: 'var(--fs-heading)', lineHeight: 1 },
  statLabel: { fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' },
  statValue: { fontSize: 'var(--fs-lead)', fontWeight: 700, color: 'var(--text-primary)' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 },
  barRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '3px 0',
  },
  barLabel: {
    fontSize: 'var(--fs-label)', color: 'var(--text-primary)',
    minWidth: 70, display: 'flex', alignItems: 'center', gap: 4,
  },
  colorDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  barTrack: {
    flex: 1, height: 8, borderRadius: 4,
    background: 'var(--tint-neutral-strong)', overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.3s' },
  barValue: { fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--text-secondary)', minWidth: 24, textAlign: 'right' },
  weekGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, height: 100, alignItems: 'end' },
  dayCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  dayBar: {
    width: '100%', height: 60, borderRadius: 4,
    background: 'var(--tint-neutral-strong)',
    display: 'flex', alignItems: 'flex-end',
    overflow: 'hidden',
  },
  dayBarFill: { width: '100%', transition: 'height 0.3s' },
  dayLabel: { fontSize: 'var(--fs-caption)', color: 'var(--text-secondary)', fontWeight: 600 },
  dayCount: { fontSize: 'var(--fs-tiny)', color: 'var(--text-muted)' },
};

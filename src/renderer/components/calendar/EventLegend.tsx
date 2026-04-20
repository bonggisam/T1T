import React, { useMemo } from 'react';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';

interface TeacherColor {
  id: string;
  name: string;
  color: string;
}

export function EventLegend() {
  const events = useVisibleEvents();

  // 일정에서 고유 교사별 색상 추출
  const teachers = useMemo<TeacherColor[]>(() => {
    const map = new Map<string, TeacherColor>();
    for (const event of events) {
      if (event.adminName && event.adminColor && !map.has(event.createdBy)) {
        map.set(event.createdBy, {
          id: event.createdBy,
          name: event.adminName,
          color: event.adminColor,
        });
      }
    }
    return Array.from(map.values());
  }, [events]);

  if (teachers.length === 0) return null;

  return (
    <div style={styles.container}>
      <span style={styles.legendTitle}>범례</span>
      {teachers.map((t) => (
        <div key={t.id} style={styles.item}>
          <span style={{ ...styles.dot, background: t.color }} />
          <span style={styles.label}>{t.name}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '6px 12px',
    borderTop: '1px solid var(--border-subtle)',
    flexShrink: 0,
    alignItems: 'center',
  },
  legendTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--text-muted)',
    marginRight: 2,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    color: 'var(--text-secondary)',
  },
};

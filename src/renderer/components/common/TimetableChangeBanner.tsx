import React, { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useComciganStore } from '../../store/comciganStore';
import { formatTimetableChange } from '../../utils/classPeriods';

/**
 * 확인하지 않은 내 수업 변경. 토스트는 금방 사라지므로, 확인할 때까지 어느 화면에서나 남겨 둔다.
 */
export function TimetableChangeBanner() {
  const changes = useComciganStore((s) => s.changes);
  const acknowledge = useComciganStore((s) => s.acknowledgeChanges);
  const [open, setOpen] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const upcoming = changes.filter((c) => c.date >= today);
  if (upcoming.length === 0) return null;

  const lines = upcoming.map(formatTimetableChange);
  const many = upcoming.length > 1;

  return (
    <div role="status" style={styles.banner}>
      <div style={styles.row}>
        <RefreshCw size={12} strokeWidth={2.4} style={{ flexShrink: 0 }} />
        <span style={styles.summary} title={lines.join('\n')}>
          {many ? `내 수업 변경 ${upcoming.length}건` : `내 수업 변경 · ${lines[0]}`}
        </span>
        {many && (
          <button
            onClick={() => setOpen((v) => !v)}
            style={styles.iconButton}
            aria-expanded={open}
            aria-label={open ? '변경 목록 접기' : '변경 목록 펴기'}
          >
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
        <button onClick={acknowledge} style={styles.button}>확인</button>
      </div>
      {many && open && (
        <ul style={styles.list}>
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    flexShrink: 0,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    background: 'var(--accent)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  summary: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iconButton: {
    flexShrink: 0,
    display: 'flex',
    padding: 1,
    color: '#fff',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  button: {
    flexShrink: 0,
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--accent)',
    background: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  list: {
    margin: '3px 0 2px',
    padding: '0 0 0 18px',
    maxHeight: 96,
    overflowY: 'auto',
    fontWeight: 500,
  },
};

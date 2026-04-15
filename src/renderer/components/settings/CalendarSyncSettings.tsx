import React, { useState } from 'react';
import {
  isGoogleConnected,
  connectGoogle,
  disconnectGoogle,
} from '../../utils/calendarSync';
import { usePersonalEventStore } from '../../store/personalEventStore';

interface CalendarSyncSettingsProps {
  syncInterval: number;
  onSyncIntervalChange: (minutes: number) => void;
}

const SYNC_INTERVALS = [
  { value: 1, label: '1분' },
  { value: 5, label: '5분' },
  { value: 15, label: '15분' },
  { value: 30, label: '30분' },
];

export function CalendarSyncSettings({ syncInterval, onSyncIntervalChange }: CalendarSyncSettingsProps) {
  const [googleConnected, setGoogleConnected] = useState(isGoogleConnected());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const { syncExternalCalendars } = usePersonalEventStore();

  async function handleGoogleConnect() {
    setConnecting(true);
    setError('');
    try {
      const ok = await connectGoogle();
      setGoogleConnected(ok);
      if (ok) {
        syncExternalCalendars();
      } else {
        setError('Google 연동 실패. Client ID가 설정되지 않았을 수 있습니다.');
      }
    } catch (err: any) {
      setError(err?.message || '연동 중 오류 발생');
    }
    setConnecting(false);
  }

  function handleGoogleDisconnect() {
    disconnectGoogle();
    setGoogleConnected(false);
  }

  return (
    <div style={styles.container}>
      {/* Google Calendar */}
      <div style={styles.providerRow}>
        <div style={styles.providerInfo}>
          <span style={styles.providerIcon}>📅</span>
          <span style={styles.providerName}>Google Calendar</span>
        </div>
        <div style={styles.providerActions}>
          {googleConnected ? (
            <>
              <span style={styles.connectedBadge}>연동됨</span>
              <button onClick={handleGoogleDisconnect} style={styles.disconnectBtn}>해제</button>
            </>
          ) : (
            <button
              onClick={handleGoogleConnect}
              disabled={connecting}
              style={styles.connectBtn}
            >
              {connecting ? '연결 중...' : '연동'}
            </button>
          )}
        </div>
      </div>

      {/* Upcoming providers */}
      {['🍎 Apple Calendar', '📧 Outlook'].map((name) => (
        <div key={name} style={styles.providerRow}>
          <div style={styles.providerInfo}>
            <span style={styles.providerName}>{name}</span>
          </div>
          <span style={styles.comingSoon}>준비 중</span>
        </div>
      ))}

      {error && <p style={styles.error}>{error}</p>}

      {/* Sync interval */}
      <div style={styles.syncRow}>
        <span style={styles.label}>🔄 동기화 주기</span>
        <select
          value={syncInterval}
          onChange={(e) => onSyncIntervalChange(Number(e.target.value))}
          style={styles.select}
        >
          {SYNC_INTERVALS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  providerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    background: 'var(--bg-secondary)',
    borderRadius: 8,
  },
  providerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  providerIcon: {
    fontSize: 16,
  },
  providerName: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  providerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  connectedBadge: {
    fontSize: 10,
    color: 'var(--success)',
    fontWeight: 600,
  },
  connectBtn: {
    padding: '3px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid var(--accent)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--accent)',
    cursor: 'pointer',
  },
  disconnectBtn: {
    padding: '3px 10px',
    fontSize: 11,
    border: '1px solid var(--danger)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
  },
  comingSoon: {
    fontSize: 10,
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  error: {
    fontSize: 10,
    color: 'var(--danger)',
    margin: 0,
  },
  syncRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  select: {
    padding: '4px 8px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
};

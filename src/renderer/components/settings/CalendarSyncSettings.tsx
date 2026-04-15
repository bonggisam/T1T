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

interface ProviderConfig {
  key: string;
  name: string;
  icon: string;
  connected: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  available: boolean;
}

export function CalendarSyncSettings({ syncInterval, onSyncIntervalChange }: CalendarSyncSettingsProps) {
  const [googleConnected, setGoogleConnected] = useState(isGoogleConnected());
  const [connecting, setConnecting] = useState<string | null>(null);
  const { syncExternalCalendars } = usePersonalEventStore();

  const providers: ProviderConfig[] = [
    {
      key: 'google',
      name: 'Google Calendar',
      icon: '📅',
      connected: googleConnected,
      onConnect: async () => {
        setConnecting('google');
        const ok = await connectGoogle();
        setGoogleConnected(ok);
        if (ok) syncExternalCalendars();
        setConnecting(null);
      },
      onDisconnect: () => {
        disconnectGoogle();
        setGoogleConnected(false);
      },
      available: true,
    },
    {
      key: 'apple',
      name: 'Apple Calendar',
      icon: '🍎',
      connected: false,
      onConnect: async () => {},
      onDisconnect: () => {},
      available: false,
    },
    {
      key: 'notion',
      name: 'Notion Calendar',
      icon: '📝',
      connected: false,
      onConnect: async () => {},
      onDisconnect: () => {},
      available: false,
    },
    {
      key: 'outlook',
      name: 'Outlook Calendar',
      icon: '📧',
      connected: false,
      onConnect: async () => {},
      onDisconnect: () => {},
      available: false,
    },
  ];

  return (
    <div style={styles.container}>
      {providers.map((p) => (
        <div key={p.key} style={styles.providerRow}>
          <div style={styles.providerInfo}>
            <span style={styles.providerIcon}>{p.icon}</span>
            <span style={styles.providerName}>{p.name}</span>
          </div>
          <div style={styles.providerActions}>
            {p.connected ? (
              <>
                <span style={styles.connectedBadge}>연동됨</span>
                <button onClick={p.onDisconnect} style={styles.disconnectBtn}>해제</button>
              </>
            ) : (
              <button
                onClick={p.onConnect}
                disabled={!p.available || connecting === p.key}
                style={{
                  ...styles.connectBtn,
                  opacity: p.available ? 1 : 0.5,
                }}
              >
                {connecting === p.key ? '연결 중...' : p.available ? '연동' : '준비 중'}
              </button>
            )}
          </div>
        </div>
      ))}

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

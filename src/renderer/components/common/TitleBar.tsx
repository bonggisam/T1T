import React from 'react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';

interface TitleBarProps {
  onToggleSettings: () => void;
  onToggleAdmin: () => void;
  showSettingsBtn: boolean;
  showAdminBtn: boolean;
}

export function TitleBar({ onToggleSettings, onToggleAdmin, showSettingsBtn, showAdminBtn }: TitleBarProps) {
  const { user, logout } = useAuthStore();
  const { unreadCount, setShowPanel, showPanel } = useNotificationStore();

  return (
    <div className="titlebar" style={styles.container}>
      <div style={styles.left}>
        <span style={styles.logo}>📅</span>
        <span style={styles.title}>ToneT</span>
      </div>
      <div style={styles.right}>
        {showSettingsBtn && user && (
          <>
            {showAdminBtn && (
              <button onClick={onToggleAdmin} style={styles.btn} title="관리자">
                👥
              </button>
            )}
            <button
              onClick={() => setShowPanel(!showPanel)}
              style={styles.btn}
              title="알림"
            >
              🔔
              {unreadCount > 0 && (
                <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            <button onClick={onToggleSettings} style={styles.btn} title="설정">
              ⚙️
            </button>
          </>
        )}
        <button
          onClick={() => window.electronAPI?.minimize()}
          style={styles.btn}
          title="최소화"
        >
          ─
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          style={{ ...styles.btn, ...styles.closeBtn }}
          title="종료"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  logo: {
    fontSize: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  btn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    fontSize: 13,
    color: 'var(--text-secondary)',
    position: 'relative' as const,
    transition: 'background 0.15s',
  },
  closeBtn: {
    color: 'var(--danger)',
  },
  badge: {
    position: 'absolute' as const,
    top: 0,
    right: 2,
    background: '#E74C3C',
    color: '#fff',
    fontSize: 9,
    fontWeight: 700,
    borderRadius: '50%',
    width: 14,
    height: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
};

import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { useAuthStore } from '../../store/authStore';
import { CalendarSyncSettings } from './CalendarSyncSettings';

interface SettingsPanelProps {
  onClose: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}

const COLOR_PRESETS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA',
  '#F97316', '#EC4899', '#14B8A6', '#6366F1',
  '#EF4444', '#3B82F6', '#10B981', '#8B5CF6',
];

export function SettingsPanel({ onClose, theme, setTheme }: SettingsPanelProps) {
  const { user, logout } = useAuthStore();
  const [transparency, setTransparency] = useState(user?.settings.transparency ?? 80);
  const [alwaysOnTop, setAlwaysOnTop] = useState(user?.settings.alwaysOnTop ?? true);
  const [clickThrough, setClickThrough] = useState(user?.settings.clickThrough ?? false);
  const [notifSound, setNotifSound] = useState(user?.settings.notificationSound ?? true);
  const [notifBadge, setNotifBadge] = useState(user?.settings.notificationBadge ?? true);
  const [profileColor, setProfileColor] = useState(user?.profileColor || '#4A90E2');
  const [syncInterval, setSyncInterval] = useState(user?.settings.syncInterval ?? 15);
  const [appVersion, setAppVersion] = useState('1.0.0');

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  React.useEffect(() => {
    window.electronAPI?.getAppVersion().then((v) => setAppVersion(v)).catch(() => {});
  }, []);

  function handleTransparency(value: number) {
    setTransparency(value);
    window.electronAPI?.setOpacity(value / 100);
  }

  function handleAlwaysOnTop(value: boolean) {
    setAlwaysOnTop(value);
    window.electronAPI?.toggleAlwaysOnTop(value);
  }

  function handleClickThrough(value: boolean) {
    setClickThrough(value);
    window.electronAPI?.toggleClickThrough(value);
  }

  async function handleSave() {
    if (!user) return;
    const updates: any = {
      'settings.transparency': transparency,
      'settings.alwaysOnTop': alwaysOnTop,
      'settings.clickThrough': clickThrough,
      'settings.notificationSound': notifSound,
      'settings.notificationBadge': notifBadge,
      'settings.theme': theme,
      'settings.syncInterval': syncInterval,
    };
    if (isAdmin) {
      updates.profileColor = profileColor;
    }
    await updateDoc(doc(db, 'users', user.id), updates);
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>⚙️ 설정</h3>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      <div style={styles.sections}>
        {/* Profile section */}
        <Section title="👤 내 프로필">
          <div style={styles.infoRow}>
            <span style={styles.label}>이름</span>
            <span style={styles.value}>{user?.name}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>이메일</span>
            <span style={styles.value}>{user?.email}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>역할</span>
            <span style={styles.value}>
              {user?.role === 'super_admin' ? '슈퍼관리자' : user?.role === 'admin' ? '관리자' : '교사'}
            </span>
          </div>
          {isAdmin && (
            <div>
              <span style={styles.label}>프로필 색상</span>
              <div style={styles.colorGrid}>
                {COLOR_PRESETS.map((c) => (
                  <div
                    key={c}
                    onClick={() => setProfileColor(c)}
                    style={{
                      ...styles.colorSwatch,
                      background: c,
                      outline: profileColor === c ? '2px solid var(--text-primary)' : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Display section */}
        <Section title="🎨 화면 설정">
          <div style={styles.settingRow}>
            <span style={styles.label}>투명도: {transparency}%</span>
            <input
              type="range"
              min={10}
              max={100}
              value={transparency}
              onChange={(e) => handleTransparency(Number(e.target.value))}
              style={styles.slider}
            />
          </div>
          <ToggleRow label="항상 위 표시" value={alwaysOnTop} onChange={handleAlwaysOnTop} />
          <ToggleRow label="클릭 통과 모드" value={clickThrough} onChange={handleClickThrough} />
          <div style={styles.settingRow}>
            <span style={styles.label}>테마</span>
            <div style={styles.themeToggle}>
              <button
                onClick={() => setTheme('light')}
                style={{ ...styles.themeBtn, ...(theme === 'light' ? styles.themeBtnActive : {}) }}
              >☀️ 라이트</button>
              <button
                onClick={() => setTheme('dark')}
                style={{ ...styles.themeBtn, ...(theme === 'dark' ? styles.themeBtnActive : {}) }}
              >🌙 다크</button>
            </div>
          </div>
        </Section>

        {/* Notification section */}
        <Section title="🔔 알림 설정">
          <ToggleRow label="알림음" value={notifSound} onChange={setNotifSound} />
          <ToggleRow label="NEW 배지 표시" value={notifBadge} onChange={setNotifBadge} />
        </Section>

        {/* Calendar Sync */}
        <Section title="📅 캘린더 연동">
          <CalendarSyncSettings
            syncInterval={syncInterval}
            onSyncIntervalChange={setSyncInterval}
          />
        </Section>

        {/* Info */}
        <Section title="ℹ️ 정보">
          <div style={styles.infoRow}>
            <span style={styles.label}>버전</span>
            <span style={styles.value}>v{appVersion}</span>
          </div>
          <div style={styles.settingRow}>
            <span style={styles.label}>업데이트 확인</span>
            <button
              onClick={() => window.electronAPI?.updaterCheck()}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              확인
            </button>
          </div>
        </Section>
      </div>

      <div style={styles.footer}>
        <button onClick={handleSave} style={styles.saveBtn}>설정 저장</button>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyles.container}>
      <h4 style={sectionStyles.title}>{title}</h4>
      <div style={sectionStyles.content}>{children}</div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={styles.settingRow}>
      <span style={styles.label}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          ...styles.toggleBtn,
          background: value ? 'var(--accent)' : 'var(--bg-secondary)',
        }}
      >
        <span style={{
          ...styles.toggleDot,
          transform: value ? 'translateX(16px)' : 'translateX(0)',
        }} />
      </button>
    </div>
  );
}

const sectionStyles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingLeft: 4,
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '0 12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--text-muted)',
  },
  sections: {
    flex: 1,
    overflow: 'auto',
    paddingBottom: 10,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  value: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  slider: {
    width: 120,
    accentColor: 'var(--accent)',
  },
  toggleBtn: {
    width: 36,
    height: 20,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s',
    padding: 0,
  },
  toggleDot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute' as const,
    top: 2,
    left: 2,
    transition: 'transform 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  themeToggle: {
    display: 'flex',
    gap: 4,
  },
  themeBtn: {
    padding: '3px 10px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  themeBtnActive: {
    background: 'var(--accent)',
    color: '#fff',
    borderColor: 'var(--accent)',
  },
  colorGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'transform 0.12s',
  },
  footer: {
    display: 'flex',
    gap: 8,
    padding: '10px 0',
    borderTop: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  saveBtn: {
    flex: 1,
    padding: '8px',
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
  },
  logoutBtn: {
    padding: '8px 16px',
    fontSize: 13,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};

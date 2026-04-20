import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useComciganStore } from '../../store/comciganStore';
import { SCHOOL_LABELS } from '@shared/types';

interface TitleBarProps {
  onToggleSettings: () => void;
  onToggleAdmin: () => void;
  showSettingsBtn: boolean;
  showAdminBtn: boolean;
  onToggleTPass?: () => void;
  showTPass?: boolean;
  onToggleTodos?: () => void;
  showTodos?: boolean;
  onToggleReserv?: () => void;
  showReserv?: boolean;
  onToggleMeal?: () => void;
  showMeal?: boolean;
}

export function TitleBar({
  onToggleSettings, onToggleAdmin, showSettingsBtn, showAdminBtn,
  onToggleTPass, showTPass,
  onToggleTodos, showTodos,
  onToggleReserv, showReserv,
  onToggleMeal, showMeal,
}: TitleBarProps) {
  const { user } = useAuthStore();
  const { unreadCount, setShowPanel, showPanel } = useNotificationStore();
  const { showTimetable, toggleTimetable } = useComciganStore();
  const [widgetMode, setWidgetMode] = useState(true);

  useEffect(() => {
    window.electronAPI?.getWidgetMode().then((v) => setWidgetMode(v)).catch(() => {});
    const unsub = window.electronAPI?.onWidgetModeChanged((enabled) => {
      setWidgetMode(enabled);
    });
    return () => unsub?.();
  }, []);

  function handleToggleWidget() {
    const next = !widgetMode;
    setWidgetMode(next);
    window.electronAPI?.setWidgetMode(next);
  }

  // Widget mode: minimal edit-only bar
  if (widgetMode) {
    return (
      <div className="titlebar" style={styles.widgetBar}>
        <span style={styles.widgetTitle}>ToneT</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconBtn icon="📚" active={showTimetable} onClick={toggleTimetable} title={showTimetable ? '시간표 숨기기' : '시간표 보기'} compact />
          <button onClick={handleToggleWidget} style={styles.editBtn} title="편집 모드 (Ctrl+Shift+C)">
            ✏️ 편집
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="titlebar" style={styles.container}>
      <div style={styles.left}>
        <span style={styles.logo}>📅</span>
        <span style={styles.title}>ToneT</span>
        {user && (
          <span style={{
            ...styles.schoolPill,
            background: user.school === 'taeseong_high' ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)',
            color: user.school === 'taeseong_high' ? '#8B5CF6' : '#10B981',
          }}>
            {user.school === 'taeseong_high' ? '🎓 태성고' : '🏫 태성중'}
          </span>
        )}
      </div>

      <div style={styles.right}>
        {showSettingsBtn && user && (
          <>
            {onToggleTodos && (
              <IconBtn icon="✅" active={showTodos} onClick={onToggleTodos} title={showTodos ? '캘린더로' : '할 일'} />
            )}
            {onToggleReserv && (
              <IconBtn icon="🏢" active={showReserv} onClick={onToggleReserv} title={showReserv ? '캘린더로' : '회의실 예약'} />
            )}
            {onToggleMeal && (
              <IconBtn icon="🍱" active={showMeal} onClick={onToggleMeal} title={showMeal ? '캘린더로' : '급식 메뉴'} />
            )}
            {onToggleTPass && (
              <button
                onClick={onToggleTPass}
                style={{ ...styles.iconBtn, background: showTPass ? 'var(--bg-hover)' : 'transparent' }}
                title={showTPass ? '캘린더로' : 'TPass 출결'}
              >
                <span style={styles.tpassIcon}>T</span>
              </button>
            )}
            <div style={styles.divider} />
            <IconBtn icon="📚" active={showTimetable} onClick={toggleTimetable} title={showTimetable ? '시간표 숨기기' : '시간표 보기'} />
            <button
              onClick={() => setShowPanel(!showPanel)}
              style={{ ...styles.iconBtn, background: showPanel ? 'var(--bg-hover)' : 'transparent', position: 'relative' }}
              title="알림"
            >
              <span style={styles.iconText}>🔔</span>
              {unreadCount > 0 && (
                <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showAdminBtn && (
              <IconBtn icon="👥" onClick={onToggleAdmin} title="관리자" />
            )}
            <IconBtn icon="⚙️" onClick={onToggleSettings} title="설정" />
            <div style={styles.divider} />
          </>
        )}
        <IconBtn icon="📌" onClick={handleToggleWidget} title="위젯 모드 (바탕 고정)" accent />
        <IconBtn icon="─" onClick={() => window.electronAPI?.minimize()} title="최소화" />
        <button
          onClick={() => window.electronAPI?.close()}
          style={{ ...styles.iconBtn, ...styles.closeBtn }}
          title="종료"
        >
          <span style={styles.iconText}>✕</span>
        </button>
      </div>
    </div>
  );
}

interface IconBtnProps {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  compact?: boolean;
}

function IconBtn({ icon, title, onClick, active, accent, compact }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{
        ...(compact ? styles.iconBtnCompact : styles.iconBtn),
        background: active ? 'var(--bg-hover)' : 'transparent',
        color: accent ? 'var(--accent)' : 'var(--text-secondary)',
        opacity: active === false ? 0.5 : 1,
      }}
      title={title}
    >
      <span style={compact ? styles.iconTextCompact : styles.iconText}>{icon}</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
    minHeight: 44,
  },
  widgetBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    flexShrink: 0,
    opacity: 0,
    transition: 'opacity 0.3s',
    borderBottom: '1px solid var(--grid-line)',
    background: 'rgba(128,128,128,0.08)',
  },
  widgetTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: 1,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 20,
    lineHeight: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: 0.2,
  },
  schoolPill: {
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 10,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 18,
    background: 'var(--border-subtle)',
    margin: '0 4px',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 9px',
    borderRadius: 8,
    color: 'var(--text-secondary)',
    transition: 'all 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    height: 32,
  },
  iconBtnCompact: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 6,
    color: 'var(--text-secondary)',
    transition: 'all 0.15s',
  },
  iconText: {
    fontSize: 16,
    lineHeight: 1,
  },
  iconTextCompact: {
    fontSize: 13,
    lineHeight: 1,
  },
  tpassIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 5,
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
    fontFamily: 'Arial, sans-serif',
  },
  editBtn: {
    background: 'rgba(74, 144, 226, 0.15)',
    border: '1px solid rgba(74, 144, 226, 0.3)',
    cursor: 'pointer',
    padding: '5px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--accent)',
  },
  closeBtn: {
    color: 'var(--danger)',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    background: '#E74C3C',
    color: '#fff',
    fontSize: 9,
    fontWeight: 700,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
};

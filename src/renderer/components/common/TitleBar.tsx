import React, { useState, useEffect } from 'react';
import {
  Calendar, CheckSquare, Building2, UtensilsCrossed, BookOpen,
  Bell, Users, Settings, Sun, Moon, Pin, Minus, X,
  GraduationCap, School as SchoolIcon, Pencil,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useComciganStore } from '../../store/comciganStore';
import { useUIStore } from '../../store/uiStore';
import { SCHOOL_LABELS } from '@shared/types';
import type { School } from '@shared/types';

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
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onGoHome?: () => void; // 메인 달력으로 복귀
}

export function TitleBar({
  onToggleSettings, onToggleAdmin, showSettingsBtn, showAdminBtn,
  onToggleTPass, showTPass,
  onToggleTodos, showTodos,
  onToggleReserv, showReserv,
  onToggleMeal, showMeal,
  theme, onToggleTheme,
  onGoHome,
}: TitleBarProps) {
  const { user } = useAuthStore();
  const { unreadCount, setShowPanel, showPanel } = useNotificationStore();
  const { showTimetable, toggleTimetable } = useComciganStore();
  const { viewingSchool, setViewingSchool } = useUIStore();
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

  // Widget mode: 미니멀이지만 필수 탭 버튼은 포함
  if (widgetMode) {
    return (
      <div className="titlebar" style={styles.widgetBar}>
        <button onClick={onGoHome} style={styles.widgetTitleBtn} title="메인 달력으로">
          <Calendar size={12} strokeWidth={2.2} style={{ marginRight: 3, verticalAlign: '-1px', color: 'var(--accent)' }} />
          ToneT
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {user && onToggleTodos && (
            <IconBtn Icon={CheckSquare} active={showTodos} onClick={onToggleTodos} title={showTodos ? '캘린더로' : '할 일'} compact />
          )}
          {user && onToggleReserv && (
            <IconBtn Icon={Building2} active={showReserv} onClick={onToggleReserv} title={showReserv ? '캘린더로' : '회의실 예약'} compact />
          )}
          {user && onToggleMeal && (
            <IconBtn Icon={UtensilsCrossed} active={showMeal} onClick={onToggleMeal} title={showMeal ? '캘린더로' : '급식 메뉴'} compact />
          )}
          {user && onToggleTPass && (
            <button
              onClick={onToggleTPass}
              style={{ ...styles.iconBtnCompact, background: showTPass ? 'var(--bg-hover)' : 'transparent' }}
              title={showTPass ? '캘린더로' : 'TPass 출결'}
              aria-label="TPass"
            >
              <span style={styles.tpassIconCompact}>T</span>
            </button>
          )}
          {user && (
            <WidgetSchoolToggle
              userSchool={user.school}
              viewingSchool={viewingSchool}
              setViewingSchool={setViewingSchool}
            />
          )}
          <IconBtn Icon={BookOpen} active={showTimetable} onClick={toggleTimetable} title={showTimetable ? '시간표 숨기기' : '시간표 보기'} compact />
          <button onClick={handleToggleWidget} style={styles.editBtn} title="편집 모드 (Ctrl+Shift+C)">
            <Pencil size={12} strokeWidth={2} style={{ marginRight: 4, verticalAlign: '-2px' }} />편집
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="titlebar" style={styles.container}>
      <div style={styles.left}>
        <button
          onClick={onGoHome}
          style={styles.homeBtn}
          title="메인 달력으로"
          aria-label="메인 달력"
        >
          <Calendar size={18} strokeWidth={2.2} color="var(--accent)" />
          <span style={styles.title}>ToneT</span>
        </button>
        {user && (
          <span style={{
            ...styles.schoolPill,
            background: user.school === 'taeseong_high' ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)',
            color: user.school === 'taeseong_high' ? '#8B5CF6' : '#10B981',
          }}>
            {user.school === 'taeseong_high' ? (
              <><GraduationCap size={11} strokeWidth={2.5} style={{ verticalAlign: '-1px' }} /> 태성고</>
            ) : (
              <><SchoolIcon size={11} strokeWidth={2.5} style={{ verticalAlign: '-1px' }} /> 태성중</>
            )}
          </span>
        )}
      </div>

      <div style={styles.right}>
        {showSettingsBtn && user && (
          <>
            {onToggleTodos && (
              <IconBtn Icon={CheckSquare} active={showTodos} onClick={onToggleTodos} title={showTodos ? '캘린더로' : '할 일'} />
            )}
            {onToggleReserv && (
              <IconBtn Icon={Building2} active={showReserv} onClick={onToggleReserv} title={showReserv ? '캘린더로' : '회의실 예약'} />
            )}
            {onToggleMeal && (
              <IconBtn Icon={UtensilsCrossed} active={showMeal} onClick={onToggleMeal} title={showMeal ? '캘린더로' : '급식 메뉴'} />
            )}
            {onToggleTPass && (
              <button
                onClick={onToggleTPass}
                style={{ ...styles.iconBtn, background: showTPass ? 'var(--bg-hover)' : 'transparent' }}
                title={showTPass ? '캘린더로' : 'TPass 출결'}
                aria-label="TPass"
              >
                <span style={styles.tpassIcon}>T</span>
              </button>
            )}
            <div style={styles.divider} />
            <IconBtn Icon={BookOpen} active={showTimetable} onClick={toggleTimetable} title={showTimetable ? '시간표 숨기기' : '시간표 보기'} />
            <button
              onClick={() => setShowPanel(!showPanel)}
              style={{ ...styles.iconBtn, background: showPanel ? 'var(--bg-hover)' : 'transparent', position: 'relative' }}
              title="알림"
              aria-label="알림"
            >
              <Bell size={18} strokeWidth={2} />
              {unreadCount > 0 && (
                <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showAdminBtn && (
              <IconBtn Icon={Users} onClick={onToggleAdmin} title="관리자" />
            )}
            <IconBtn Icon={Settings} onClick={onToggleSettings} title="설정" />
            {onToggleTheme && (
              <IconBtn
                Icon={theme === 'dark' ? Sun : Moon}
                onClick={onToggleTheme}
                title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
              />
            )}
            <div style={styles.divider} />
          </>
        )}
        <IconBtn Icon={Pin} onClick={handleToggleWidget} title="위젯 모드 (바탕 고정)" accent />
        <IconBtn Icon={Minus} onClick={() => window.electronAPI?.minimize()} title="최소화" />
        <button
          onClick={() => window.electronAPI?.close()}
          style={{ ...styles.iconBtn, ...styles.closeBtn }}
          title="종료"
          aria-label="종료"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// 위젯 모드용 미니 학교 토글 (드롭다운 대신 cycle 방식)
function WidgetSchoolToggle({
  userSchool,
  viewingSchool,
  setViewingSchool,
}: {
  userSchool: School;
  viewingSchool: 'own' | 'all' | School;
  setViewingSchool: (s: 'own' | 'all' | School) => void;
}) {
  const order: ('own' | School | 'all')[] = ['own', 'taeseong_middle', 'taeseong_high', 'all'];
  const labels: Record<string, string> = {
    own: userSchool === 'taeseong_high' ? '🎓' : '🏫',
    taeseong_middle: '🏫중',
    taeseong_high: '🎓고',
    all: '🌐',
  };
  const currentIdx = order.indexOf(viewingSchool);
  const currentLabel = labels[viewingSchool];
  return (
    <button
      onClick={() => setViewingSchool(order[(currentIdx + 1) % order.length])}
      style={{
        background: 'rgba(139,92,246,0.15)',
        border: '1px solid rgba(139,92,246,0.3)',
        cursor: 'pointer',
        padding: '3px 8px',
        fontSize: 11,
        fontWeight: 700,
        color: '#8B5CF6',
        borderRadius: 6,
      }}
      title={`보는 학교: ${viewingSchool === 'own' ? '우리학교' : viewingSchool === 'all' ? '전체' : SCHOOL_LABELS[viewingSchool as School]}`}
    >
      {currentLabel}
    </button>
  );
}

interface IconBtnProps {
  Icon?: React.ComponentType<any>;
  icon?: string; // fallback 이모지 (레거시)
  title: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  compact?: boolean;
}

function IconBtn({ Icon, icon, title, onClick, active, accent, compact }: IconBtnProps) {
  const size = compact ? 14 : 18;
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
      aria-label={title}
    >
      {Icon ? <Icon size={size} strokeWidth={2} /> : <span style={compact ? styles.iconTextCompact : styles.iconText}>{icon}</span>}
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
  widgetTitleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    letterSpacing: 0.5,
    borderRadius: 4,
    transition: 'all 0.15s',
  },
  homeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 8,
    transition: 'background 0.15s',
  },
  tpassIconCompact: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: 3,
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1,
    fontFamily: 'Arial, sans-serif',
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

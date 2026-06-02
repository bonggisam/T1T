import React, { useState, useEffect } from 'react';
import {
  Calendar, CheckSquare, Building2, UtensilsCrossed, BookOpen,
  Bell, Users, Settings, Sun, Moon, Pin, Minus, X,
  GraduationCap, School as SchoolIcon, Pencil, LogOut, CalendarDays, Phone,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useComciganStore } from '../../store/comciganStore';
import { useUIStore } from '../../store/uiStore';
import { useDarkMode } from '../../hooks/useDarkMode';
import { LibraryButton } from './LibraryButton';
import { SCHOOL_LABELS } from '@shared/types';
import type { School } from '@shared/types';

interface TitleBarProps {
  onToggleSettings: () => void;
  onToggleAdmin: () => void;
  showSettingsBtn: boolean;
  showAdminBtn: boolean;
  onToggleTPass?: () => void;
  showTPass?: boolean;
  onToggleOuting?: () => void;
  showOuting?: boolean;
  onToggleTodos?: () => void;
  showTodos?: boolean;
  onToggleReserv?: () => void;
  showReserv?: boolean;
  onToggleMeal?: () => void;
  showMeal?: boolean;
  onToggleSchedule?: () => void;
  showSchedule?: boolean;
  onToggleKeyphone?: () => void;
  showKeyphone?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onGoHome?: () => void; // 메인 달력으로 복귀
}

export function TitleBar({
  onToggleSettings, onToggleAdmin, showSettingsBtn, showAdminBtn,
  onToggleTPass, showTPass,
  onToggleOuting, showOuting,
  onToggleTodos, showTodos,
  onToggleReserv, showReserv,
  onToggleMeal, showMeal,
  onToggleSchedule, showSchedule,
  onToggleKeyphone, showKeyphone,
  theme, onToggleTheme,
  onGoHome,
}: TitleBarProps) {
  const { user } = useAuthStore();
  const { unreadCount, setShowPanel, showPanel } = useNotificationStore();
  const { showTimetable, toggleTimetable } = useComciganStore();
  const { viewingSchool, setViewingSchool } = useUIStore();
  const [widgetMode, setWidgetMode] = useState(true);
  const isDark = useDarkMode();
  // 다크모드 가독성: 보라/그린 텍스트 색상 — 라이트는 진하게, 다크는 밝게
  const HIGH_TEXT = isDark ? '#C4B5FD' : '#7C3AED'; // violet-300 / violet-600
  const MIDDLE_TEXT = isDark ? '#34D399' : '#059669'; // emerald-400 / emerald-600
  const HIGH_BG = isDark ? 'rgba(196,181,253,0.18)' : 'rgba(124,58,237,0.15)';
  const MIDDLE_BG = isDark ? 'rgba(52,211,153,0.18)' : 'rgba(5,150,105,0.15)';

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

  // 아이콘 색상 — TPass만 강조, 나머지는 기본 그레이(undefined)
  const ICON_COLORS = {
    tpass: '#EC4899', // 핑크 - TPass만 강조
  };

  // Widget mode: 미니멀이지만 필수 탭 버튼은 포함
  if (widgetMode) {
    return (
      <div className="titlebar" style={styles.widgetBar}>
        <button onClick={onGoHome} style={styles.widgetTitleBtn} title="메인 달력으로">
          <Calendar size={12} strokeWidth={2.2} style={{ marginRight: 3, verticalAlign: '-1px', color: 'var(--accent)' }} />
          T1T
        </button>
        {/* 중앙: 기능 아이콘 */}
        <div style={styles.widgetCenter}>
          {user && onToggleTodos && (
            <IconBtn Icon={CheckSquare} active={showTodos} onClick={onToggleTodos} title={showTodos ? '캘린더로' : '할 일'} compact />
          )}
          {user && onToggleReserv && (
            <IconBtn Icon={Building2} active={showReserv} onClick={onToggleReserv} title={showReserv ? '캘린더로' : '회의실 예약'} compact />
          )}
          {user && onToggleMeal && (
            <IconBtn Icon={UtensilsCrossed} active={showMeal} onClick={onToggleMeal} title={showMeal ? '캘린더로' : '급식 메뉴'} compact />
          )}
          {user && onToggleSchedule && (
            <IconBtn Icon={CalendarDays} active={showSchedule} onClick={onToggleSchedule} title={showSchedule ? '캘린더로' : '학사일정'} compact />
          )}
          {user && onToggleKeyphone && (
            <IconBtn Icon={Phone} active={showKeyphone} onClick={onToggleKeyphone} title={showKeyphone ? '캘린더로' : '키폰 번호'} compact />
          )}
          {user && <LibraryButton compact />}
          {user && onToggleTPass && (
            <button
              onClick={onToggleTPass}
              style={{
                ...styles.iconBtnCompact,
                background: showTPass ? `${ICON_COLORS.tpass}22` : 'transparent',
                color: ICON_COLORS.tpass,
              }}
              title={showTPass ? '캘린더로' : 'TPass 출결'}
              aria-label="TPass"
            >
              <span style={{ ...styles.tpassIconCompact, color: ICON_COLORS.tpass }}>T</span>
            </button>
          )}
          {user && onToggleOuting && (
            <IconBtn Icon={LogOut} active={showOuting} onClick={onToggleOuting} title={showOuting ? '캘린더로' : '학생 외출 신청'} compact />
          )}
          {user && (
            <WidgetSchoolToggle
              userSchool={user.school}
              viewingSchool={viewingSchool}
              setViewingSchool={setViewingSchool}
            />
          )}
          <IconBtn Icon={BookOpen} active={showTimetable} onClick={toggleTimetable} title={showTimetable ? '시간표 숨기기' : '시간표 보기'} compact />
        </div>
        {/* 우측: 편집 버튼 */}
        <button onClick={handleToggleWidget} style={styles.editBtn} title="편집 모드 (Ctrl+Shift+C)">
          <Pencil size={12} strokeWidth={2} style={{ marginRight: 4, verticalAlign: '-2px' }} />편집
        </button>
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
          <span style={styles.title}>T1T</span>
        </button>
        {user && (user.role === 'super_admin' ? (
          <span style={{
            ...styles.schoolPill,
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#F59E0B',
          }}>
            👑 전체 관리자
          </span>
        ) : user.school === 'taeseong_high' ? (
          <span style={{
            ...styles.schoolPill,
            background: HIGH_BG,
            color: HIGH_TEXT,
          }}>
            <GraduationCap size={11} strokeWidth={2.5} style={{ verticalAlign: '-1px' }} /> 태성고
          </span>
        ) : (
          <span style={{
            ...styles.schoolPill,
            background: MIDDLE_BG,
            color: MIDDLE_TEXT,
          }}>
            <SchoolIcon size={11} strokeWidth={2.5} style={{ verticalAlign: '-1px' }} /> 태성중
          </span>
        ))}
      </div>

      {/* 가운데: 기능 아이콘 */}
      <div style={styles.center}>
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
            {onToggleSchedule && (
              <IconBtn Icon={CalendarDays} active={showSchedule} onClick={onToggleSchedule} title={showSchedule ? '캘린더로' : '학사일정'} />
            )}
            {onToggleKeyphone && (
              <IconBtn Icon={Phone} active={showKeyphone} onClick={onToggleKeyphone} title={showKeyphone ? '캘린더로' : '키폰 번호'} />
            )}
            <LibraryButton />
            {onToggleTPass && (
              <button
                onClick={onToggleTPass}
                style={{
                  ...styles.iconBtn,
                  background: showTPass ? `${ICON_COLORS.tpass}22` : 'transparent',
                }}
                title={showTPass ? '캘린더로' : 'TPass 출결'}
                aria-label="TPass"
              >
                <span style={{ ...styles.tpassIcon, color: ICON_COLORS.tpass }}>T</span>
              </button>
            )}
            {onToggleOuting && (
              <IconBtn Icon={LogOut} active={showOuting} onClick={onToggleOuting} title={showOuting ? '캘린더로' : '학생 외출 신청'} />
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
          </>
        )}
      </div>

      {/* 우측: 창 제어 */}
      <div style={styles.right}>
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
  viewingSchool: 'all' | School;
  setViewingSchool: (s: 'all' | School) => void;
}) {
  const order: (School | 'all')[] = ['taeseong_middle', 'taeseong_high', 'all'];
  const labels: Record<string, string> = {
    taeseong_middle: '🏫중',
    taeseong_high: '🎓고',
    all: '🌐',
  };
  const currentIdx = order.indexOf(viewingSchool);
  const currentLabel = labels[viewingSchool] ?? '🌐';
  const isDarkLocal = useDarkMode();
  // 다크 모드에서 보라색 가독성 강화
  const bg = isDarkLocal ? 'rgba(196,181,253,0.18)' : 'rgba(124,58,237,0.15)';
  const border = isDarkLocal ? 'rgba(196,181,253,0.4)' : 'rgba(124,58,237,0.35)';
  const text = isDarkLocal ? '#C4B5FD' : '#7C3AED';
  return (
    <button
      onClick={() => setViewingSchool(order[(currentIdx + 1) % order.length])}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        cursor: 'pointer',
        padding: '3px 8px',
        fontSize: 11,
        fontWeight: 700,
        color: text,
        borderRadius: 6,
      }}
      title={`보는 학교: ${viewingSchool === 'all' ? '전체' : SCHOOL_LABELS[viewingSchool as School]}`}
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
  color?: string; // 조화로운 아이콘 색상
}

function IconBtn({ Icon, icon, title, onClick, active, accent, compact, color }: IconBtnProps) {
  const size = compact ? 14 : 18;
  // 우선순위: 활성/accent > color > 기본
  const iconColor = active
    ? (color || 'var(--accent)')
    : accent
      ? 'var(--accent)'
      : color
        ? color
        : 'var(--text-secondary)';
  return (
    <button
      onClick={onClick}
      style={{
        ...(compact ? styles.iconBtnCompact : styles.iconBtn),
        background: active && color ? `${color}22` : active ? 'var(--bg-hover)' : 'transparent',
        color: iconColor,
        opacity: active === false ? 0.78 : 1,
        transition: 'all 0.15s',
      }}
      title={title}
      aria-label={title}
    >
      {Icon ? <Icon size={size} strokeWidth={2.2} /> : <span style={compact ? styles.iconTextCompact : styles.iconText}>{icon}</span>}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr', // 좌(로고)/중(아이콘)/우(창제어)
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
    minHeight: 44,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    justifySelf: 'center', // 그리드 셀 내에서 중앙
  },
  widgetBar: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '6px 12px',
    flexShrink: 0,
    opacity: 0,
    transition: 'opacity 0.3s',
    borderBottom: '1px solid var(--grid-line)',
    background: 'rgba(128,128,128,0.08)',
  },
  widgetCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    justifySelf: 'center',
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
    justifySelf: 'end', // 그리드 셀 우측 정렬
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
    justifySelf: 'end',
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

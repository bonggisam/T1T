import React, { useEffect, useState } from 'react';
import {
  Bell, Calendar, Eye, EyeOff, LayoutGrid, Minus, Pencil, Pin, Search, Settings, X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePersonalHidden, usePrivacyStore } from '../../store/privacyStore';
import { useUIStore } from '../../store/uiStore';
import { usePopover } from '../../hooks/usePopover';
import { NARROW_MAX, useWindowSize, WIDE_MIN } from '../../hooks/useWindowSize';
import { CalendarNav } from '../calendar/CalendarNav';
import { TOOL_TABS, ToolMenu, type ToolTab } from './ToolMenu';

/*
 * 제목 줄에 글자와 단추를 얼마나 넣을지 정하는 폭. 보기마다 실제 화면을 재서 정했다.
 * 편집 모드는 고정, 최소화, 종료 단추가 편집 단추보다 넓어 그만큼 덜 남고,
 * 달력 화면이 아니면 날짜 이동이 없어 그만큼 더 남는다.
 */
const EDIT_BUTTONS_EXTRA = 31;
const NAV_WIDTH = 160;
/** 일 보기는 날짜가 길어 이보다 좁으면 연도를 뺀다 */
const DAY_YEAR_MIN = 419;
/** 이보다 좁으면 날짜를 줄이고 연도를 뺀다 */
const FULL_DATE_MIN = 387;
/** 이보다 좁으면 T1T와 오늘, 편집 글자, 구분선을 뺀다 */
const COMPACT_MAX = 359;
/** 도구 아이콘이 제목 줄에 함께 들어가는 폭. 이보다 좁으면 아래에 아이콘 줄을 따로 둔다 */
const ONE_ROW_MIN = 840;
const TOOL_MENU_WIDTH = 300;

interface TitleBarProps {
  onToggleSettings: () => void;
  onToggleAdmin: () => void;
  /** 로그인한 뒤에만 도구를 보여 준다 */
  showSettingsBtn: boolean;
  showAdminBtn: boolean;
  activeTab?: string | null;
  onOpenTab?: (tab: ToolTab) => void;
  /** 달력 화면으로 돌아간다 */
  onOpenCalendar?: () => void;
  onPasteEvents?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onGoHome?: () => void; // 메인 달력으로 복귀
}

/**
 * 제목 줄. 날짜 이동, 개인 일정 가리기, 알림, 도구 모음을 한 줄에 둔다.
 * 도구 아이콘은 창 크기와 상관없이 항상 보인다. 창이 넓으면 제목 줄에, 아니면 그 아래 아이콘 줄에 둔다.
 */
export function TitleBar({
  onToggleSettings, onToggleAdmin, showSettingsBtn, showAdminBtn,
  activeTab = null, onOpenTab, onOpenCalendar, onPasteEvents,
  theme, onToggleTheme, onGoHome,
}: TitleBarProps) {
  const user = useAuthStore((s) => s.user);
  const { unreadCount, setShowPanel, showPanel } = useNotificationStore();
  const setCalendarTool = useUIStore((s) => s.setCalendarTool);
  const [widgetMode, setWidgetMode] = useState(true);
  const { width } = useWindowSize();
  const menu = usePopover();
  const signedIn = showSettingsBtn && !!user;
  const calendarVisible = signedIn && activeTab === null;
  const room = width - (widgetMode ? 0 : EDIT_BUTTONS_EXTRA) + (calendarVisible ? 0 : NAV_WIDTH);
  const compact = room < COMPACT_MAX;
  const wide = width >= WIDE_MIN;
  const oneRow = width >= ONE_ROW_MIN;

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

  return (
    <>
      <div className="titlebar" style={styles.bar}>
        <button onClick={onGoHome} style={styles.home} title="메인 달력으로" aria-label="메인 달력">
          <Calendar size={16} strokeWidth={2.2} color="var(--accent)" />
          {!compact && <span style={styles.title}>T1T</span>}
        </button>

        {calendarVisible && <CalendarNav short={room < FULL_DATE_MIN} today={!compact} dayYear={room >= DAY_YEAR_MIN} />}

        <span style={styles.spacer} />

        {signedIn && oneRow && onOpenTab && (
          <>
            <ToolIcons activeTab={activeTab} onOpenTab={onOpenTab} />
            <span style={styles.separator} />
          </>
        )}

        {signedIn && wide && onOpenTab && (
          <IconBtn
            Icon={Search}
            onClick={() => { onOpenCalendar?.(); setCalendarTool('search'); }}
            title="일정 검색"
          />
        )}

        {signedIn && <PrivacyToggle />}

        {signedIn && (
          <button
            onClick={() => setShowPanel(!showPanel)}
            style={{ ...styles.iconBtn, background: showPanel ? 'var(--accent-soft)' : 'transparent', color: showPanel ? 'var(--accent)' : 'var(--text-secondary)' }}
            title={unreadCount > 0 ? `알림 ${unreadCount}개` : '알림'}
            aria-label={unreadCount > 0 ? `알림 ${unreadCount}개` : '알림'}
          >
            <Bell size={16} strokeWidth={2.2} />
            {unreadCount > 0 && <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        )}

        {signedIn && onOpenTab && (
          <button
            ref={menu.anchorRef}
            onClick={() => menu.setOpen((v) => !v)}
            style={{ ...styles.iconBtn, background: menu.open ? 'var(--accent-soft)' : 'transparent', color: menu.open ? 'var(--accent)' : 'var(--text-secondary)' }}
            title="도구 모음"
            aria-label="도구 모음"
            aria-expanded={menu.open}
            aria-haspopup="menu"
          >
            <LayoutGrid size={16} strokeWidth={2.2} />
          </button>
        )}

        {signedIn && wide && <IconBtn Icon={Settings} onClick={onToggleSettings} title="설정" />}

        {!compact && <span style={styles.separator} />}

        {widgetMode ? (
          <button onClick={handleToggleWidget} style={styles.editBtn} title="편집 모드 (Ctrl+Shift+C)" aria-label="편집 모드">
            <Pencil size={12} strokeWidth={2} />
            {!compact && '편집'}
          </button>
        ) : (
          <>
            <IconBtn Icon={Pin} onClick={handleToggleWidget} title="위젯 모드 (바탕 고정)" accent />
            <IconBtn Icon={Minus} onClick={() => window.electronAPI?.minimize()} title="최소화" />
            <button
              onClick={() => window.electronAPI?.close()}
              style={{ ...styles.iconBtn, color: 'var(--danger)' }}
              title="종료"
              aria-label="종료"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </>
        )}
      </div>

      {signedIn && !oneRow && onOpenTab && (
        <div
          className="titlebar"
          style={{ ...styles.toolRow, justifyContent: width < NARROW_MAX ? 'space-between' : 'flex-end' }}
          role="toolbar"
          aria-label="도구"
        >
          <ToolIcons activeTab={activeTab} onOpenTab={onOpenTab} />
        </div>
      )}

      {menu.open && onOpenTab && (
        <ToolMenu
          popRef={menu.popRef}
          style={{
            top: (menu.anchorRef.current?.getBoundingClientRect().bottom ?? 40) + 4,
            right: 8,
            width: Math.min(TOOL_MENU_WIDTH, width - 16),
          }}
          activeTab={activeTab}
          onOpenTab={onOpenTab}
          onOpenCalendar={() => onOpenCalendar?.()}
          onPasteEvents={onPasteEvents}
          onToggleSettings={onToggleSettings}
          onToggleAdmin={onToggleAdmin}
          showAdmin={showAdminBtn}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onClose={() => menu.setOpen(false)}
        />
      )}
    </>
  );
}

function ToolIcons({ activeTab, onOpenTab }: { activeTab: string | null; onOpenTab: (tab: ToolTab) => void }) {
  return (
    <>
      {TOOL_TABS.map(({ tab, label, Icon }) => (
        <IconBtn key={tab} Icon={Icon} active={activeTab === tab} onClick={() => onOpenTab(tab)} title={label} />
      ))}
    </>
  );
}

// 개인 일정 가리기. 창이 좁아도 항상 보인다.
function PrivacyToggle() {
  const hidden = usePersonalHidden();
  const toggle = usePrivacyStore((s) => s.toggle);
  return (
    <IconBtn
      Icon={hidden ? EyeOff : Eye}
      active={hidden}
      onClick={toggle}
      title={hidden ? '개인 일정 보이기 (Ctrl+Shift+H)' : '개인 일정 가리기 (Ctrl+Shift+H)'}
    />
  );
}

interface IconBtnProps {
  Icon: React.ComponentType<any>;
  title: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
}

function IconBtn({ Icon, title, onClick, active, accent }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.iconBtn,
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active || accent ? 'var(--accent)' : 'var(--text-secondary)',
      }}
      title={title}
      aria-label={title}
    >
      <Icon size={16} strokeWidth={2.2} />
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    height: 40,
    padding: '0 6px 0 8px',
    flexShrink: 0,
  },
  toolRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 2,
    padding: '0 8px 3px',
    flexShrink: 0,
  },
  home: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    padding: '2px 6px 2px 2px',
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    cursor: 'pointer',
  },
  title: {
    fontSize: 'var(--fs-lead)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--text-primary)',
  },
  spacer: {
    flex: 1,
    minWidth: 4,
  },
  separator: {
    flexShrink: 0,
    width: 1,
    height: 16,
    margin: '0 3px',
    background: 'var(--border-color)',
  },
  iconBtn: {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 27,
    height: 27,
    padding: 0,
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 14,
    height: 14,
    padding: '0 3px',
    borderRadius: 7,
    background: 'var(--danger)',
    color: 'var(--on-accent)',
    fontSize: 'var(--fs-caption)',
    fontWeight: 700,
    lineHeight: '14px',
    textAlign: 'center',
  },
  editBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    height: 27,
    padding: '0 8px',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    borderRadius: 7,
    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    color: 'var(--accent)',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
};

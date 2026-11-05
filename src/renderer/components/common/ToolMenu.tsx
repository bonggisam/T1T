import React from 'react';
import {
  BookMarked, BookOpen, Building2, CalendarDays, CheckSquare, ClipboardPaste, DoorOpen, ListChecks, Moon, Phone,
  Printer, Search, Settings, Share, Sun, Users, UtensilsCrossed,
} from 'lucide-react';
import { format } from 'date-fns';
import { useCalendarStore } from '../../store/calendarStore';
import { useComciganStore } from '../../store/comciganStore';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { downloadICS } from '../../utils/icsExport';
import { SCHOOL_LABELS } from '@shared/types';
import { showToast } from './Toast';

export type ToolTab = 'todos' | 'reserv' | 'meal' | 'schedule' | 'keyphone' | 'library' | 'tpass' | 'outing';

interface ToolMenuProps {
  style: React.CSSProperties;
  popRef: React.RefObject<HTMLDivElement>;
  activeTab: ToolTab | string | null;
  onOpenTab: (tab: ToolTab) => void;
  onOpenCalendar: () => void;
  onPasteEvents?: () => void;
  onToggleSettings: () => void;
  onToggleAdmin: () => void;
  showAdmin: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onClose: () => void;
}

const TABS: Array<{ tab: ToolTab; label: string; Icon: React.ComponentType<any> }> = [
  { tab: 'todos', label: '할 일', Icon: CheckSquare },
  { tab: 'reserv', label: '회의실', Icon: Building2 },
  { tab: 'meal', label: '급식', Icon: UtensilsCrossed },
  { tab: 'schedule', label: '학사일정', Icon: CalendarDays },
  { tab: 'keyphone', label: '키폰', Icon: Phone },
  { tab: 'library', label: '도서관', Icon: BookMarked },
  { tab: 'tpass', label: '출결', Icon: ListChecks },
  { tab: 'outing', label: '외출', Icon: DoorOpen },
];

/** 아이콘만 늘어놓던 제목 줄 대신, 이름이 붙은 도구 모음 */
export function ToolMenu({
  style, popRef, activeTab, onOpenTab, onOpenCalendar, onPasteEvents,
  onToggleSettings, onToggleAdmin, showAdmin, theme, onToggleTheme, onClose,
}: ToolMenuProps) {
  const user = useAuthStore((s) => s.user);
  const setCalendarTool = useUIStore((s) => s.setCalendarTool);
  const currentMonth = useCalendarStore((s) => s.currentMonth);
  const showTimetable = useComciganStore((s) => s.showTimetable);
  const toggleTimetable = useComciganStore((s) => s.toggleTimetable);
  const visibleEvents = useVisibleEvents();

  function run(action: () => void) {
    onClose();
    action();
  }

  function openCalendarTool(tool: 'search' | 'print') {
    run(() => {
      onOpenCalendar();
      setCalendarTool(tool);
    });
  }

  function exportIcs() {
    run(() => {
      if (visibleEvents.length === 0) {
        showToast('내보낼 일정이 없습니다');
        return;
      }
      downloadICS(visibleEvents, `t1t-${format(currentMonth, 'yyyy-MM')}.ics`);
    });
  }

  const who = user?.role === 'super_admin'
    ? `${user.name} · 전체 관리자`
    : user ? `${user.name} · ${SCHOOL_LABELS[user.school] ?? ''}` : '';

  return (
    <div ref={popRef} className="menu-pop" style={style} role="menu" aria-label="도구 모음">
      {who && <p style={styles.who}>{who}</p>}
      <div className="tool-grid">
        {TABS.map(({ tab, label, Icon }) => (
          <button
            key={tab}
            role="menuitem"
            className={`tool-btn${activeTab === tab ? ' on' : ''}`}
            onClick={() => run(() => onOpenTab(tab))}
          >
            <Icon size={19} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>
      <div style={styles.divider} />
      <div className="tool-grid">
        <button role="menuitem" className="tool-btn" onClick={() => openCalendarTool('search')}>
          <Search size={19} strokeWidth={2} />검색
        </button>
        {onPasteEvents && (
          <button role="menuitem" className="tool-btn" onClick={() => run(onPasteEvents)} title="달력에서 Ctrl+V로도 열립니다">
            <ClipboardPaste size={19} strokeWidth={2} />붙여넣기
          </button>
        )}
        <button role="menuitem" className="tool-btn" onClick={() => openCalendarTool('print')}>
          <Printer size={19} strokeWidth={2} />인쇄
        </button>
        <button role="menuitem" className="tool-btn" onClick={exportIcs} title=".ics 파일로 내보내기 (Google/Apple 캘린더 호환)">
          <Share size={19} strokeWidth={2} />내보내기
        </button>
        <button
          role="menuitemcheckbox"
          aria-checked={showTimetable}
          className={`tool-btn${showTimetable ? ' on' : ''}`}
          onClick={toggleTimetable}
        >
          <BookOpen size={19} strokeWidth={2} />수업 표시
        </button>
        {onToggleTheme && (
          <button role="menuitem" className="tool-btn" onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={19} strokeWidth={2} /> : <Moon size={19} strokeWidth={2} />}
            {theme === 'dark' ? '밝게' : '어둡게'}
          </button>
        )}
        <button role="menuitem" className="tool-btn" onClick={() => run(onToggleSettings)}>
          <Settings size={19} strokeWidth={2} />설정
        </button>
        {showAdmin && (
          <button role="menuitem" className="tool-btn" onClick={() => run(onToggleAdmin)}>
            <Users size={19} strokeWidth={2} />관리자
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  who: {
    padding: '0 4px 6px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  divider: {
    height: 1,
    margin: '6px 4px',
    background: 'var(--border-subtle)',
  },
};

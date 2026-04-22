import { useEffect } from 'react';
import { useCalendarStore } from '../store/calendarStore';

/**
 * 캘린더 전역 키보드 단축키.
 * - N: 새 공유 일정
 * - T: 오늘로
 * - M: 월간 뷰, W: 주간, D: 일간, Y: 년간, A: 아젠다, S: 통계
 * - ← →: 이전/다음 월
 * - /: 검색 (구현은 Calendar에서 처리)
 *
 * 입력 필드(input/textarea)에서는 무시.
 */
export function useKeyboardShortcuts(options?: {
  onSearch?: () => void;
  onAddPersonal?: () => void;
}): void {
  const {
    setShowEventModal, setView, navigateMonth, setCurrentMonth, setSelectedDate,
  } = useCalendarStore();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // 입력 필드에서는 무시
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      // Modifier 사용 중이면 (Ctrl/Cmd) skip (다른 단축키와 충돌 방지)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          setShowEventModal(true);
          break;
        case 'p':
          e.preventDefault();
          options?.onAddPersonal?.();
          break;
        case 't':
          e.preventDefault();
          setCurrentMonth(new Date());
          setSelectedDate(new Date());
          break;
        case 'm': e.preventDefault(); setView('month'); break;
        case 'w': e.preventDefault(); setView('week'); break;
        case 'd': e.preventDefault(); setView('day'); break;
        case 'y': e.preventDefault(); setView('year'); break;
        case 'a': e.preventDefault(); setView('agenda'); break;
        case 's': e.preventDefault(); setView('stats'); break;
        case 'arrowleft':
          e.preventDefault();
          navigateMonth(-1);
          break;
        case 'arrowright':
          e.preventDefault();
          navigateMonth(1);
          break;
        case '/':
          e.preventDefault();
          options?.onSearch?.();
          break;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [options?.onSearch, options?.onAddPersonal]);
}

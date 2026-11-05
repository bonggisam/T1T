import { useMemo } from 'react';
import type { CalendarEvent } from '@shared/types';
import { useCategoryFilter } from '../store/uiStore';
import { useMyDuties } from '../store/dutyStore';
import { dutyToEvent } from '../utils/dutyEntries';
import { useVisibleEvents } from './useVisibleEvents';

/**
 * 달력에 그릴 일정: 공유 일정에 내 감독·당직 차례를 더한다.
 * 차례는 화면에서만 만드는 값이라 저장, 구글 동기화, 통계, 내보내기에 들어가지 않는다.
 * 분류를 골라 보는 동안에는 그 분류만 보이도록 빼고, 학교 필터와는 상관없이 내 차례는 보여 준다.
 */
export function useCalendarEvents(): CalendarEvent[] {
  const visible = useVisibleEvents();
  const duties = useMyDuties();
  const categoryFilter = useCategoryFilter();
  return useMemo(() => {
    if (duties.length === 0 || categoryFilter !== 'all') return visible;
    return [...visible, ...duties.map(dutyToEvent)];
  }, [visible, duties, categoryFilter]);
}

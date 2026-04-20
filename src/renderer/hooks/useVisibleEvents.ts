import { useMemo } from 'react';
import { useCalendarStore } from '../store/calendarStore';
import { useAuthStore } from '../store/authStore';
import { useCategoryFilter } from '../store/uiStore';
import type { CalendarEvent } from '@shared/types';

/**
 * 사용자의 학교 + 선택된 카테고리 필터에 맞게 필터링된 일정 목록.
 */
export function useVisibleEvents(): CalendarEvent[] {
  const { events } = useCalendarStore();
  const { user } = useAuthStore();
  const categoryFilter = useCategoryFilter();

  return useMemo(() => {
    if (!user) return []; // 로그인 전엔 아무것도 노출 안 함
    let filtered = events.filter((e) => e.school === 'all' || e.school === user.school);
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((e) => e.category === categoryFilter);
    }
    return filtered;
  }, [events, user?.school, categoryFilter]);
}

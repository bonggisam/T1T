import { useMemo } from 'react';
import { useCalendarStore } from '../store/calendarStore';
import { useAuthStore } from '../store/authStore';
import { useCategoryFilter, useUIStore } from '../store/uiStore';
import type { CalendarEvent } from '@shared/types';

/**
 * 학교 뷰 필터 + 카테고리 필터에 맞게 필터링된 일정 목록.
 *
 * viewingSchool:
 *   - 'own' → 본인 학교 + 전체 공유 (기본)
 *   - 'all' → 양 학교 모두 (전체 공유 포함)
 *   - School 값 → 해당 학교 + 전체 공유
 */
export function useVisibleEvents(): CalendarEvent[] {
  const { events } = useCalendarStore();
  const { user } = useAuthStore();
  const categoryFilter = useCategoryFilter();
  const viewingSchool = useUIStore((s) => s.viewingSchool);

  return useMemo(() => {
    if (!user) return [];

    // 학교 필터링
    let filtered: CalendarEvent[];
    if (viewingSchool === 'all') {
      filtered = events; // 양쪽 학교 + 전체
    } else {
      // 특정 학교 뷰
      filtered = events.filter((e) => e.school === 'all' || e.school === viewingSchool);
    }

    // 카테고리 필터
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((e) => e.category === categoryFilter);
    }
    return filtered;
  }, [events, user?.school, viewingSchool, categoryFilter]);
}

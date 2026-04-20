import { create } from 'zustand';
import type { EventCategory, School } from '@shared/types';

/**
 * UI 전역 상태.
 * - categoryFilter: 카테고리별 필터
 * - viewingSchool: 현재 어느 학교 공유 일정을 볼지 (본인 학교 외 전환 가능)
 *   - 'own' = 본인 학교만 (+ 전체)
 *   - 'all' = 양쪽 학교 모두
 *   - School 값 = 해당 학교만 (+ 전체)
 */
interface UIState {
  categoryFilter: EventCategory | 'all';
  setCategoryFilter: (c: EventCategory | 'all') => void;
  viewingSchool: 'own' | 'all' | School;
  setViewingSchool: (s: 'own' | 'all' | School) => void;
}

export const useUIStore = create<UIState>((set) => ({
  categoryFilter: 'all',
  setCategoryFilter: (c) => set({ categoryFilter: c }),
  viewingSchool: 'own',
  setViewingSchool: (s) => set({ viewingSchool: s }),
}));

export function useCategoryFilter() {
  return useUIStore((s) => s.categoryFilter);
}

import { create } from 'zustand';
import type { EventCategory } from '@shared/types';

/**
 * UI 전역 상태 (카테고리 필터 등).
 */
interface UIState {
  categoryFilter: EventCategory | 'all';
  setCategoryFilter: (c: EventCategory | 'all') => void;
}

export const useUIStore = create<UIState>((set) => ({
  categoryFilter: 'all',
  setCategoryFilter: (c) => set({ categoryFilter: c }),
}));

export function useCategoryFilter() {
  return useUIStore((s) => s.categoryFilter);
}

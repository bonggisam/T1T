import { create } from 'zustand';
import type { EventCategory, School } from '@shared/types';

const VIEWING_SCHOOL_KEY = 'tonet-viewing-school';

function loadViewingSchool(): 'own' | 'all' | School {
  try {
    const saved = localStorage.getItem(VIEWING_SCHOOL_KEY);
    if (saved === 'own' || saved === 'all' || saved === 'taeseong_middle' || saved === 'taeseong_high') {
      return saved;
    }
  } catch {}
  return 'own';
}

/**
 * UI 전역 상태.
 * - categoryFilter: 카테고리별 필터
 * - viewingSchool: 현재 어느 학교 공유 일정을 볼지 (localStorage 저장)
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
  viewingSchool: loadViewingSchool(),
  setViewingSchool: (s) => {
    try { localStorage.setItem(VIEWING_SCHOOL_KEY, s); } catch {}
    set({ viewingSchool: s });
  },
}));

export function useCategoryFilter() {
  return useUIStore((s) => s.categoryFilter);
}

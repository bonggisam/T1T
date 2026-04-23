import { create } from 'zustand';
import type { EventCategory, School } from '@shared/types';

const VIEWING_SCHOOL_KEY = 'tonet-viewing-school';

/**
 * 저장된 viewing school 불러오기.
 * - 사용자가 명시적으로 설정한 값만 반환 (null이면 미설정)
 * - 레거시 'own' → null로 마이그레이션 (이후 initViewingSchoolForUser에서 본인 학교로 설정)
 */
function loadViewingSchool(): 'all' | School | null {
  try {
    const saved = localStorage.getItem(VIEWING_SCHOOL_KEY);
    if (saved === 'own') {
      localStorage.removeItem(VIEWING_SCHOOL_KEY);
      return null;
    }
    if (saved === 'all' || saved === 'taeseong_middle' || saved === 'taeseong_high') {
      return saved;
    }
  } catch {}
  return null;
}

/**
 * UI 전역 상태.
 * - categoryFilter: 카테고리별 필터
 * - viewingSchool: 현재 어느 학교 공유 일정을 볼지 (localStorage 저장)
 *   - 기본: 본인 학교 (로그인 후 initViewingSchoolForUser로 설정)
 *   - '전체'(all) 버튼 클릭 시에만 양쪽 학교 표시
 */
interface UIState {
  categoryFilter: EventCategory | 'all';
  setCategoryFilter: (c: EventCategory | 'all') => void;
  viewingSchool: 'all' | School;
  setViewingSchool: (s: 'all' | School) => void;
  /** 로그인 시 본인 학교로 초기화 (localStorage 값 없을 때만) */
  initViewingSchoolForUser: (userSchool?: School | null) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  categoryFilter: 'all',
  setCategoryFilter: (c) => set({ categoryFilter: c }),
  // 초기값: localStorage 값 없으면 'all' (로그인 후 본인 학교로 대체됨)
  viewingSchool: loadViewingSchool() || 'all',
  setViewingSchool: (s) => {
    try { localStorage.setItem(VIEWING_SCHOOL_KEY, s); } catch (e) { console.warn('[UIStore] save failed:', e); }
    set({ viewingSchool: s });
  },
  initViewingSchoolForUser: (userSchool) => {
    const saved = loadViewingSchool();
    // 이미 명시적 저장값 있으면 유지
    if (saved) return;
    // 본인 학교가 유효하면 그것으로, 없으면 'all'
    const defaultValue: 'all' | School =
      (userSchool === 'taeseong_middle' || userSchool === 'taeseong_high')
        ? userSchool
        : 'all';
    try { localStorage.setItem(VIEWING_SCHOOL_KEY, defaultValue); } catch (e) { console.warn('[UIStore] init save failed:', e); }
    set({ viewingSchool: defaultValue });
  },
}));

export function useCategoryFilter() {
  return useUIStore((s) => s.categoryFilter);
}

import { create } from 'zustand';
import type { EventCategory, School } from '@shared/types';

const LEGACY_VIEWING_SCHOOL_KEY = 'tonet-viewing-school';
/** 공용 PC에서 앞 교사가 고른 학교로 시작하면 공유 일정의 기본 대상이 다른 학교가 된다 */
const viewingKey = (userId: string) => `${LEGACY_VIEWING_SCHOOL_KEY}-${userId}`;
let viewingOwner: string | null = null;

/**
 * 저장된 viewing school 불러오기.
 * - 사용자가 명시적으로 설정한 값만 반환 (null이면 미설정)
 * - 레거시 'own' → null로 마이그레이션 (이후 initViewingSchoolForUser에서 본인 학교로 설정)
 */
function loadViewingSchool(userId: string): 'all' | School | null {
  const valid = (value: string | null): value is 'all' | School => (
    value === 'all' || value === 'taeseong_middle' || value === 'taeseong_high'
  );
  try {
    const saved = localStorage.getItem(viewingKey(userId));
    if (valid(saved)) return saved;
    // 예전에는 PC 공용 키에 있었다. 업데이트 뒤 처음 로그인한 사람에게 넘기고 지운다
    const legacy = localStorage.getItem(LEGACY_VIEWING_SCHOOL_KEY);
    localStorage.removeItem(LEGACY_VIEWING_SCHOOL_KEY);
    if (valid(legacy)) {
      localStorage.setItem(viewingKey(userId), legacy);
      return legacy;
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
  /** 로그인 시 그 사람이 고른 학교로, 고른 적이 없으면 본인 학교로 둔다 */
  initViewingSchoolForUser: (userId: string, userSchool?: School | null) => void;
  /** 도서관(read365) 어느 학교 기준으로 볼지 — LibraryView 진입 시 설정 */
  librarySchool: School | null;
  setLibrarySchool: (s: School | null) => void;
  /** 도구 모음에서 연 달력 도구 */
  calendarTool: 'search' | 'print' | null;
  setCalendarTool: (tool: 'search' | 'print' | null) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  categoryFilter: 'all',
  setCategoryFilter: (c) => set({ categoryFilter: c }),
  librarySchool: null,
  setLibrarySchool: (s) => set({ librarySchool: s }),
  calendarTool: null,
  setCalendarTool: (tool) => set({ calendarTool: tool }),
  // 로그인 전 초기값. 로그인하면 initViewingSchoolForUser가 정한다
  viewingSchool: 'all',
  setViewingSchool: (s) => {
    if (viewingOwner) {
      try { localStorage.setItem(viewingKey(viewingOwner), s); } catch (e) { console.warn('[UIStore] save failed:', e); }
    }
    set({ viewingSchool: s });
  },
  initViewingSchoolForUser: (userId, userSchool) => {
    viewingOwner = userId;
    const saved = loadViewingSchool(userId);
    if (saved) {
      set({ viewingSchool: saved });
      return;
    }
    // 본인 학교가 유효하면 그것으로, 없으면 'all'
    const defaultValue: 'all' | School =
      (userSchool === 'taeseong_middle' || userSchool === 'taeseong_high')
        ? userSchool
        : 'all';
    try { localStorage.setItem(viewingKey(userId), defaultValue); } catch (e) { console.warn('[UIStore] init save failed:', e); }
    set({ viewingSchool: defaultValue });
  },
}));

export function useCategoryFilter() {
  return useUIStore((s) => s.categoryFilter);
}

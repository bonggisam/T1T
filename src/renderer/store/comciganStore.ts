import { create } from 'zustand';
import type { ComciganConfig, ComciganSchool, ComciganTimetableData, TeacherPeriod } from '@shared/types';

interface ComciganState {
  config: ComciganConfig | null;
  timetableData: ComciganTimetableData | null;
  searchResults: ComciganSchool[];
  loading: boolean;
  searching: boolean;
  error: string | null;
  unsubscribe: (() => void) | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  showTimetable: boolean;

  loadConfig: () => Promise<void>;
  searchSchool: (name: string) => Promise<void>;
  configure: (config: ComciganConfig) => Promise<void>;
  fetchTimetable: () => Promise<void>;
  clearConfig: () => Promise<void>;
  cleanup: () => void;
  getPeriodsForWeekday: (weekday: number) => TeacherPeriod[];
  toggleTimetable: () => void;
}

export const useComciganStore = create<ComciganState>((set, get) => ({
  config: null,
  timetableData: null,
  searchResults: [],
  loading: false,
  searching: false,
  error: null,
  unsubscribe: null,
  refreshTimer: null,
  showTimetable: (() => {
    try { return localStorage.getItem('tonet-show-timetable') !== 'false'; }
    catch (e) { console.warn('[Comcigan] localStorage read failed:', e); return true; }
  })(),

  loadConfig: async () => {
    try {
      set({ error: null });
      const config = await window.electronAPI?.comciganGetConfig() ?? null;
      let cached = await window.electronAPI?.comciganGetCached() ?? null;

      // If config exists but no cached data, trigger a fresh fetch
      if (config && !cached) {
        try {
          cached = await window.electronAPI?.comciganFetch() ?? null;
        } catch (fetchErr: any) {
          console.warn('[ComciganStore] Fetch failed:', fetchErr);
          set({ error: fetchErr?.message || '시간표를 가져올 수 없습니다' });
        }
      }

      set({ config, timetableData: cached });

      // Subscribe to auto-refresh updates from main process
      const unsub = window.electronAPI?.onComciganUpdate((data) => {
        set({ timetableData: data });
      });
      set({ unsubscribe: unsub ?? null });

      // 5분마다 자동 갱신 (렌더러 측)
      const prevTimer = get().refreshTimer;
      if (prevTimer) clearInterval(prevTimer);
      if (config) {
        const timer = setInterval(async () => {
          try {
            const data = await window.electronAPI?.comciganFetch() ?? null;
            if (data) set({ timetableData: data });
          } catch (err) {
            console.warn('[ComciganStore] Auto-refresh failed:', err);
          }
        }, 5 * 60 * 1000);
        set({ refreshTimer: timer });
      }
    } catch (err: any) {
      console.error('[ComciganStore] loadConfig error:', err);
      set({ error: err?.message || '시간표 설정 로드 실패' });
    }
  },

  searchSchool: async (name: string) => {
    set({ searching: true, error: null, searchResults: [] });
    try {
      const results = await window.electronAPI?.comciganSearch(name) ?? [];
      set({ searchResults: results, searching: false });
    } catch (err: any) {
      set({ searching: false, error: err?.message || '검색 실패' });
    }
  },

  configure: async (config: ComciganConfig) => {
    set({ loading: true, error: null });
    try {
      await window.electronAPI?.comciganConfigure(config);
      const data = await window.electronAPI?.comciganGetCached() ?? null;
      set({ config, timetableData: data, loading: false, searchResults: [] });
    } catch (err: any) {
      set({ loading: false, error: err?.message || '설정 실패' });
    }
  },

  fetchTimetable: async () => {
    set({ loading: true, error: null });
    try {
      const data = await window.electronAPI?.comciganFetch() ?? null;
      set({ timetableData: data, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err?.message || '시간표 가져오기 실패' });
    }
  },

  clearConfig: async () => {
    await window.electronAPI?.comciganClear();
    set({ config: null, timetableData: null, searchResults: [], error: null });
  },

  cleanup: () => {
    const { unsubscribe, refreshTimer } = get();
    unsubscribe?.();
    if (refreshTimer) clearInterval(refreshTimer);
    set({ unsubscribe: null, refreshTimer: null });
  },

  // Get teacher's periods for a specific weekday (1=Mon, 5=Fri)
  getPeriodsForWeekday: (weekday: number): TeacherPeriod[] => {
    const { timetableData, showTimetable } = get();
    if (!showTimetable || !timetableData) return [];
    return timetableData.teacherSchedule.filter((p) => p.weekday === weekday);
  },

  toggleTimetable: () => {
    const next = !get().showTimetable;
    try { localStorage.setItem('tonet-show-timetable', String(next)); }
    catch (e) { console.warn('[Comcigan] localStorage write failed:', e); }
    set({ showTimetable: next });
  },
}));

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

  loadConfig: () => Promise<void>;
  searchSchool: (name: string) => Promise<void>;
  configure: (config: ComciganConfig) => Promise<void>;
  fetchTimetable: () => Promise<void>;
  clearConfig: () => Promise<void>;
  cleanup: () => void;
  getPeriodsForWeekday: (weekday: number) => TeacherPeriod[];
}

export const useComciganStore = create<ComciganState>((set, get) => ({
  config: null,
  timetableData: null,
  searchResults: [],
  loading: false,
  searching: false,
  error: null,
  unsubscribe: null,

  loadConfig: async () => {
    try {
      const config = await window.electronAPI?.comciganGetConfig() ?? null;
      const cached = await window.electronAPI?.comciganGetCached() ?? null;
      set({ config, timetableData: cached });

      // Subscribe to auto-refresh updates from main process
      const unsub = window.electronAPI?.onComciganUpdate((data) => {
        set({ timetableData: data });
      });
      set({ unsubscribe: unsub ?? null });
    } catch {}
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
    const { unsubscribe } = get();
    unsubscribe?.();
    set({ unsubscribe: null });
  },

  // Get teacher's periods for a specific weekday (1=Mon, 5=Fri)
  getPeriodsForWeekday: (weekday: number): TeacherPeriod[] => {
    const { timetableData } = get();
    if (!timetableData) return [];
    return timetableData.teacherSchedule.filter((p) => p.weekday === weekday);
  },
}));

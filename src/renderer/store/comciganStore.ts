import { create } from 'zustand';
import type { ComciganConfig, ComciganSchool, ComciganTimetableData, TeacherPeriod } from '@shared/types';
import { diffTimetable, formatTimetableChange, mergeTimetableChanges, type TimetableChange } from '../utils/classPeriods';
import { useWidgetStore } from './widgetStore';
import { useAuthStore } from './authStore';
import { isPersonalHidden } from './privacyStore';
import { showToast } from '../components/common/Toast';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';

// 메인 프로세스는 시간표를 메모리에만 들고 있어, 네트워크 없이 켜면 시간표를 모른다.
// 그러면 수업 화면 보호가 동작하지 않고 꺼져 있던 동안의 변경도 알 수 없으므로 이 PC에 마지막 값을 둔다.
const TIMETABLE_CACHE_KEY = 't1t-timetable-cache';
const CHANGES_KEY = 't1t-timetable-changes';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.warn('[Comcigan] localStorage read failed:', e);
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[Comcigan] localStorage write failed:', e);
  }
}

function readCachedTimetable(): ComciganTimetableData | null {
  const data = readJson<ComciganTimetableData>(TIMETABLE_CACHE_KEY);
  return data && Array.isArray(data.teacherSchedule) ? data : null;
}

function readChanges(): TimetableChange[] {
  const list = readJson<TimetableChange[]>(CHANGES_KEY);
  return Array.isArray(list) ? mergeTimetableChanges(list.filter(Boolean), []) : [];
}

// 학교나 교사를 새로 설정하는 동안 오는 갱신은 시간표 변경이 아니다
let configuring = false;

/** 자동 갱신으로 받은 시간표가 이번 주 남은 수업과 다르면 기록하고 알린다 */
function notifyTimetableChanges(prev: ComciganTimetableData | null, next: ComciganTimetableData | null): void {
  if (configuring || !useWidgetStore.getState().timetableChangeAlert) return;
  const now = new Date();
  const found = diffTimetable(prev, next, now);
  if (found.length === 0) return;

  const changes = mergeTimetableChanges(useComciganStore.getState().changes, found, now);
  useComciganStore.setState({ changes });
  writeJson(CHANGES_KEY, changes);

  const lines = found.map(formatTimetableChange);
  const summary = lines.length === 1 ? lines[0] : `${lines[0]} 외 ${lines.length - 1}건`;
  // 확인할 때까지 화면에 남는 줄이 있으므로, 수업 중에는 토스트로 끼어들지 않는다
  if (!isPersonalHidden()) showToast(`시간표 변경: ${summary}`, 'info');
  if (useAuthStore.getState().user?.settings?.notificationSound) playNotificationSound();
  showDesktopNotification('내 수업이 바뀌었습니다', lines.slice(0, 4).join('\n'));
}

interface ComciganState {
  config: ComciganConfig | null;
  timetableData: ComciganTimetableData | null;
  /** 확인하지 않은 내 수업 변경 */
  changes: TimetableChange[];
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
  acknowledgeChanges: () => void;
}

export const useComciganStore = create<ComciganState>((set, get) => ({
  config: null,
  timetableData: readCachedTimetable(),
  changes: readChanges(),
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

      // 지금 받지 못했으면 이 PC에 남은 마지막 시간표를 쓴다. 설정이 없으면 비운다.
      const previous = get().timetableData;
      const usable = previous && config && previous.schoolName === config.schoolName ? previous : null;
      if (cached) notifyTimetableChanges(usable, cached);
      set({ config, timetableData: config ? cached ?? usable : null });

      // Subscribe to auto-refresh updates from main process
      get().unsubscribe?.();
      const unsub = window.electronAPI?.onComciganUpdate((data) => {
        notifyTimetableChanges(get().timetableData, data);
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
            if (data) {
              notifyTimetableChanges(get().timetableData, data);
              set({ timetableData: data });
            }
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
    configuring = true;
    try {
      await window.electronAPI?.comciganConfigure(config);
      const data = await window.electronAPI?.comciganGetCached() ?? null;
      writeJson(CHANGES_KEY, null);
      set({ config, timetableData: data, changes: [], loading: false, searchResults: [] });
    } catch (err: any) {
      set({ loading: false, error: err?.message || '설정 실패' });
    } finally {
      configuring = false;
    }
  },

  fetchTimetable: async () => {
    set({ loading: true, error: null });
    try {
      const data = await window.electronAPI?.comciganFetch() ?? null;
      notifyTimetableChanges(get().timetableData, data);
      set({ timetableData: data, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err?.message || '시간표 가져오기 실패' });
    }
  },

  clearConfig: async () => {
    await window.electronAPI?.comciganClear();
    writeJson(CHANGES_KEY, null);
    set({ config: null, timetableData: null, changes: [], searchResults: [], error: null });
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

  acknowledgeChanges: () => {
    writeJson(CHANGES_KEY, null);
    set({ changes: [] });
  },
}));

// 시간표가 바뀔 때마다 이 PC에 마지막 값을 남긴다. 비워지면 지운다.
useComciganStore.subscribe((state, prev) => {
  if (state.timetableData !== prev.timetableData) writeJson(TIMETABLE_CACHE_KEY, state.timetableData);
});

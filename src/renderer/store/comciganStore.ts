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
// 사람마다 따로 둔다. 앞 교사의 시간표로 다음 교사의 수업 화면 보호가 돌면 안 된다.
const LEGACY_CACHE_KEY = 't1t-timetable-cache';
const LEGACY_CHANGES_KEY = 't1t-timetable-changes';
const cacheKey = (userId: string) => `${LEGACY_CACHE_KEY}-${userId}`;
const changesKey = (userId: string) => `${LEGACY_CHANGES_KEY}-${userId}`;
let boundUser: string | null = null;

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

/** 예전에는 PC에 하나였다. 업데이트 뒤 처음 로그인한 사람에게 넘긴다 */
function readClaimingLegacy<T>(key: string, legacyKey: string): T | null {
  const own = readJson<T>(key);
  if (own !== null) return own;
  const legacy = readJson<T>(legacyKey);
  if (legacy !== null) {
    writeJson(key, legacy);
    writeJson(legacyKey, null);
  }
  return legacy;
}

function readCachedTimetable(userId: string): ComciganTimetableData | null {
  const data = readClaimingLegacy<ComciganTimetableData>(cacheKey(userId), LEGACY_CACHE_KEY);
  return data && Array.isArray(data.teacherSchedule) ? data : null;
}

function readChanges(userId: string): TimetableChange[] {
  const list = readClaimingLegacy<TimetableChange[]>(changesKey(userId), LEGACY_CHANGES_KEY);
  return Array.isArray(list) ? mergeTimetableChanges(list.filter(Boolean), []) : [];
}

function saveChanges(changes: TimetableChange[] | null): void {
  if (boundUser) writeJson(changesKey(boundUser), changes);
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
  saveChanges(changes);

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

  /** 로그인한 사람의 설정과 마지막 시간표를 읽는다 */
  loadConfig: (userId?: string) => Promise<void>;
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
  timetableData: null,
  changes: [],
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

  loadConfig: async (userId) => {
    try {
      set({ error: null });
      if (userId && userId !== boundUser) {
        boundUser = userId;
        set({ timetableData: readCachedTimetable(userId), changes: readChanges(userId) });
        await window.electronAPI?.comciganSetUser?.(userId);
      }
      const owner = boundUser;
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

      // 받는 사이 로그아웃했으면 다음 교사에게 넘기지 않는다
      if (boundUser !== owner) return;

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
      saveChanges(null);
      set({ config, timetableData: data, changes: [], loading: false, searchResults: [] });
    } catch (err: any) {
      set({ loading: false, error: err?.message || '설정 실패' });
    } finally {
      configuring = false;
    }
  },

  fetchTimetable: async () => {
    set({ loading: true, error: null });
    const startedAt = Date.now();
    try {
      const data = await window.electronAPI?.comciganFetch() ?? null;
      // 받지 못하면 메인이 전에 받은 값이나 빈 값을 돌려준다. 지금 시간표를 지우거나 성공처럼 보이면 안 된다
      if (!data || new Date(data.lastUpdated).getTime() < startedAt - 1000) {
        set({ loading: false, error: '컴시간에 연결하지 못했습니다. 전에 받은 시간표를 그대로 씁니다.' });
        return;
      }
      notifyTimetableChanges(get().timetableData, data);
      set({ timetableData: data, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err?.message || '시간표 가져오기 실패' });
    }
  },

  clearConfig: async () => {
    await window.electronAPI?.comciganClear();
    saveChanges(null);
    set({ config: null, timetableData: null, changes: [], searchResults: [], error: null });
  },

  cleanup: () => {
    const { unsubscribe, refreshTimer } = get();
    unsubscribe?.();
    if (refreshTimer) clearInterval(refreshTimer);
    // 먼저 주인을 비워, 화면에서 비운 값이 그 사람의 저장본을 지우지 않게 한다
    boundUser = null;
    set({ unsubscribe: null, refreshTimer: null, config: null, timetableData: null, changes: [], error: null, searchResults: [] });
    window.electronAPI?.comciganSetUser?.(null)?.catch?.(() => {});
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
    saveChanges(null);
    set({ changes: [] });
  },
}));

// 시간표가 바뀔 때마다 이 PC에 마지막 값을 남긴다. 비워지면 지운다.
useComciganStore.subscribe((state, prev) => {
  if (boundUser && state.timetableData !== prev.timetableData) writeJson(cacheKey(boundUser), state.timetableData);
});

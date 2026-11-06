import { create } from 'zustand';
import { onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { SCHOOL_LABELS } from '@shared/types';
import type {
  ComciganConfig, ComciganTimetableData, School, TeacherPeriod, TeachingAssignment, TeachingItem, TeachingSlot, User,
} from '@shared/types';
import { diffTimetable, formatTimetableChange, mergeTimetableChanges, type TimetableChange } from '../utils/classPeriods';
import { useWidgetStore } from './widgetStore';
import { useAuthStore } from './authStore';
import { isPersonalHidden } from './privacyStore';
import { showToast } from '../components/common/Toast';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';
import { getNeisConfig } from '../utils/neisSchedule';
import { loadNeisWeek, NEIS_REFRESH_MS, timetableWeekStart, type NeisWeek } from '../utils/neisTimetable';
import {
  buildTeacherSchedule, deriveItemsFromSchedule, parseOwnItems, resolveItems, teacherKey,
} from '../utils/teachingAssignments';
import {
  parseAssignmentDoc, parseClassTimesDoc, saveAssignment, saveClassTimes, schoolTimesDoc, teacherDoc,
} from '../utils/teachingDocs';

// 시간표는 나이스에서 받아 담당 학급 표(학교와 이름으로 찾는다)와 맞춰 내 수업을 만든다.
// 받지 못해도 수업 화면 보호가 돌도록 이 PC에 마지막 값을 둔다.
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

/** 표와 시정표의 첫 값을 이만큼만 기다린다. 오프라인에서도 저장된 시간표로 시작한다 */
const FIRST_READ_TIMEOUT_MS = 12 * 1000;
const CHECK_MS = 10 * 60 * 1000;

let listeners: Array<() => void> = [];
/** 마지막으로 받은 학교 시간표. 표가 바뀌면 다시 받지 않고 이 값으로 다시 맞춘다 */
let lastWeek: NeisWeek | null = null;

function schoolOf(user: User | null | undefined): School | null {
  return user?.school === 'taeseong_middle' || user?.school === 'taeseong_high' ? user.school : null;
}

function configOf(user: User, school: School): ComciganConfig {
  return {
    schoolCode: Number(getNeisConfig(school)?.school) || 0,
    schoolName: SCHOOL_LABELS[school],
    teacherName: user.name || '',
    maxGrade: 3,
  };
}

/** 자동 갱신으로 받은 시간표가 이번 주 남은 수업과 다르면 기록하고 알린다 */
function notifyTimetableChanges(prev: ComciganTimetableData | null, next: ComciganTimetableData | null): void {
  if (!useWidgetStore.getState().timetableChangeAlert) return;
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

/**
 * 받은 학교 시간표와 내 담당 학급으로 내 수업을 만든다.
 * 담당 학급이 아직 없고 이 PC에 전에 받은 내 시간표가 있으면, 그것으로 담당 학급을 만들어 표에 올린다.
 * @param quiet 표가 바뀌어 다시 맞출 때. 수업 변경 알림을 내지 않는다
 */
function applyWeek(user: User, school: School, week: NeisWeek, quiet = false): void {
  const state = useComciganStore.getState();
  const prev = state.timetableData;
  const name = teacherKey(user.name || '');
  let items: TeachingItem[] = state.assignment?.items ?? [];
  let slots: TeachingSlot[] = state.assignment?.slots ?? [];

  if (items.length === 0 && slots.length === 0 && name && prev?.source !== 'neis' && prev?.teacherSchedule.length) {
    const derived = deriveItemsFromSchedule(prev.teacherSchedule, week.cells);
    console.info(`[Timetable] 전에 받은 시간표 ${derived.total}칸 중 ${derived.matched}칸이 나이스와 맞습니다`);
    if (derived.items.length > 0 || derived.slots.length > 0) {
      ({ items, slots } = derived);
      saveAssignment(school, name, items, slots, 'timetable', user.id)
        .catch((err) => console.warn('[Timetable] assignment save failed:', err));
    }
  }

  const prevTimes = prev?.classTimes ?? [];
  const classTimes = state.schoolClassTimes.length > 0 ? state.schoolClassTimes : prevTimes;
  // 시정표가 학교에 아직 없으면 이 PC에 남은 값을 올린다. 나이스에는 시정표가 없다
  if (state.schoolClassTimes.length === 0 && prevTimes.length > 0) {
    saveClassTimes(school, prevTimes, user.id).catch((err) => console.warn('[Timetable] class times save failed:', err));
  }

  if (items.length === 0 && slots.length === 0) {
    // 표에서 빠졌으면 비운다. 전에 컴시간에서 받은 값은 담당 학급을 찾을 때까지 그대로 쓴다
    if (prev?.source === 'neis') useComciganStore.setState({ timetableData: null, config: null });
    else useComciganStore.setState({ config: prev ? configOf(user, school) : null });
    return;
  }

  const data: ComciganTimetableData = {
    teacherSchedule: buildTeacherSchedule(week.cells, items, classTimes, slots),
    classTimes,
    lastUpdated: week.fetchedAt,
    schoolName: SCHOOL_LABELS[school],
    source: 'neis',
    weekStart: week.weekStart,
  };
  // 컴시간 자료에서 넘어올 때나 주가 바뀔 때는 수업 변경이 아니다
  if (!quiet && prev?.source === 'neis' && prev.weekStart === data.weekStart) notifyTimetableChanges(prev, data);
  useComciganStore.setState({ timetableData: data, config: configOf(user, school) });
}

/**
 * 나이스에서 받아 내 수업을 맞춘다.
 * @param force 새로고침 단추처럼 사람이 눌렀을 때
 * @throws 받지 못하면. 같은 주의 저장본이 있으면 그 값으로 맞춘 뒤에 던진다
 */
async function syncTimetable(force: boolean): Promise<void> {
  const user = useAuthStore.getState().user;
  const school = schoolOf(user);
  if (!user || !school || user.id !== boundUser) return;
  const owner = boundUser;
  const week = await loadNeisWeek(school, force);
  // 받는 사이 로그아웃했으면 다음 교사에게 넘기지 않는다
  if (boundUser !== owner) return;
  lastWeek = week;
  applyWeek(user, school, week);
  if (week.error) throw week.error;
}

export interface SaveOwnItemsResult {
  ok: boolean;
  badLines: string[];
  /** 나이스 시간표의 그 학급에서 찾지 못한 과목 */
  unknown: TeachingItem[];
}

interface ComciganState {
  config: ComciganConfig | null;
  timetableData: ComciganTimetableData | null;
  /** 확인하지 않은 내 수업 변경 */
  changes: TimetableChange[];
  /** 내 담당 과목과 학급. 표에 아직 없으면 null */
  assignment: TeachingAssignment | null;
  /** 표를 한 번 읽었다. 그 전에는 담당 학급이 없다고 말하지 않는다 */
  assignmentChecked: boolean;
  /** 학교 시정표 */
  schoolClassTimes: string[];
  loading: boolean;
  error: string | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  showTimetable: boolean;

  /** 로그인한 사람의 표와 마지막 시간표를 읽고 나이스에서 받는다 */
  loadConfig: (userId?: string) => Promise<void>;
  fetchTimetable: () => Promise<void>;
  /** 본인이 담당 과목과 학급을 넣는다. 줄마다 "국어 2-1 2-3" */
  saveOwnItems: (text: string) => Promise<SaveOwnItemsResult>;
  cleanup: () => void;
  getPeriodsForWeekday: (weekday: number) => TeacherPeriod[];
  toggleTimetable: () => void;
  acknowledgeChanges: () => void;
}

export const useComciganStore = create<ComciganState>((set, get) => ({
  config: null,
  timetableData: null,
  changes: [],
  assignment: null,
  assignmentChecked: false,
  schoolClassTimes: [],
  loading: false,
  error: null,
  refreshTimer: null,
  showTimetable: (() => {
    try { return localStorage.getItem('tonet-show-timetable') !== 'false'; }
    catch (e) { console.warn('[Comcigan] localStorage read failed:', e); return true; }
  })(),

  loadConfig: async (userId) => {
    const user = useAuthStore.getState().user;
    const school = schoolOf(user);
    set({ error: null });
    if (!user || !school || !userId || user.id !== userId) return;

    if (userId !== boundUser) {
      boundUser = userId;
      lastWeek = null;
      const cached = readCachedTimetable(userId);
      set({
        timetableData: cached,
        changes: readChanges(userId),
        assignment: null,
        assignmentChecked: false,
        schoolClassTimes: [],
        config: cached ? configOf(user, school) : null,
      });
    }
    const owner = boundUser;

    listeners.forEach((stop) => stop());
    let pending = 2;
    let settled = false;
    const ready = new Promise<void>((resolve) => {
      const done = () => { if (!settled) { settled = true; resolve(); } };
      const timeout = setTimeout(done, FIRST_READ_TIMEOUT_MS);
      const once = (fired: { value: boolean }) => {
        if (fired.value) return;
        fired.value = true;
        pending -= 1;
        if (pending <= 0) { clearTimeout(timeout); done(); }
      };
      // 표가 바뀌면 다시 받지 않고 받아 둔 시간표로 맞춘다
      const reapply = () => {
        if (settled && lastWeek && boundUser === owner) applyWeek(user, school, lastWeek, true);
      };
      const firstAssignment = { value: false };
      const firstTimes = { value: false };
      const name = teacherKey(user.name || '');
      const stopAssignment = name
        ? onSnapshot(teacherDoc(school, name), (snap) => {
          set({
            assignment: snap.exists() ? parseAssignmentDoc(snap.id, snap.data()) : null,
            assignmentChecked: true,
          });
          once(firstAssignment);
          reapply();
        }, (err) => {
          console.warn('[Timetable] assignment read failed:', err);
          set({ assignmentChecked: true });
          once(firstAssignment);
        })
        : (() => { set({ assignmentChecked: true }); once(firstAssignment); return () => {}; })();
      const stopTimes = onSnapshot(schoolTimesDoc(school), (snap) => {
        set({ schoolClassTimes: snap.exists() ? parseClassTimesDoc(snap.data()) : [] });
        once(firstTimes);
        reapply();
      }, (err) => {
        console.warn('[Timetable] class times read failed:', err);
        once(firstTimes);
      });
      listeners = [stopAssignment, stopTimes];
    });
    await ready;
    if (boundUser !== owner) return;

    try {
      await syncTimetable(false);
    } catch (err: any) {
      console.warn('[Timetable] first sync failed:', err);
      set({ error: err?.message || '시간표를 받지 못했습니다' });
    }

    // 3시간마다, 그리고 주가 바뀌면 다시 받는다. 받아 둔 값이 새것이면 나이스에 묻지 않는다
    const prevTimer = get().refreshTimer;
    if (prevTimer) clearInterval(prevTimer);
    const timer = setInterval(() => {
      const data = get().timetableData;
      const fetchedAt = lastWeek ? new Date(lastWeek.fetchedAt).getTime() : 0;
      const newWeek = lastWeek?.weekStart !== format(timetableWeekStart(), 'yyyy-MM-dd');
      if (!newWeek && data && Date.now() - fetchedAt < NEIS_REFRESH_MS) return;
      syncTimetable(false).catch((err) => console.warn('[Timetable] refresh failed:', err));
    }, CHECK_MS);
    set({ refreshTimer: timer });
  },

  fetchTimetable: async () => {
    set({ loading: true, error: null });
    try {
      await syncTimetable(true);
      set({ loading: false });
    } catch (err: any) {
      const message = err?.message || '시간표를 받지 못했습니다';
      set({ loading: false, error: get().timetableData ? `${message}. 전에 받은 시간표를 그대로 씁니다.` : message });
    }
  },

  saveOwnItems: async (text) => {
    const user = useAuthStore.getState().user;
    const school = schoolOf(user);
    const { items, slots, badLines } = parseOwnItems(text);
    if (!user || !school || (items.length === 0 && slots.length === 0) || badLines.length > 0) {
      return { ok: false, badLines, unknown: [] };
    }
    const week = lastWeek ?? await loadNeisWeek(school).catch(() => null);
    const resolved = week ? resolveItems(items, week.cells) : { items, unknown: [] };
    await saveAssignment(school, teacherKey(user.name || ''), resolved.items, slots, 'self', user.id);
    return { ok: true, badLines: [], unknown: resolved.unknown };
  },

  cleanup: () => {
    const { refreshTimer } = get();
    listeners.forEach((stop) => stop());
    listeners = [];
    lastWeek = null;
    if (refreshTimer) clearInterval(refreshTimer);
    // 먼저 주인을 비워, 화면에서 비운 값이 그 사람의 저장본을 지우지 않게 한다
    boundUser = null;
    set({
      refreshTimer: null,
      config: null,
      timetableData: null,
      changes: [],
      assignment: null,
      assignmentChecked: false,
      schoolClassTimes: [],
      error: null,
    });
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

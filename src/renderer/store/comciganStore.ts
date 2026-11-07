import { create } from 'zustand';
import { onSnapshot } from 'firebase/firestore';
import { SCHOOL_LABELS } from '@shared/types';
import type {
  BaseTimetable, ComciganConfig, ComciganTimetableData, School, TeacherPeriod, TeachingAssignment, TeachingItem, TeachingSlot, User,
} from '@shared/types';
import {
  diffTimetable, formatTimetableChange, fromBaseChanges, mergeTimetableChanges, upcomingChanges, type TimetableChange,
} from '../utils/classPeriods';
import { useWidgetStore } from './widgetStore';
import { useAuthStore } from './authStore';
import { isPersonalHidden } from './privacyStore';
import { showToast } from '../components/common/Toast';
import { playNotificationSound, showDesktopNotification } from '../utils/notifications';
import { getNeisConfig } from '../utils/neisSchedule';
import { lastSyncSlot, loadNeisWeek, type NeisWeek } from '../utils/neisTimetable';
import { applyBaseWeek, type BaseChange, type BaseOffDay } from '../utils/baseTimetable';
import {
  assignmentMatchesSchedule, buildTeacherSchedule, deriveItemsFromSchedule, isThisSemester, parseOwnItems, resolveItems, teacherKey,
  toTeacherPeriods, usesBaseTimetable,
} from '../utils/teachingAssignments';
import {
  baseDoc, parseAssignmentDoc, parseBaseDoc, parseClassTimesDoc, saveAssignment, saveClassTimes, schoolTimesDoc, teacherDoc,
} from '../utils/teachingDocs';

// 시간표는 나이스에서 받아 내 수업을 만든다. 관리자가 컴시간 파일을 올렸으면 학교 기초 시간표를 나이스와 칸마다 대조하고,
// 아니면 담당 학급 표(학교와 이름으로 찾는다)와 맞춘다. 나이스는 매일 8시부터 16시까지 정각마다 다시 받는다.
// 받지 못해도 수업 화면 보호가 돌도록 이 PC에 마지막 값을 둔다.
// 사람마다 따로 둔다. 앞 교사의 시간표로 다음 교사의 수업 화면 보호가 돌면 안 된다.
const LEGACY_CACHE_KEY = 't1t-timetable-cache';
const LEGACY_CHANGES_KEY = 't1t-timetable-changes';
const cacheKey = (userId: string) => `${LEGACY_CACHE_KEY}-${userId}`;
const changesKey = (userId: string) => `${LEGACY_CHANGES_KEY}-${userId}`;
const comciganKey = (userId: string) => `t1t-timetable-comcigan-${userId}`;
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

/**
 * 전에 컴시간에서 받은 내 시간표. 교사별 시간은 나이스에 없어 다시 구할 수 없으므로
 * 나이스 값으로 바뀌는 저장본과 따로 둔다.
 */
interface ComciganRecord {
  teacherSchedule: TeacherPeriod[];
  lastUpdated: string;
  /** 표에 올렸거나 표와 같음을 확인했다. 그 뒤에 관리자가 표를 고쳐도 되돌리지 않는다 */
  uploaded: boolean;
}

function readComciganRecord(userId: string): ComciganRecord | null {
  const record = readJson<ComciganRecord>(comciganKey(userId));
  return record && Array.isArray(record.teacherSchedule) ? record : null;
}

function keepComciganRecord(userId: string, cached: ComciganTimetableData | null): void {
  if (!cached || cached.source === 'neis' || cached.teacherSchedule.length === 0) return;
  if (readComciganRecord(userId)) return;
  writeJson(comciganKey(userId), { teacherSchedule: cached.teacherSchedule, lastUpdated: cached.lastUpdated, uploaded: false });
}

function markComciganUploaded(userId: string, record: ComciganRecord): void {
  writeJson(comciganKey(userId), { ...record, uploaded: true });
}

/** 한 번 실패하면 이번 실행에는 다시 올리지 않는다. 다음 실행 때 다시 한다 */
let recordUpload: 'idle' | 'busy' | 'failed' = 'idle';

/** 표와 시정표의 첫 값을 이만큼만 기다린다. 오프라인에서도 저장된 시간표로 시작한다 */
const FIRST_READ_TIMEOUT_MS = 12 * 1000;
/** 받을 때가 되었는지 이만큼마다 본다. 나이스에 묻는 것은 정각마다 한 번이다 */
const TICK_MS = 60 * 1000;
/** 정각 뒤 이 PC가 기다리는 시간. 선생님 PC들이 같은 순간에 나이스에 묻지 않게 2분 안에서 고른다 */
const SYNC_SPREAD_MS = Math.floor(Math.random() * 2 * 60 * 1000);
/** 받지 못하면 이만큼 뒤에 다시 해 본다 */
const RETRY_MS = 10 * 60 * 1000;

let listeners: Array<() => void> = [];
/** 마지막으로 받은 학교 시간표. 표가 바뀌면 다시 받지 않고 이 값으로 다시 맞춘다 */
let lastWeek: NeisWeek | null = null;
/** 지금 받고 있는 수. 정각 받기와 새로고침이 겹칠 수 있다 */
let syncing = 0;
/** 마지막으로 받지 못한 때. 받으면 지운다 */
let lastFailureAt = 0;

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
  announceChanges(diffTimetable(prev, next, new Date()));
}

/** 그 주를 처음 기초 시간표로 맞출 때: 기초 시간표와 달라진 남은 수업을 알린다. 교체나 보강을 미리 알 수 있다 */
function notifyBaseChanges(changes: BaseChange[], data: ComciganTimetableData): void {
  if (!data.weekStart) return;
  announceChanges(upcomingChanges(fromBaseChanges(changes, data.weekStart), data.classTimes));
}

/** 같은 주를 다시 대조했을 때: 지난번과 달라진 칸을 알리고, 기초 시간표와 다른 칸이면 이유(보강, 교체)를 붙인다 */
function notifyBaseRecheck(prev: ComciganTimetableData, data: ComciganTimetableData, changes: BaseChange[]): void {
  const notes = new Map(fromBaseChanges(changes, data.weekStart ?? '').map((c) => [c.key, c.note]));
  announceChanges(diffTimetable(prev, data, new Date()).map((c) => {
    const note = notes.get(c.key);
    return note ? { ...c, note } : c;
  }));
}

function announceChanges(found: TimetableChange[]): void {
  if (!useWidgetStore.getState().timetableChangeAlert) return;
  const now = new Date();
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
 * 이 PC에 전에 받은 내 시간표가 있고 표가 그것과 다르면 표에 올린다. 본인이 직접 넣은 값은 건드리지 않고,
 * 표를 읽기 전에는 덮어쓰지 않는다. 올리지 못해도 이 PC에서는 그 시간표로 보여 준다.
 * @param quiet 표가 바뀌어 다시 맞출 때. 수업 변경 알림을 내지 않는다
 */
function applyWeek(user: User, school: School, week: NeisWeek, quiet = false): void {
  const state = useComciganStore.getState();
  const prev = state.timetableData;
  const name = teacherKey(user.name || '');
  let items: TeachingItem[] = state.assignment?.items ?? [];
  let slots: TeachingSlot[] = state.assignment?.slots ?? [];

  const record = readComciganRecord(user.id);
  if (record && !record.uploaded && state.assignmentChecked && state.assignment?.source === 'file') {
    // 관리자가 올린 컴시간 파일은 학교 전체 기초 시간표로 만들어 이 PC의 옛 기록보다 정확하다. 옛 기록은 더 올리지 않는다
    if (recordUpload === 'idle') markComciganUploaded(user.id, record);
  } else if (
    record && !record.uploaded && isThisSemester(record.lastUpdated)
    && name && state.assignmentChecked && state.assignment?.source !== 'self' && week.cells.length > 0
  ) {
    if (assignmentMatchesSchedule(record.teacherSchedule, week.cells, items, slots)) {
      // 올리는 중이면 화면에 먼저 반영된 값이라 서버가 받았는지 아직 모른다
      if (recordUpload === 'idle') markComciganUploaded(user.id, record);
    } else {
      const derived = deriveItemsFromSchedule(record.teacherSchedule, week.cells);
      ({ items, slots } = derived);
      if (recordUpload === 'idle') {
        console.info(`[Timetable] 전에 받은 시간표 ${derived.total}칸 중 ${derived.matched}칸이 나이스와 맞습니다`);
        const owner = user.id;
        recordUpload = 'busy';
        saveAssignment(school, name, items, slots, 'timetable', owner)
          .then(() => {
            markComciganUploaded(owner, record);
            if (boundUser === owner) recordUpload = 'idle';
          })
          .catch((err) => {
            console.warn('[Timetable] assignment save failed:', err);
            if (boundUser === owner) recordUpload = 'failed';
          });
      }
    }
  }

  const prevTimes = prev?.classTimes ?? [];
  const classTimes = state.schoolClassTimes.length > 0 ? state.schoolClassTimes : prevTimes;
  // 시정표가 학교에 아직 없으면 이 PC에 남은 값을 올린다. 나이스에는 시정표가 없다
  if (state.schoolClassTimes.length === 0 && prevTimes.length > 0) {
    saveClassTimes(school, prevTimes, user.id).catch((err) => console.warn('[Timetable] class times save failed:', err));
  }

  const baseLessons = state.base?.lessons ?? null;
  if (baseLessons && state.assignmentChecked && usesBaseTimetable(state.assignment?.source, baseLessons, name)) {
    // 학교 기초 시간표를 이번 주 나이스와 칸마다 대조한다. 바뀐 수업만 이번 주에 덧씌운다
    const applied = applyBaseWeek(baseLessons, week.cells, name);
    const data: ComciganTimetableData = {
      teacherSchedule: toTeacherPeriods(applied.lessons, classTimes),
      classTimes,
      lastUpdated: week.fetchedAt,
      schoolName: SCHOOL_LABELS[school],
      source: 'neis',
      weekStart: week.weekStart,
      basis: 'base',
    };
    if (!quiet) {
      const sameWeek = prev?.source === 'neis' && prev.weekStart === data.weekStart;
      // 같은 주를 다시 받았으면 지난번과 달라진 것을, 그 주를 처음 맞추면 기초 시간표와 달라진 것을 알린다
      if (sameWeek && prev?.basis === 'base') notifyBaseRecheck(prev, data, applied.changes);
      else notifyBaseChanges(applied.changes, data);
    }
    useComciganStore.setState({
      timetableData: data,
      config: configOf(user, school),
      weekChanges: applied.changes,
      weekOffDays: applied.stats.offDays,
    });
    return;
  }
  if (state.weekChanges.length > 0 || state.weekOffDays.length > 0) useComciganStore.setState({ weekChanges: [], weekOffDays: [] });

  if (items.length === 0 && slots.length === 0) {
    // 표에서 빠졌으면 비운다. 전에 컴시간에서 받은 값은 담당 학급을 찾을 때까지 그대로 쓰되, 지난 학기 값은 쓰지 않는다
    if (prev?.source === 'neis' || (prev && !isThisSemester(prev.lastUpdated))) useComciganStore.setState({ timetableData: null, config: null });
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
  // 컴시간 자료에서 넘어올 때나 주가 바뀔 때, 기초 시간표 대조에서 표로 바뀔 때는 수업 변경이 아니다
  if (!quiet && prev?.source === 'neis' && prev.weekStart === data.weekStart && prev.basis !== 'base') notifyTimetableChanges(prev, data);
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
  syncing += 1;
  try {
    const week = await loadNeisWeek(school, force);
    // 받는 사이 로그아웃했으면 다음 교사에게 넘기지 않는다
    if (boundUser !== owner) return;
    lastWeek = week;
    applyWeek(user, school, week);
    if (week.error) throw week.error;
    lastFailureAt = 0;
  } catch (err) {
    if (boundUser === owner) lastFailureAt = Date.now();
    throw err;
  } finally {
    syncing -= 1;
  }
}

/**
 * 정각 받기를 할 때인가. 마지막 받기 시각(8~16시 정각) 뒤에 받았으면 다음 정각까지 기다린다. 주가 바뀌어도 같다.
 * 정각이 지나면 이 PC의 차례까지 조금 기다리고, 받지 못했으면 10분 뒤에 다시 해 본다.
 */
function syncDue(now: Date): boolean {
  if (syncing > 0) return false;
  const slot = lastSyncSlot(now).getTime();
  const fetchedAt = lastWeek ? new Date(lastWeek.fetchedAt).getTime() : NaN;
  if (!Number.isNaN(fetchedAt) && fetchedAt >= slot && fetchedAt <= now.getTime() + 60 * 1000) return false;
  if (lastWeek && now.getTime() < slot + SYNC_SPREAD_MS) return false;
  return !lastFailureAt || now.getTime() - lastFailureAt >= RETRY_MS;
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
  /** 학교 기초 시간표. 컴시간 파일을 올린 적이 없거나 읽지 못하면 null */
  base: BaseTimetable | null;
  /** 이번 주 기초 시간표와 다른 내 수업. 기초 시간표로 대조할 때만 채운다 */
  weekChanges: BaseChange[];
  /** 이번 주 학교가 쉬는 요일 */
  weekOffDays: BaseOffDay[];
  loading: boolean;
  error: string | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  showTimetable: boolean;

  /** 로그인한 사람의 표와 마지막 시간표를 읽고 나이스에서 받는다 */
  loadConfig: (userId?: string) => Promise<void>;
  fetchTimetable: () => Promise<void>;
  /** 정각 받기를 할 때면 나이스에서 받는다. 1분마다 부른다 */
  checkSync: () => void;
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
  base: null,
  weekChanges: [],
  weekOffDays: [],
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
      lastFailureAt = 0;
      recordUpload = 'idle';
      const cached = readCachedTimetable(userId);
      keepComciganRecord(userId, cached);
      set({
        timetableData: cached,
        changes: readChanges(userId),
        assignment: null,
        assignmentChecked: false,
        schoolClassTimes: [],
        base: null,
        weekChanges: [],
        weekOffDays: [],
        config: cached ? configOf(user, school) : null,
      });
    }
    const owner = boundUser;

    listeners.forEach((stop) => stop());
    let pending = 3;
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
      // 기초 시간표는 관리자가 컴시간 파일을 올리면 생긴다. 규칙이 아직 없는 서버에서는 읽지 못하고 표로 맞춘다
      const firstBase = { value: false };
      const stopBase = onSnapshot(baseDoc(school), (snap) => {
        set({ base: snap.exists() ? parseBaseDoc(school, snap.data()) : null });
        once(firstBase);
        reapply();
      }, (err) => {
        console.warn('[Timetable] base timetable read failed:', err);
        set({ base: null });
        once(firstBase);
        reapply();
      });
      listeners = [stopAssignment, stopTimes, stopBase];
    });
    await ready;
    if (boundUser !== owner) return;

    try {
      await syncTimetable(false);
    } catch (err: any) {
      console.warn('[Timetable] first sync failed:', err);
      set({ error: err?.message || '시간표를 받지 못했습니다' });
    }

    // 매일 8시부터 16시까지 정각마다 다시 받는다. 1분마다 때가 되었는지만 보고, 나이스에는 정각마다 한 번 묻는다
    const prevTimer = get().refreshTimer;
    if (prevTimer) clearInterval(prevTimer);
    const timer = setInterval(() => get().checkSync(), TICK_MS);
    set({ refreshTimer: timer });
  },

  checkSync: () => {
    const user = useAuthStore.getState().user;
    if (!user || !boundUser || user.id !== boundUser || !syncDue(new Date())) return;
    // 한 번 받지 못한 것은 알리지 않는다. 정각을 두 번 넘게 놓치면 오래된 시간표 안내가 나온다
    syncTimetable(false)
      .then(() => { if (get().error) set({ error: null }); })
      .catch((err) => console.warn('[Timetable] scheduled sync failed:', err));
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
    lastFailureAt = 0;
    if (refreshTimer) clearInterval(refreshTimer);
    // 먼저 주인을 비워, 화면에서 비운 값이 그 사람의 저장본을 지우지 않게 한다
    boundUser = null;
    recordUpload = 'idle';
    set({
      refreshTimer: null,
      config: null,
      timetableData: null,
      changes: [],
      assignment: null,
      assignmentChecked: false,
      schoolClassTimes: [],
      base: null,
      weekChanges: [],
      weekOffDays: [],
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

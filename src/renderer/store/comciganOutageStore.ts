import { create } from 'zustand';
import { format } from 'date-fns';
import { doc, increment, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

/** 운영자가 컴시간 쪽 사정을 확인할 곳 */
export const COMCIGAN_SUPPORT_URL = 'https://comcigan.co.kr/xe/?mid=FAQ';

const CALLED_KEY = 't1t-comcigan-called';
const DISMISSED_KEY = 't1t-comcigan-dismissed';

export interface OutageAlert {
  /** 운영자가 확인한 뒤 들어온 알림 수 */
  count: number;
  reportedAt: Date | null;
  school: string;
  appVersion: string;
}

function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function readDay(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDay(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('[ComciganOutage] localStorage write failed:', e);
  }
}

function alertDoc() {
  return doc(db, 'app_meta', 'comcigan_outage');
}

interface ComciganOutageState {
  /** 이 PC에서 시간표를 오래 받지 못하고 있다 */
  outage: boolean;
  /** 운영자에게 알린 날. 하루 한 번만 알린다 */
  calledOn: string | null;
  /** 줄을 닫은 날 */
  dismissedOn: string | null;
  /** 운영자에게 보이는 알림 */
  alert: OutageAlert | null;
  unsubscribe: (() => void) | null;

  setOutage: (outage: boolean) => void;
  /** 운영자에게 알린다. 누가 알렸는지는 남기지 않고 학교와 앱 버전만 남긴다. */
  call: (school: string) => Promise<void>;
  dismissToday: () => void;
  subscribeAlert: () => void;
  cleanupAlert: () => void;
  acknowledge: () => Promise<void>;
}

export const useComciganOutageStore = create<ComciganOutageState>((set, get) => ({
  outage: false,
  calledOn: readDay(CALLED_KEY),
  dismissedOn: readDay(DISMISSED_KEY),
  alert: null,
  unsubscribe: null,

  setOutage: (outage) => {
    if (get().outage !== outage) set({ outage });
  },

  call: async (school) => {
    const appVersion = (await window.electronAPI?.getAppVersion().catch(() => '')) ?? '';
    await setDoc(alertDoc(), {
      count: increment(1),
      reportedAt: serverTimestamp(),
      school,
      appVersion,
    }, { merge: true });
    const day = today();
    writeDay(CALLED_KEY, day);
    set({ calledOn: day });
  },

  dismissToday: () => {
    const day = today();
    writeDay(DISMISSED_KEY, day);
    set({ dismissedOn: day });
  },

  subscribeAlert: () => {
    get().unsubscribe?.();
    const unsubscribe = onSnapshot(alertDoc(), (snap) => {
      const data = snap.exists() ? snap.data() : null;
      set({
        alert: data
          ? {
            count: Number(data.count) || 0,
            reportedAt: data.reportedAt?.toDate?.() ?? null,
            school: data.school || '',
            appVersion: data.appVersion || '',
          }
          : null,
      });
    }, (err) => console.warn('[ComciganOutage] subscription error:', err));
    set({ unsubscribe });
  },

  cleanupAlert: () => {
    get().unsubscribe?.();
    set({ unsubscribe: null, alert: null });
  },

  acknowledge: async () => {
    await setDoc(alertDoc(), { count: 0, acknowledgedAt: serverTimestamp() }, { merge: true });
  },
}));

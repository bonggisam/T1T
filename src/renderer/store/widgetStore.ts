import { create } from 'zustand';

/**
 * 오늘 화면 위젯 설정 (날씨·D-Day·다음 수업·수업 알림).
 * 개인 PC 단위 설정이라 Firestore가 아닌 localStorage에 저장.
 */

export interface CustomDDay {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
}

export interface WidgetPrefs {
  showWeather: boolean;
  showDDay: boolean;
  showNextClass: boolean;
  /** 수업 시작 n분 전 알림 (0 = 끔) */
  classReminderMin: number;
  /** 컴시간 시간표 변경 감지 알림 */
  timetableChangeAlert: boolean;
  /** 내 시험감독 차례 미리 알림 */
  dutyReminder: boolean;
  /** Ctrl+Shift+C로 편집 모드 전환. Word, PowerPoint의 서식 복사와 겹쳐 끌 수 있다 */
  editShortcut: boolean;
  customDDays: CustomDDay[];
  /** 숨긴 자동 D-Day 키 (`제목|YYYY-MM-DD`) */
  hiddenAutoDDays: string[];
}

const STORAGE_KEY = 'tonet-widget-prefs';
/** 직접 넣은 D-Day는 사람마다 따로 둔다. 공용 PC에서 다음 교사에게 보이면 안 된다 */
const personalKey = (userId: string) => `t1t-ddays-${userId}`;

type PersonalPrefs = Pick<WidgetPrefs, 'customDDays' | 'hiddenAutoDDays'>;
const NO_PERSONAL_PREFS: PersonalPrefs = { customDDays: [], hiddenAutoDDays: [] };

const DEFAULT_PREFS: WidgetPrefs = {
  showWeather: true,
  showDDay: true,
  showNextClass: true,
  classReminderMin: 5,
  timetableChangeAlert: true,
  dutyReminder: true,
  editShortcut: true,
  customDDays: [],
  hiddenAutoDDays: [],
};

function readStored(): Partial<WidgetPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[Widget] localStorage read failed:', e);
  }
  return {};
}

/** 로그인 전에는 D-Day를 올리지 않는다 */
function loadPrefs(): WidgetPrefs {
  return { ...DEFAULT_PREFS, ...readStored(), ...NO_PERSONAL_PREFS };
}

function loadPersonalPrefs(userId: string): PersonalPrefs {
  try {
    const raw = localStorage.getItem(personalKey(userId));
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        customDDays: Array.isArray(saved.customDDays) ? saved.customDDays : [],
        hiddenAutoDDays: Array.isArray(saved.hiddenAutoDDays) ? saved.hiddenAutoDDays : [],
      };
    }
    // 예전에는 PC 공용 키에 있었다. 업데이트 뒤 처음 로그인한 사람에게 넘기고 지운다
    const { customDDays, hiddenAutoDDays, ...rest } = readStored();
    if (customDDays || hiddenAutoDDays) {
      const claimed = { customDDays: customDDays ?? [], hiddenAutoDDays: hiddenAutoDDays ?? [] };
      localStorage.setItem(personalKey(userId), JSON.stringify(claimed));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
      return claimed;
    }
  } catch (e) {
    console.warn('[Widget] personal prefs read failed:', e);
  }
  return NO_PERSONAL_PREFS;
}

interface WidgetState extends WidgetPrefs {
  setPref: <K extends keyof WidgetPrefs>(key: K, value: WidgetPrefs[K]) => void;
  addCustomDDay: (title: string, date: string) => void;
  removeCustomDDay: (id: string) => void;
  hideAutoDDay: (key: string) => void;
  resetHiddenAutoDDays: () => void;
  /** 로그인한 사람의 D-Day를 올린다. 로그아웃하면 null로 불러 비운다 */
  bindUser: (userId: string | null) => void;
}

export const useWidgetStore = create<WidgetState>((set, get) => {
  let boundUser: string | null = null;

  const persist = (patch: Partial<WidgetPrefs>) => {
    set(patch);
    const {
      setPref, addCustomDDay, removeCustomDDay, hideAutoDDay, resetHiddenAutoDDays, bindUser,
      customDDays, hiddenAutoDDays, ...prefs
    } = get();
    try {
      // 아직 아무도 가져가지 않은 예전 D-Day는 그대로 둔다
      const stored = readStored();
      const legacy = boundUser ? {} : { customDDays: stored.customDDays, hiddenAutoDDays: stored.hiddenAutoDDays };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, ...legacy }));
      if (boundUser) localStorage.setItem(personalKey(boundUser), JSON.stringify({ customDDays, hiddenAutoDDays }));
    } catch (e) { console.warn('[Widget] localStorage write failed:', e); }
  };

  return {
    ...loadPrefs(),

    setPref: (key, value) => persist({ [key]: value } as Partial<WidgetPrefs>),

    addCustomDDay: (title, date) => persist({
      customDDays: [...get().customDDays, { id: `dd_${Date.now()}`, title: title.trim(), date }],
    }),

    removeCustomDDay: (id) => persist({
      customDDays: get().customDDays.filter((d) => d.id !== id),
    }),

    hideAutoDDay: (key) => persist({
      hiddenAutoDDays: [...new Set([...get().hiddenAutoDDays, key])],
    }),

    resetHiddenAutoDDays: () => persist({ hiddenAutoDDays: [] }),

    bindUser: (userId) => {
      boundUser = userId;
      set(userId ? loadPersonalPrefs(userId) : NO_PERSONAL_PREFS);
    },
  };
});

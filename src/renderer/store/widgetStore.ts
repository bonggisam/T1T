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
  customDDays: CustomDDay[];
  /** 숨긴 자동 D-Day 키 (`제목|YYYY-MM-DD`) */
  hiddenAutoDDays: string[];
}

const STORAGE_KEY = 'tonet-widget-prefs';

const DEFAULT_PREFS: WidgetPrefs = {
  showWeather: true,
  showDDay: true,
  showNextClass: true,
  classReminderMin: 5,
  timetableChangeAlert: true,
  customDDays: [],
  hiddenAutoDDays: [],
};

function loadPrefs(): WidgetPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('[Widget] localStorage read failed:', e);
  }
  return DEFAULT_PREFS;
}

interface WidgetState extends WidgetPrefs {
  setPref: <K extends keyof WidgetPrefs>(key: K, value: WidgetPrefs[K]) => void;
  addCustomDDay: (title: string, date: string) => void;
  removeCustomDDay: (id: string) => void;
  hideAutoDDay: (key: string) => void;
  resetHiddenAutoDDays: () => void;
}

export const useWidgetStore = create<WidgetState>((set, get) => {
  const persist = (patch: Partial<WidgetPrefs>) => {
    set(patch);
    const { setPref, addCustomDDay, removeCustomDDay, hideAutoDDay, resetHiddenAutoDDays, ...prefs } = get();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); }
    catch (e) { console.warn('[Widget] localStorage write failed:', e); }
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
  };
});

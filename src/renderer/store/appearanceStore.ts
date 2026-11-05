import { create } from 'zustand';
import { plateFloor, THEME_PRESETS, themeTokens, type ThemeChoice, type ThemePresetKey } from '../utils/themes';
import { applyPlate } from '../utils/displayPrefs';
import { useAuthStore } from './authStore';
import type { AppearanceChoices, UserSettings } from '@shared/types';

export type ColorBasis = 'school' | 'category' | 'author';
export const EVENT_FONT_SIZES = [13, 15, 18] as const;
export type EventFontPx = (typeof EVENT_FONT_SIZES)[number];

/** 계정에 저장해 어느 PC에서나 같게 보이는 값. 배경 농도와 화면 배율은 PC마다 달라 따로 둔다. */
export type Appearance = AppearanceChoices;

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'clear',
  accent: 'theme',
  eventFontPx: 13,
  colorBy: 'school',
  colorAssist: false,
  hideWeekend: false,
};

const CACHE_KEY = 't1t-appearance';
const SAVE_DELAY_MS = 500;

function systemPreset(): ThemePresetKey {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'night' : 'clear';
}

export function resolvePreset(theme: ThemeChoice): ThemePresetKey {
  return theme === 'system' ? systemPreset() : theme;
}

function isValidTheme(value: unknown): value is ThemeChoice {
  return value === 'system' || (typeof value === 'string' && value in THEME_PRESETS);
}

function normalize(raw: Partial<Appearance> | null | undefined): Appearance {
  const out = { ...DEFAULT_APPEARANCE, ...(raw ?? {}) };
  if (!isValidTheme(out.theme)) out.theme = DEFAULT_APPEARANCE.theme;
  if (!(EVENT_FONT_SIZES as readonly number[]).includes(out.eventFontPx)) out.eventFontPx = DEFAULT_APPEARANCE.eventFontPx;
  return out;
}

/** 이전 버전 값에서 옮긴다: 라이트는 맑음, 다크는 야간자습. 글자 크기는 가까운 칸으로 올린다. */
function migrate(settings: { theme?: string } | undefined): Appearance {
  const theme: ThemeChoice = settings?.theme === 'dark' ? 'night' : settings?.theme === 'system' ? 'system' : 'clear';
  let saved = 0;
  try { saved = Number(localStorage.getItem('tonet-schedule-font-size')) || 0; } catch { /* 저장소를 못 읽으면 기본값 */ }
  const eventFontPx: EventFontPx = saved >= 17 ? 18 : saved >= 14 ? 15 : 13;
  return { ...DEFAULT_APPEARANCE, theme, eventFontPx };
}

function readCache(): Appearance {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalize(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function writeCache(value: Appearance): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch (e) {
    console.warn('[Appearance] cache write failed:', e);
  }
}

/** 문서에 테마를 입힌다. 첫 화면 전에도 불리므로 저장소와 별개로 동작한다. */
export function applyAppearance(value: Appearance): { preset: ThemePresetKey; mode: 'light' | 'dark' } {
  const preset = resolvePreset(value.theme);
  const tokens = themeTokens(preset, value.accent);
  const root = document.documentElement;
  for (const [name, val] of Object.entries(tokens.vars)) root.style.setProperty(name, val);
  root.setAttribute('data-theme', tokens.mode);
  root.setAttribute('data-preset', preset);
  root.setAttribute('data-today', tokens.today);
  root.setAttribute('data-chip', tokens.solidChips ? 'solid' : 'tint');
  root.style.setProperty('--schedule-font-size', `${value.eventFontPx}px`);
  applyPlate(THEME_PRESETS[preset].alpha, plateFloor(preset));
  return { preset, mode: tokens.mode };
}

interface AppearanceState extends Appearance {
  preset: ThemePresetKey;
  mode: 'light' | 'dark';
  /** 바꾸면 바로 적용하고, 잠시 뒤 계정에 저장한다 */
  update: (changes: Partial<Appearance>) => void;
  /** 로그인한 계정의 값을 불러온다 */
  loadFromSettings: (settings: UserSettings | undefined) => void;
}

function pick(state: AppearanceState): Appearance {
  const { theme, accent, eventFontPx, colorBy, colorAssist, hideWeekend } = state;
  return { theme, accent, eventFontPx, colorBy, colorAssist, hideWeekend };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

const initial = readCache();

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...initial,
  preset: resolvePreset(initial.theme),
  mode: THEME_PRESETS[resolvePreset(initial.theme)].mode,

  update: (changes) => {
    const next = normalize({ ...pick(get()), ...changes });
    const applied = applyAppearance(next);
    writeCache(next);
    set({ ...next, ...applied });

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const auth = useAuthStore.getState();
      if (!auth.user) return;
      // 옛 버전과 함께 쓰는 동안을 위해 라이트·다크 값도 남긴다
      auth.saveSettings({ appearance: next, theme: next.theme === 'system' ? 'system' : applied.mode })
        .catch((err) => console.warn('[Appearance] save failed:', err));
    }, SAVE_DELAY_MS);
  },

  loadFromSettings: (settings) => {
    const next = settings?.appearance ? normalize(settings.appearance) : migrate(settings);
    const applied = applyAppearance(next);
    writeCache(next);
    set({ ...next, ...applied });
  },
}));

/** 첫 화면 전에 마지막 테마를 입혀 깜박임을 막는다 */
export function applyCachedAppearance(): void {
  applyAppearance(readCache());
}

// 시스템 설정 따르기: 운영체제의 밝기가 바뀌면 함께 바꾼다
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  const state = useAppearanceStore.getState();
  if (state.theme !== 'system') return;
  useAppearanceStore.setState(applyAppearance(pick(state)));
});

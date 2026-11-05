/**
 * 테마 7종과 강조색. 값은 제안 시안에서 사진과 흰색, 검은색 바탕 위 대비를 확인한 것이다.
 *
 * 투명 창이라 글자 뒤로 바탕화면이 비친다. 그래서 테마마다 배경 농도의 하한을 계산해 두고,
 * 어떤 바탕화면이어도 글자 대비가 기준 아래로 떨어지지 않게 한다.
 * 시안 값에서 주말 날짜와 희미한 글자를 조금 진하게 조정해 농도 75%에서도 기준을 맞췄다.
 */

export type ThemePresetKey = 'clear' | 'grid' | 'chalk' | 'night' | 'blossom' | 'contrast';
export type ThemeChoice = ThemePresetKey | 'system';
export type AccentKey = 'theme' | 'blue' | 'indigo' | 'teal' | 'orange' | 'pink';
export type TodayMark = 'fill' | 'ring' | 'pen';

interface ThemePreset {
  name: string;
  mode: 'light' | 'dark';
  /** 판의 색 */
  surf: [number, number, number];
  /** 기본 배경 농도 */
  alpha: number;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  vline: string;
  weekend: string;
  frame: string;
  /** 테마 기본 강조색 (oklch) */
  accent: [number, number, number];
  today: TodayMark;
  sun: string;
  sat: string;
  pen: string;
  tint: number;
  soft: number;
  texture?: string;
  textureSize?: string;
  solidChips?: boolean;
  /** 고대비는 농도를 낮추지 못하게 고정한다 */
  lockAlpha?: boolean;
}

export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  clear: { name: '맑음', mode: 'light', surf: [247, 248, 251], alpha: 85, ink: '#111827', ink2: '#3F4957', ink3: '#5E6673', line: 'rgb(17 24 39 / .11)', vline: 'rgb(17 24 39 / .06)', weekend: 'rgb(17 24 39 / .025)', frame: 'rgb(17 24 39 / .14)', accent: [0.33, 0.07, 265], today: 'fill', sun: '#8F1717', sat: '#163BA8', pen: '#D92D20', tint: 15, soft: 12 },
  grid: { name: '모눈노트', mode: 'light', surf: [252, 253, 255], alpha: 90, ink: '#16244A', ink2: '#3A4A6E', ink3: '#5A6580', line: 'rgb(46 88 160 / .24)', vline: 'rgb(46 88 160 / .14)', weekend: 'rgb(46 88 160 / .03)', frame: 'rgb(30 50 110 / .2)', accent: [0.42, 0.15, 264], today: 'pen', sun: '#8F1717', sat: '#1E40AF', pen: '#D92D20', tint: 13, soft: 11, texture: 'linear-gradient(rgb(46 88 160 / .055) 1px, transparent 1px), linear-gradient(90deg, rgb(46 88 160 / .055) 1px, transparent 1px)', textureSize: '11px 11px' },
  chalk: { name: '칠판', mode: 'dark', surf: [31, 58, 50], alpha: 95, ink: '#F4F2E8', ink2: '#D6D7CA', ink3: '#ADB4A8', line: 'rgb(244 242 232 / .17)', vline: 'rgb(244 242 232 / .09)', weekend: 'rgb(244 242 232 / .03)', frame: 'rgb(10 20 16 / .55)', accent: [0.88, 0.13, 95], today: 'pen', sun: '#FFC4BB', sat: '#B8DAFF', pen: '#F2D66B', tint: 24, soft: 18, texture: 'radial-gradient(60% 40% at 20% 10%, rgb(255 255 255 / .05), transparent 70%), radial-gradient(50% 40% at 85% 90%, rgb(255 255 255 / .04), transparent 70%)' },
  night: { name: '야간자습', mode: 'dark', surf: [21, 23, 30], alpha: 90, ink: '#EEF0F5', ink2: '#C6CBD6', ink3: '#9AA1B1', line: 'rgb(238 240 245 / .13)', vline: 'rgb(238 240 245 / .07)', weekend: 'rgb(238 240 245 / .025)', frame: 'rgb(0 0 0 / .6)', accent: [0.78, 0.11, 275], today: 'fill', sun: '#FFA89E', sat: '#A6C2FF', pen: '#FF8A7A', tint: 24, soft: 20 },
  blossom: { name: '벚꽃', mode: 'light', surf: [255, 248, 250], alpha: 88, ink: '#2F1D27', ink2: '#5A4250', ink3: '#75606C', line: 'rgb(120 40 80 / .14)', vline: 'rgb(120 40 80 / .07)', weekend: 'rgb(214 69 127 / .035)', frame: 'rgb(90 30 60 / .18)', accent: [0.55, 0.18, 355], today: 'fill', sun: '#8F1332', sat: '#163BA8', pen: '#D0253A', tint: 15, soft: 12 },
  contrast: { name: '고대비', mode: 'light', surf: [255, 255, 255], alpha: 100, ink: '#000000', ink2: '#1C1C1C', ink3: '#3D3D3D', line: 'rgb(0 0 0 / .5)', vline: 'rgb(0 0 0 / .28)', weekend: 'rgb(0 0 0 / .04)', frame: 'rgb(0 0 0 / .9)', accent: [0.38, 0.2, 262], today: 'ring', sun: '#B3160B', sat: '#0B3FB3', pen: '#B3160B', tint: 18, soft: 14, solidChips: true, lockAlpha: true },
};

/** 강조색 5가지. 대비를 미리 계산한 값이다. 자유 색상은 두지 않는다. */
export const ACCENTS: Record<Exclude<AccentKey, 'theme'>, { name: string; light: [number, number, number]; dark: [number, number, number] }> = {
  blue: { name: '파랑', light: [0.57, 0.19, 258], dark: [0.66, 0.162, 258] },
  indigo: { name: '남색', light: [0.575, 0.17, 275], dark: [0.665, 0.145, 275] },
  teal: { name: '청록', light: [0.555, 0.094, 195], dark: [0.645, 0.102, 195] },
  orange: { name: '주황', light: [0.58, 0.166, 45], dark: [0.67, 0.145, 45] },
  pink: { name: '분홍', light: [0.59, 0.18, 355], dark: [0.68, 0.153, 355] },
};

type Rgb = [number, number, number];

export function oklchToRgb(L: number, C: number, H: number): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const toSrgb = (c: number) => {
    const v = Math.max(0, Math.min(1, c));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  };
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(c: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))) as Rgb;
}

const WALLPAPERS: Rgb[] = [[0, 0, 0], [255, 255, 255], [128, 128, 128]];

/**
 * 어떤 바탕화면이어도 글자가 읽히는 가장 낮은 농도.
 * 보조 글자와 주말 날짜는 4.5:1, 희미한 안내 글자는 3:1. 일정 칩은 판 색 위에 섞으므로 바탕화면과 상관없다.
 */
function minAlpha(preset: ThemePreset): number {
  const needs: Array<[Rgb, number]> = [
    [hexToRgb(preset.ink2), 4.5],
    [hexToRgb(preset.sun), 4.5],
    [hexToRgb(preset.sat), 4.5],
    [hexToRgb(preset.ink3), 3],
  ];
  for (let a = 40; a <= 100; a++) {
    const plates = WALLPAPERS.map((w) => over(preset.surf, a / 100, w));
    if (needs.every(([color, ratio]) => plates.every((plate) => contrastRatio(color, plate) >= ratio))) return a;
  }
  return 100;
}

/** 배경 농도 하한. 대비 계산값과 75% 중 큰 값이다. */
export function plateFloor(key: ThemePresetKey): number {
  const preset = THEME_PRESETS[key];
  return preset.lockAlpha ? 100 : Math.max(75, minAlpha(preset));
}

/** 설정 화면에 보여 주는 대비 값 */
export function worstContrast(key: ThemePresetKey, alpha: number): { dark: number; bright: number } {
  const preset = THEME_PRESETS[key];
  const ink2 = hexToRgb(preset.ink2);
  return {
    dark: contrastRatio(ink2, over(preset.surf, alpha / 100, [0, 0, 0])),
    bright: contrastRatio(ink2, over(preset.surf, alpha / 100, [255, 255, 255])),
  };
}

export interface ThemeTokens {
  mode: 'light' | 'dark';
  today: TodayMark;
  solidChips: boolean;
  accentRgb: Rgb;
  vars: Record<string, string>;
}

/** 강조색을 고르고, 위에 올라가는 글자와 대비 4.5:1이 될 때까지 밝기를 조정한다 */
function resolveAccent(preset: ThemePreset, accent: AccentKey): { rgb: Rgb; on: string } {
  const lch: [number, number, number] = accent === 'theme'
    ? [...preset.accent]
    : [...ACCENTS[accent][preset.mode]];
  if (preset.lockAlpha && accent !== 'theme') lch[0] = Math.min(lch[0], 0.45);
  const on = preset.mode === 'light' ? '#ffffff' : '#0B1020';
  const onRgb = hexToRgb(on);
  let rgb = oklchToRgb(lch[0], lch[1], lch[2]);
  for (let guard = 0; contrastRatio(rgb, onRgb) < 4.5 && guard < 30; guard++) {
    lch[0] += preset.mode === 'light' ? -0.01 : 0.01;
    rgb = oklchToRgb(lch[0], lch[1], lch[2]);
  }
  return { rgb, on };
}

export function themeTokens(key: ThemePresetKey, accent: AccentKey): ThemeTokens {
  const preset = THEME_PRESETS[key];
  const { rgb, on } = resolveAccent(preset, accent);
  const accentColor = `rgb(${rgb.join(' ')})`;
  const dark = preset.mode === 'dark';
  return {
    mode: preset.mode,
    today: preset.today,
    solidChips: !!preset.solidChips,
    accentRgb: rgb,
    vars: {
      '--plate-rgb': preset.surf.join(' '),
      '--plate-texture': preset.texture ?? 'none',
      '--plate-texture-size': preset.textureSize ?? 'auto',
      '--window-frame': preset.frame,
      '--text-primary': preset.ink,
      '--text-secondary': preset.ink2,
      '--text-muted': preset.ink3,
      '--grid-line': preset.line,
      '--border-color': preset.line,
      '--border-subtle': preset.vline,
      '--tint-neutral': preset.weekend,
      '--bg-modal': `rgb(${preset.surf.join(' ')})`,
      '--bg-secondary': preset.lockAlpha ? 'rgb(0 0 0 / .03)' : dark ? 'rgb(255 255 255 / .07)' : 'rgb(255 255 255 / .42)',
      '--bg-hover': `color-mix(in oklab, ${preset.ink} 7%, transparent)`,
      '--bg-active': `color-mix(in oklab, ${preset.ink} 12%, transparent)`,
      '--accent': accentColor,
      '--accent-hover': `color-mix(in oklab, ${accentColor} 88%, ${preset.ink})`,
      '--accent-soft': `color-mix(in oklab, ${accentColor} ${preset.soft}%, transparent)`,
      '--accent-ink': `color-mix(in oklab, ${accentColor} 72%, ${preset.ink})`,
      '--on-accent': on,
      '--today-bg': `color-mix(in oklab, ${accentColor} ${preset.soft}%, transparent)`,
      '--weekend-text': preset.sun,
      '--saturday-text': preset.sat,
      '--pen': preset.pen,
      '--chip-tint': `${preset.tint}%`,
      '--danger': dark ? '#F0645A' : '#D92D20',
      '--warning': dark ? '#FBBF24' : '#B45309',
      '--focus-ring': `0 0 0 3px color-mix(in oklab, ${accentColor} 25%, transparent)`,
    },
  };
}

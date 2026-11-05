/**
 * 이 PC에만 저장하는 화면 값. 모니터와 바탕화면에 따라 달라지므로 계정에 두지 않는다.
 *
 * 배경 농도는 창 판의 불투명도다. 예전 투명도(창 전체 setOpacity)는 글자까지 함께 흐려져
 * 밝은 바탕화면에서 읽기 어려웠다. 이제 글자는 그대로 두고 판만 조절한다.
 */
const PLATE_KEY = 't1t-plate-alpha';
const ZOOM_KEY = 't1t-zoom';

export const PLATE_ALPHA_MIN = 75;
export const PLATE_ALPHA_MAX = 100;
export const PLATE_ALPHA_DEFAULT = 85;
export const ZOOM_CHOICES = [100, 110, 125, 150] as const;
const ZOOM_DEFAULT = 100;

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch (e) {
    console.warn('[DisplayPrefs] localStorage read failed:', e);
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    console.warn('[DisplayPrefs] localStorage write failed:', e);
  }
}

export function getPlateAlpha(): number {
  const saved = readNumber(PLATE_KEY) ?? PLATE_ALPHA_DEFAULT;
  return Math.min(PLATE_ALPHA_MAX, Math.max(PLATE_ALPHA_MIN, saved));
}

function applyPlateAlpha(value: number): void {
  document.documentElement.style.setProperty('--plate-alpha', String(value / 100));
}

export function setPlateAlpha(value: number): void {
  writeNumber(PLATE_KEY, value);
  applyPlateAlpha(getPlateAlpha());
}

export function getZoom(): number {
  const saved = readNumber(ZOOM_KEY);
  return saved !== null && (ZOOM_CHOICES as readonly number[]).includes(saved) ? saved : ZOOM_DEFAULT;
}

function applyZoom(value: number): void {
  window.electronAPI?.setZoomFactor(value / 100);
}

export function setZoom(value: number): void {
  writeNumber(ZOOM_KEY, value);
  applyZoom(getZoom());
}

/** 첫 화면을 그리기 전에 부른다. 저장값이 늦게 적용되어 화면이 깜박이지 않게 한다. */
export function applyDisplayPrefs(): void {
  applyPlateAlpha(getPlateAlpha());
  applyZoom(getZoom());
}

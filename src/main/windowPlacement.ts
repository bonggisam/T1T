/**
 * 창 위치 계산 (Electron 비의존, 단위 테스트 가능)
 *
 * 모니터를 뺐다 꽂거나 해상도가 바뀌어도 창이 화면 밖으로 사라지지 않게 한다.
 * 보조 모니터와 왼쪽 모니터(음수 좌표)에 둔 창은 그 자리를 유지한다.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  /** 저장 당시 창이 있던 모니터 */
  displayId?: number;
}

export interface DisplayArea {
  id: number;
  workArea: Rect;
}

export const DEFAULT_WIDTH = 420;
export const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const MAX_SIZE = 10000;
/** 창을 다시 잡으려면 작업 영역 안에 이만큼은 보여야 한다 */
const MIN_VISIBLE_WIDTH = 120;
const MIN_VISIBLE_HEIGHT = 40;
const EDGE_MARGIN = 20;

function overlap(aStart: number, aLen: number, bStart: number, bLen: number): number {
  return Math.min(aStart + aLen, bStart + bLen) - Math.max(aStart, bStart);
}

/** 창의 윗부분이 작업 영역 안에 충분히 보여 잡고 옮길 수 있는가 */
export function isReachableOn(bounds: Rect, area: Rect): boolean {
  const visibleWidth = overlap(bounds.x, bounds.width, area.x, area.width);
  // 세로는 제목 줄이 있는 창 위쪽 띠만 본다. 아래쪽만 보이면 옮길 수 없다.
  const titleTop = Math.max(bounds.y, area.y);
  const titleVisible = bounds.y >= area.y && bounds.y < area.y + area.height;
  const visibleHeight = titleVisible ? Math.min(bounds.y + bounds.height, area.y + area.height) - titleTop : 0;
  return visibleWidth >= MIN_VISIBLE_WIDTH && visibleHeight >= MIN_VISIBLE_HEIGHT;
}

export function isReachable(bounds: Rect, displays: DisplayArea[]): boolean {
  return displays.some((d) => isReachableOn(bounds, d.workArea));
}

/** 크기를 작업 영역에 맞추고 창 전체가 영역 안에 들어오게 옮긴다 */
export function fitInto(bounds: Rect, area: Rect): Rect {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** 기본 위치: 주 모니터 오른쪽 위 */
export function defaultBounds(primary: Rect, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): Rect {
  return fitInto(
    { x: primary.x + primary.width - width - EDGE_MARGIN, y: primary.y + EDGE_MARGIN, width, height },
    primary,
  );
}

/** 저장 파일의 값을 검사한다. 숫자가 아니거나 비정상 크기면 null */
export function parseSavedState(data: unknown): SavedWindowState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const { width, height, x, y, displayId } = d;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_WIDTH || height < MIN_HEIGHT || width > MAX_SIZE || height > MAX_SIZE) return null;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  return {
    width,
    height,
    ...(finite(x) && finite(y) ? { x, y } : {}),
    ...(finite(displayId) ? { displayId } : {}),
  };
}

/**
 * 시작할 때, 또는 화면 구성이 바뀌었을 때 창을 둘 위치를 정한다.
 * 저장한 자리에 잡을 수 있으면 그대로 두고, 아니면 저장 당시 모니터 안으로,
 * 그 모니터가 없으면 주 모니터 안으로 옮긴다.
 */
export function resolveBounds(saved: SavedWindowState | null, displays: DisplayArea[], primary: Rect): Rect {
  if (!saved) return defaultBounds(primary);
  if (saved.x === undefined || saved.y === undefined) {
    return defaultBounds(primary, saved.width, saved.height);
  }
  const bounds: Rect = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  if (isReachable(bounds, displays)) return bounds;
  const home = displays.find((d) => d.id === saved.displayId);
  return fitInto(bounds, home ? home.workArea : primary);
}

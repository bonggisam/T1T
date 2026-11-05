/** 설정 슬라이더의 최솟값. 잘못 저장된 값 때문에 시작하자마자 창이 보이지 않게 되는 일을 막는다. */
export const MIN_TRANSPARENCY = 10;

/** 저장된 투명도(10~100)를 창 불투명도(0.1~1)로 바꾼다. 값이 없으면(로그아웃 상태 등) 1. */
export function transparencyToOpacity(transparency: unknown): number {
  if (typeof transparency !== 'number' || !Number.isFinite(transparency)) return 1;
  return Math.min(100, Math.max(MIN_TRANSPARENCY, transparency)) / 100;
}

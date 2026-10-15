import { useCallback, useEffect, useState } from 'react';

/**
 * 좁은 창에서 넘치는 가로 줄(아이콘·필터 칩)을 위한 훅.
 * - 마우스 휠(세로)을 가로 스크롤로 변환
 * - 오른쪽에 더 있는 동안만 `scroll-fade-x` 클래스로 끝을 흐리게 표시
 * 조건부로 렌더되는 요소에도 붙도록 callback ref를 반환한다.
 */
export function useHorizontalScroll<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;

    const update = () => {
      const more = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
      el.classList.toggle('scroll-fade-x', more);
    };
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, [el]);

  return ref;
}

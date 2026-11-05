import { useEffect, useState } from 'react';

/** 이보다 좁으면 월 칸에 제목을 넣지 않고 색 막대와 일정 목록으로 보여 준다 */
export const NARROW_MAX = 560;
/** 이보다 넓으면 월 화면 옆에 오늘 칸을 둔다 */
export const WIDE_MIN = 760;

/** 창 크기 (CSS 픽셀). 화면 배율을 높이면 작아지므로 배율에 따라 배치도 함께 바뀐다. */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

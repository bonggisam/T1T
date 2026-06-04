import { useEffect } from 'react';

/**
 * 모달/입력 컴포넌트 마운트 동안 클릭 통과(clickThrough) 모드를 강제로 해제.
 * 위젯 모드에서 마우스 이벤트가 통과돼 입력 막히는 문제 방지.
 * unmount 시 이전 상태로 복원.
 */
export function useDisableClickThrough(): void {
  useEffect(() => {
    let prevClickThrough = false;
    let restored = false;
    let mounted = true;

    const restore = () => {
      if (restored) return;
      restored = true;
      if (prevClickThrough) {
        window.electronAPI?.toggleClickThrough(true).catch(() => {});
      }
    };

    (async () => {
      try {
        prevClickThrough = await window.electronAPI?.getClickThrough?.() ?? false;
        if (!mounted) return;
        if (prevClickThrough) {
          await window.electronAPI?.toggleClickThrough(false);
        }
      } catch {}
    })();

    return () => {
      mounted = false;
      restore();
    };
  }, []);
}

import { useEffect } from 'react';

/**
 * ESC 키 리스너 공통 훅.
 * - capture phase로 등록하여 가장 먼저 열린 모달부터 닫히도록
 * - stopPropagation으로 여러 모달이 동시에 닫히지 않도록
 */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };
    window.addEventListener('keydown', handler, true); // capture
    return () => window.removeEventListener('keydown', handler, true);
  }, [onEscape, enabled]);
}

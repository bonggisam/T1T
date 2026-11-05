import { useEffect, useRef, useState } from 'react';

/** 단추로 여닫는 작은 메뉴. 바깥을 누르거나 Esc를 누르면 닫힌다. */
export function usePopover<A extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<A | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  /** 단추 바로 아래에 놓되 창 밖으로 나가지 않게 한다 */
  function position(width: number): React.CSSProperties {
    const rect = anchorRef.current?.getBoundingClientRect();
    const left = Math.max(8, Math.min((rect?.left ?? 8), window.innerWidth - width - 8));
    return { top: (rect?.bottom ?? 40) + 4, left, width: Math.min(width, window.innerWidth - 16) };
  }

  return { open, setOpen, anchorRef, popRef, position };
}

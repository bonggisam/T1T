import React from 'react';

type Edge = 'top'|'right'|'bottom'|'left'|'top-left'|'top-right'|'bottom-left'|'bottom-right';

/**
 * 프레임리스+투명 윈도우의 가장자리 리사이즈 핸들.
 * 각 가장자리 4px 두께 + 모서리 8x8 잡기 영역.
 * mousedown → IPC로 시작, mouseup(전역) → IPC로 중지.
 */
export function ResizeHandles() {
  const activeRef = React.useRef(false);

  const start = (edge: Edge) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeRef.current) return; // 중복 시작 방지
    activeRef.current = true;
    window.electronAPI?.startEdgeResize(edge);

    const cleanup = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      window.electronAPI?.stopEdgeResize();
      window.removeEventListener('mouseup', cleanup, true);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('mouseleave', cleanup);
      window.removeEventListener('visibilitychange', cleanup);
      // 안전망: 자동 타임아웃 (10초 — 사용자가 10초 이상 드래그하지 않을 것)
      clearTimeout(safetyTimer);
    };
    // 다양한 종료 트리거 — alt+tab, focus loss, 창 밖 마우스 등
    window.addEventListener('mouseup', cleanup, true);
    window.addEventListener('blur', cleanup);
    document.addEventListener('mouseleave', cleanup);
    window.addEventListener('visibilitychange', cleanup);
    // 최대 10초 후 강제 정리 (mouseup 못 받는 극단 케이스 대비)
    const safetyTimer = setTimeout(cleanup, 10000);
  };

  // 모서리 영역을 충분히 크게 (12x12), 상단 핸들은 TitleBar(높이 ≥36px) 안 침범하도록 더 아래로 시작
  // 위 가장자리는 모서리에서 추가로 띄움 (left: 12, right: 12)
  return (
    <>
      {/* 가장자리 (얇은 영역) */}
      <div onMouseDown={start('top')}    style={{ ...s.edge, top: 0, left: 12, right: 12, height: 3, cursor: 'ns-resize' }} />
      <div onMouseDown={start('bottom')} style={{ ...s.edge, bottom: 0, left: 12, right: 12, height: 4, cursor: 'ns-resize' }} />
      <div onMouseDown={start('left')}   style={{ ...s.edge, left: 0, top: 12, bottom: 12, width: 4, cursor: 'ew-resize' }} />
      <div onMouseDown={start('right')}  style={{ ...s.edge, right: 0, top: 12, bottom: 12, width: 4, cursor: 'ew-resize' }} />
      {/* 모서리 — 12x12로 잡기 쉽게 */}
      <div onMouseDown={start('top-left')}     style={{ ...s.edge, top: 0, left: 0, width: 12, height: 12, cursor: 'nwse-resize' }} />
      <div onMouseDown={start('top-right')}    style={{ ...s.edge, top: 0, right: 0, width: 12, height: 12, cursor: 'nesw-resize' }} />
      <div onMouseDown={start('bottom-left')}  style={{ ...s.edge, bottom: 0, left: 0, width: 12, height: 12, cursor: 'nesw-resize' }} />
      <div onMouseDown={start('bottom-right')} style={{ ...s.edge, bottom: 0, right: 0, width: 14, height: 14, cursor: 'nwse-resize' }} />
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  edge: {
    position: 'fixed',
    zIndex: 9999,
    background: 'transparent',
    // 윈도우 드래그 영역(-webkit-app-region: drag)을 덮어쓰지 않도록 명시
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties,
};

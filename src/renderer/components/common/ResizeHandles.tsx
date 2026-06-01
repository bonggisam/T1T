import React from 'react';

type Edge = 'top'|'right'|'bottom'|'left'|'top-left'|'top-right'|'bottom-left'|'bottom-right';

/**
 * 프레임리스+투명 윈도우의 가장자리 리사이즈 핸들.
 * 각 가장자리 4px 두께 + 모서리 8x8 잡기 영역.
 * mousedown → IPC로 시작, mouseup(전역) → IPC로 중지.
 */
export function ResizeHandles() {
  const start = (edge: Edge) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.electronAPI?.startEdgeResize(edge);
    const stop = () => {
      window.electronAPI?.stopEdgeResize();
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
    };
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
  };

  return (
    <>
      {/* 가장자리 (얇은 영역) */}
      <div onMouseDown={start('top')}    style={{ ...s.edge, top: 0, left: 8, right: 8, height: 4, cursor: 'ns-resize' }} />
      <div onMouseDown={start('bottom')} style={{ ...s.edge, bottom: 0, left: 8, right: 8, height: 4, cursor: 'ns-resize' }} />
      <div onMouseDown={start('left')}   style={{ ...s.edge, left: 0, top: 8, bottom: 8, width: 4, cursor: 'ew-resize' }} />
      <div onMouseDown={start('right')}  style={{ ...s.edge, right: 0, top: 8, bottom: 8, width: 4, cursor: 'ew-resize' }} />
      {/* 모서리 (조금 더 넓게) */}
      <div onMouseDown={start('top-left')}     style={{ ...s.edge, top: 0, left: 0, width: 8, height: 8, cursor: 'nwse-resize' }} />
      <div onMouseDown={start('top-right')}    style={{ ...s.edge, top: 0, right: 0, width: 8, height: 8, cursor: 'nesw-resize' }} />
      <div onMouseDown={start('bottom-left')}  style={{ ...s.edge, bottom: 0, left: 0, width: 8, height: 8, cursor: 'nesw-resize' }} />
      <div onMouseDown={start('bottom-right')} style={{ ...s.edge, bottom: 0, right: 0, width: 12, height: 12, cursor: 'nwse-resize' }} />
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

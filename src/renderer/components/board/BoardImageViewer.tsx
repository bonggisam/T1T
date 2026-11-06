import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize, Minus, Plus, X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { imageUrlToPng } from '../../utils/boardImage';
import { loadBoardImage } from '../../store/boardStore';
import { showToast } from '../common/Toast';

export interface BoardViewerItem {
  id: string;
  label: string;
}

const ZOOM_STEP = 0.5;
const ZOOM_MAX = 5;
const DRAG_THRESHOLD = 4;

/** 사진 크게 보기. 표의 글자를 읽을 수 있게 키워서 끌어 가며 본다 */
export function BoardImageViewer({ items, startIndex, onClose }: { items: BoardViewerItem[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const item = items[index];

  useEscapeKey(onClose);

  useEffect(() => {
    if (!item) return undefined;
    let alive = true;
    setUrl(null);
    setFailed(false);
    setScale(1);
    loadBoardImage(item.id).then((next) => { if (alive) setUrl(next); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [item?.id]);

  const move = useCallback((delta: number) => {
    setIndex((current) => Math.min(items.length - 1, Math.max(0, current + delta)));
  }, [items.length]);

  const zoom = useCallback((delta: number) => {
    setScale((current) => Math.min(ZOOM_MAX, Math.max(1, current + delta)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === '+' || e.key === '=') zoom(ZOOM_STEP);
      else if (e.key === '-') zoom(-ZOOM_STEP);
      else if (e.key === '0') setScale(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, zoom]);

  async function save() {
    if (!url || !item) return;
    try {
      const png = await imageUrlToPng(url);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(png);
      link.download = `${item.label.replace(/[\\/:*?"<>|]/g, ' ').trim() || '시험감독'}-${index + 1}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    } catch (err) {
      console.error('[Board] save failed:', err);
      showToast('사진을 저장하지 못했습니다', 'error');
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    const el = frame.current;
    if (!el || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    el.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const el = frame.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) d.moved = true;
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    // 끌지 않고 누르면 맞춤과 2배를 오간다
    if (d && !d.moved && url) setScale((current) => (current === 1 ? 2 : 1));
  }

  if (!item) return null;

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="사진 크게 보기">
      <div style={styles.bar}>
        <span style={styles.label}>{item.label}</span>
        <span style={styles.count}>{index + 1} / {items.length}</span>
        <span style={styles.spacer} />
        <button type="button" style={styles.btn} onClick={() => zoom(-ZOOM_STEP)} disabled={scale <= 1} aria-label="작게"><Minus size={16} /></button>
        <span style={styles.count}>{Math.round(scale * 100)}%</span>
        <button type="button" style={styles.btn} onClick={() => zoom(ZOOM_STEP)} disabled={scale >= ZOOM_MAX} aria-label="크게"><Plus size={16} /></button>
        <button type="button" style={styles.btn} onClick={() => setScale(1)} aria-label="창에 맞추기" title="창에 맞추기"><Maximize size={15} /></button>
        <button type="button" style={styles.btn} onClick={save} disabled={!url} aria-label="사진 저장" title="사진 저장"><Download size={15} /></button>
        <button type="button" style={styles.btn} onClick={onClose} aria-label="닫기" title="닫기"><X size={17} /></button>
      </div>
      <div
        ref={frame}
        style={{ ...styles.frame, cursor: url ? (scale === 1 ? 'zoom-in' : 'grab') : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP); } }}
      >
        {url && (
          <img
            src={url}
            alt={`${item.label} ${index + 1}번째 사진`}
            draggable={false}
            style={scale === 1 ? styles.fit : { ...styles.zoomed, width: `${scale * 100}%` }}
          />
        )}
        {!url && !failed && <div className="spinner" style={styles.status} />}
        {failed && <p style={styles.status}>사진을 불러오지 못했습니다.</p>}
      </div>
      {index > 0 && (
        <button type="button" style={{ ...styles.nav, left: 8 }} onClick={() => move(-1)} aria-label="앞 사진"><ChevronLeft size={22} /></button>
      )}
      {index < items.length - 1 && (
        <button type="button" style={{ ...styles.nav, right: 8 }} onClick={() => move(1)} aria-label="다음 사진"><ChevronRight size={22} /></button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 150,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(12, 15, 20, 0.94)',
    color: '#f3f4f6',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    flexShrink: 0,
  },
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
  },
  count: {
    flexShrink: 0,
    padding: '0 4px',
    fontSize: 'var(--fs-label)',
    fontVariantNumeric: 'tabular-nums',
    color: '#c7ccd4',
  },
  spacer: { flex: 1 },
  btn: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    border: 'none',
    borderRadius: 6,
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'inherit',
    cursor: 'pointer',
  },
  frame: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    overflow: 'auto',
    padding: '0 8px 8px',
    touchAction: 'none',
  },
  fit: {
    display: 'block',
    margin: 'auto',
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    userSelect: 'none',
  },
  zoomed: {
    display: 'block',
    margin: '0 auto',
    maxWidth: 'none',
    height: 'auto',
    flexShrink: 0,
    alignSelf: 'flex-start',
    userSelect: 'none',
  },
  status: {
    margin: 'auto',
    fontSize: 'var(--fs-body)',
  },
  nav: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 56,
    border: 'none',
    borderRadius: 8,
    background: 'rgba(255, 255, 255, 0.14)',
    color: 'inherit',
    cursor: 'pointer',
  },
};

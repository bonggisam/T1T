import React, { useState, useRef, useEffect } from 'react';

const RESERV_URL = 'https://ourssm.com/login';

interface ReservViewProps {
  onBack: () => void;
}

export function ReservView({ onBack }: ReservViewProps) {
  const [loading, setLoading] = useState(true);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const container = webviewContainerRef.current;
    if (!container) return;

    let mounted = true;
    const handlers = {
      start: () => { if (mounted) setLoading(true); },
      stop: () => { if (mounted) setLoading(false); },
      fail: () => { if (mounted) setLoading(false); },
    };

    const webview = document.createElement('webview');
    webview.setAttribute('src', RESERV_URL);
    webview.setAttribute('style', 'width: 100%; height: 100%;');
    webview.setAttribute('allowpopups', '');
    webview.addEventListener('did-start-loading', handlers.start);
    webview.addEventListener('did-stop-loading', handlers.stop);
    webview.addEventListener('did-fail-load', handlers.fail);

    container.appendChild(webview);
    webviewRef.current = webview;

    return () => {
      mounted = false;
      webview.removeEventListener('did-start-loading', handlers.start);
      webview.removeEventListener('did-stop-loading', handlers.stop);
      webview.removeEventListener('did-fail-load', handlers.fail);
      if (webview.parentNode) webview.parentNode.removeChild(webview);
      webviewRef.current = null;
    };
  }, []);

  function reload() {
    try { webviewRef.current?.reload?.(); } catch (err) { console.warn('[ReservView] reload failed:', err); }
  }
  function goBack() {
    try { if (webviewRef.current?.canGoBack?.()) webviewRef.current.goBack(); } catch (err) { console.warn('[ReservView] goBack failed:', err); }
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={styles.title}>🏢 회의실 예약</h3>
          <span style={styles.subtitle}>ourssm.com</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={goBack} style={styles.iconBtn} title="뒤로">←</button>
          <button onClick={reload} style={styles.iconBtn} title="새로고침">⟳</button>
          <button onClick={onBack} style={styles.closeBtn}>✕</button>
        </div>
      </div>
      <div ref={webviewContainerRef} style={styles.webviewWrap}>
        {loading && (
          <div style={styles.loadingOverlay}>
            <div className="spinner" />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>로딩 중...</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: '0 12px 12px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: { fontSize: 10, color: 'var(--text-muted)' },
  iconBtn: {
    background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer',
    width: 26, height: 26, borderRadius: 6,
    fontSize: 13, color: 'var(--text-secondary)',
  },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, color: 'var(--text-muted)',
    padding: '2px 6px',
  },
  webviewWrap: {
    flex: 1, position: 'relative',
    borderRadius: 8, overflow: 'hidden',
    border: '1px solid var(--border-subtle)', background: '#fff',
  },
  loadingOverlay: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.9)',
    zIndex: 10, pointerEvents: 'none',
  },
};

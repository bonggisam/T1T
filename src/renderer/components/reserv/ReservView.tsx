import React, { useState, useRef, useEffect } from 'react';
import { isPageLoadFailure, WebFailNotice } from '../common/WebFailNotice';
import { Undo2 } from 'lucide-react';
import { RefreshButton, ToolHeader } from '../common/ToolView';

const RESERV_URL = 'https://ourssm.com/login';

interface ReservViewProps {
  onBack: () => void;
}

export function ReservView({ onBack }: ReservViewProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const container = webviewContainerRef.current;
    if (!container) return;

    let mounted = true;
    const handlers = {
      start: () => { if (mounted) setLoading(true); },
      stop: () => { if (mounted) setLoading(false); },
      fail: (e: any) => {
        if (!mounted) return;
        setLoading(false);
        if (isPageLoadFailure(e)) setFailed(true);
      },
    };

    const webview = document.createElement('webview');
    webview.setAttribute('src', RESERV_URL);
    webview.setAttribute('style', 'width: 100%; height: 100%;');
    webview.setAttribute('allowpopups', '');
    // Electron 보안: partition 분리, node 비활성 (기본값)
    webview.setAttribute('partition', 'persist:reserv');
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
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
  }, [attempt]);

  function retry() {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  function reload() {
    try { webviewRef.current?.reload?.(); } catch (err) { console.warn('[ReservView] reload failed:', err); }
  }
  function goBack() {
    try { if (webviewRef.current?.canGoBack?.()) webviewRef.current.goBack(); } catch (err) { console.warn('[ReservView] goBack failed:', err); }
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <ToolHeader tab="reserv" title="회의실 예약" sub="ourssm.com" onBack={onBack}>
        <button type="button" onClick={goBack} className="tv-iconbtn" title="웹 화면 뒤로" aria-label="웹 화면 뒤로"><Undo2 size={14} /></button>
        <RefreshButton onClick={reload} />
      </ToolHeader>
      <div style={styles.body}>
      {failed && <WebFailNotice label="회의실 예약" onRetry={retry} />}
      <div ref={webviewContainerRef} style={styles.webviewWrap}>
        {loading && (
          <div style={styles.loadingOverlay}>
            <div className="spinner" />
            <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginTop: 8 }}>로딩 중...</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 12px 12px' },
  webviewWrap: {
    flex: 1, position: 'relative',
    borderRadius: 8, overflow: 'hidden',
    border: '1px solid var(--border-subtle)', background: 'var(--paper)',
  },
  loadingOverlay: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'var(--paper-soft)',
    zIndex: 10, pointerEvents: 'none',
  },
};

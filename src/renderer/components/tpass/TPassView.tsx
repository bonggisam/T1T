import React, { useState, useRef, useEffect } from 'react';

const TPASS_URL = 'https://script.google.com/macros/s/AKfycbzAkY37jTDVAeUfmPtA9uMjyle0pAH3_vFyqTal7RbF0dX_-ATYuALGEWH0O1NWdjT3/exec';

interface TPassViewProps {
  onBack: () => void;
}

export function TPassView({ onBack }: TPassViewProps) {
  const [loading, setLoading] = useState(true);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  // Electron webview는 HTMLElement 확장이지만 reload/goBack 등의 메서드를 가짐. 타입 표준에 없어 any 사용.
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const container = webviewContainerRef.current;
    if (!container) return;

    let mounted = true;
    const onStartLoad = () => { if (mounted) setLoading(true); };
    const onStopLoad = () => { if (mounted) setLoading(false); };
    const onFailLoad = () => { if (mounted) setLoading(false); };

    const webview = document.createElement('webview');
    webview.setAttribute('src', TPASS_URL);
    webview.setAttribute('style', 'width: 100%; height: 100%;');
    webview.setAttribute('allowpopups', '');
    webview.setAttribute('partition', 'persist:tpass');
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
    webview.addEventListener('did-start-loading', onStartLoad);
    webview.addEventListener('did-stop-loading', onStopLoad);
    webview.addEventListener('did-fail-load', onFailLoad);

    // 페이지 로드 완료 후 자동 로그인 — main 프로세스에서 iframe 내부에 직접 주입
    // (TPass는 Google Apps Script로, 실제 폼은 sandbox iframe 내부에 있어
    //  webview.executeJavaScript로는 접근 불가 — IPC로 main 프로세스가 처리)
    const onDomReady = () => {
      try {
        const id = (webview as any).getWebContentsId();
        if (typeof id !== 'number') {
          console.warn('[TPass] webContentsId not available');
          return;
        }
        // iframe 로드 + Apps Script 초기화 시간 확보 → 약간 대기 후 호출
        // (main 프로세스 내부에도 12회 재시도 폴링 있음)
        setTimeout(() => {
          window.electronAPI?.tpassAutoLogin(id).then((res) => {
            if (!res?.ok) {
              console.warn('[TPass] auto-login result:', res);
            } else {
              console.log('[TPass] auto-login OK (attempt', res.attempt, ')');
            }
          }).catch((e) => console.warn('[TPass] auto-login error:', e));
        }, 800);
      } catch (e) {
        console.warn('[TPass] dom-ready handler error:', e);
      }
    };
    webview.addEventListener('dom-ready', onDomReady);

    container.appendChild(webview);
    webviewRef.current = webview;

    return () => {
      mounted = false;
      webview.removeEventListener('did-start-loading', onStartLoad);
      webview.removeEventListener('did-stop-loading', onStopLoad);
      webview.removeEventListener('did-fail-load', onFailLoad);
      webview.removeEventListener('dom-ready', onDomReady);
      if (webview.parentNode) webview.parentNode.removeChild(webview);
      webviewRef.current = null;
    };
  }, []);

  function handleRefresh() {
    if (webviewRef.current) {
      webviewRef.current.reload();
      setLoading(true);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기">
          📅 캘린더
        </button>
        <span style={styles.label}>TPass</span>
        <button
          onClick={handleRefresh}
          style={styles.refreshBtn}
          title="새로고침"
        >
          🔄
        </button>
      </div>
      {loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress} />
        </div>
      )}
      <div ref={webviewContainerRef} style={styles.webviewContainer} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
    background: 'rgba(128,128,128,0.05)',
  },
  backBtn: {
    background: 'rgba(74, 144, 226, 0.15)',
    border: '1px solid rgba(74, 144, 226, 0.3)',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--accent)',
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  refreshBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    padding: '4px 6px',
    borderRadius: 6,
  },
  loadingBar: {
    height: 2,
    background: 'var(--border-subtle)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  loadingProgress: {
    height: '100%',
    width: '30%',
    background: 'var(--accent)',
    animation: 'tpass-loading 1.2s ease-in-out infinite',
    borderRadius: 2,
  },
  webviewContainer: {
    flex: 1,
    overflow: 'hidden',
  },
};

import React, { useState, useRef, useEffect } from 'react';
import { isPageLoadFailure, WebFailNotice } from '../common/WebFailNotice';
import { RefreshButton, ToolHeader } from '../common/ToolView';

// 주소는 빌드 시 .env의 VITE_TPASS_URL에서 주입한다. 저장소에는 값을 두지 않는다.
// 주입된 값은 설치 파일에서 꺼낼 수 있으므로, 실제 접근 통제는 Apps Script 쪽 권한으로 한다.
const TPASS_URL = import.meta.env.VITE_TPASS_URL || '';
/** 비밀번호 단계를 넘기는 동안 가려 두는 최대 시간. 지나면 페이지를 그대로 보여 준다 */
const ENTERING_MAX_MS = 10 * 1000;

interface TPassViewProps {
  onBack: () => void;
}

export function TPassView({ onBack }: TPassViewProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [entering, setEntering] = useState(Boolean(TPASS_URL));
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  // Electron webview는 HTMLElement 확장이지만 reload/goBack 등의 메서드를 가짐. 타입 표준에 없어 any 사용.
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const container = webviewContainerRef.current;
    if (!container) return;

    let mounted = true;
    const onStartLoad = () => { if (mounted) setLoading(true); };
    const onStopLoad = () => { if (mounted) setLoading(false); };
    const onFailLoad = (e: any) => {
      if (!mounted) return;
      setLoading(false);
      if (e?.isMainFrame) setEntering(false);
      if (isPageLoadFailure(e)) setFailed(true);
    };
    // 페이지가 뜨면 메인 프로세스가 비밀번호 단계를 넘긴다. 실패하면 페이지를 그대로 보여 주어 직접 넣을 수 있다.
    const onDomReady = () => {
      const id = (webview as any).getWebContentsId?.();
      Promise.resolve(typeof id === 'number' ? window.electronAPI?.tpassAutoLogin(id) : undefined)
        .then((res) => { if (res && !res.ok) console.warn('[외출시스템] 자동 입력 실패:', res.reason); })
        .catch((e) => console.warn('[외출시스템] 자동 입력 오류:', e))
        .finally(() => { if (mounted) setEntering(false); });
    };

    const webview = document.createElement('webview');
    webview.setAttribute('src', TPASS_URL);
    webview.setAttribute('style', 'width: 100%; height: 100%;');
    webview.setAttribute('allowpopups', '');
    webview.setAttribute('partition', 'persist:tpass');
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
    webview.addEventListener('did-start-loading', onStartLoad);
    webview.addEventListener('did-stop-loading', onStopLoad);
    webview.addEventListener('did-fail-load', onFailLoad);
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
  }, [attempt]);

  useEffect(() => {
    if (!entering) return;
    const timer = setTimeout(() => setEntering(false), ENTERING_MAX_MS);
    return () => clearTimeout(timer);
  }, [entering]);

  function retry() {
    setFailed(false);
    setLoading(true);
    setEntering(true);
    setAttempt((n) => n + 1);
  }

  function handleRefresh() {
    if (webviewRef.current) {
      webviewRef.current.reload();
      setLoading(true);
      setEntering(true);
    }
  }

  return (
    <div style={styles.container}>
      <ToolHeader tab="tpass" onBack={onBack}>
        <RefreshButton onClick={handleRefresh} />
      </ToolHeader>
      {TPASS_URL && loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress} />
        </div>
      )}
      {failed && <WebFailNotice label="외출시스템" onRetry={retry} />}
      {TPASS_URL ? (
        <div style={styles.webviewArea}>
          <div ref={webviewContainerRef} style={styles.webviewContainer} />
          {entering && <div style={styles.entering}>외출시스템을 여는 중…</div>}
        </div>
      ) : (
        <div style={styles.emptyState}>
          이 버전에는 외출시스템 주소가 설정되어 있지 않습니다. 관리자에게 문의해 주세요.
        </div>
      )}
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
  webviewArea: {
    position: 'relative',
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  webviewContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  entering: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgb(var(--plate-rgb))',
    fontSize: 'var(--fs-control)',
    color: 'var(--text-secondary)',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    fontSize: 'var(--fs-control)',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
};

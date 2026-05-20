import React, { useState, useRef, useEffect } from 'react';

/**
 * 학생 외출 신청 현황 뷰 — webview 기반.
 * 기본 URL은 TPass와 동일하나 localStorage 'tonet-outing-url' 로 학교별 외출 신청 페이지로 변경 가능.
 * 설정 → 외출 신청 URL 항목에서 변경 (또는 콘솔에서 localStorage.setItem('tonet-outing-url', '...') )
 */
const DEFAULT_OUTING_URL = 'https://docs.google.com/spreadsheets/d/1nDKEyspMHUHglbCZECpm_1_GAwzMSm7bXC2jM5KPRYY/edit?gid=721661329#gid=721661329';
const STORAGE_KEY = 'tonet-outing-url';

function getOutingUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_OUTING_URL;
  } catch { return DEFAULT_OUTING_URL; }
}

function saveOutingUrl(url: string): void {
  try { localStorage.setItem(STORAGE_KEY, url); }
  catch (e) { console.warn('[Outing] save URL failed:', e); }
}

interface OutingViewProps {
  onBack: () => void;
}

export function OutingView({ onBack }: OutingViewProps) {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState<string>(() => getOutingUrl());
  const [showSettings, setShowSettings] = useState(false);
  const [draftUrl, setDraftUrl] = useState<string>('');
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const container = webviewContainerRef.current;
    if (!container) return;

    let mounted = true;
    const onStartLoad = () => { if (mounted) setLoading(true); };
    const onStopLoad = () => { if (mounted) setLoading(false); };
    const onFailLoad = () => { if (mounted) setLoading(false); };

    const webview = document.createElement('webview');
    webview.setAttribute('src', url);
    webview.setAttribute('style', 'width: 100%; height: 100%;');
    webview.setAttribute('allowpopups', '');
    webview.setAttribute('partition', 'persist:outing');
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
    webview.addEventListener('did-start-loading', onStartLoad);
    webview.addEventListener('did-stop-loading', onStopLoad);
    webview.addEventListener('did-fail-load', onFailLoad);

    container.appendChild(webview);
    webviewRef.current = webview;

    return () => {
      mounted = false;
      webview.removeEventListener('did-start-loading', onStartLoad);
      webview.removeEventListener('did-stop-loading', onStopLoad);
      webview.removeEventListener('did-fail-load', onFailLoad);
      if (webview.parentNode) webview.parentNode.removeChild(webview);
      webviewRef.current = null;
    };
  }, [url]);

  function handleRefresh() {
    if (webviewRef.current) {
      webviewRef.current.reload();
      setLoading(true);
    }
  }

  function openSettings() {
    setDraftUrl(url);
    setShowSettings(true);
  }

  function saveSettings() {
    const trimmed = draftUrl.trim();
    if (!trimmed) {
      // 빈값이면 기본값으로 복귀
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      setUrl(DEFAULT_OUTING_URL);
    } else {
      saveOutingUrl(trimmed);
      setUrl(trimmed);
    }
    setShowSettings(false);
  }

  const today = new Date();
  const todayStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기">
          📅 캘린더
        </button>
        <span style={styles.label}>🚶‍♂️ 외출 신청 ({todayStr})</span>
        <button onClick={openSettings} style={styles.iconBtn} title="외출 신청 URL 설정" aria-label="설정">
          ⚙️
        </button>
        <button onClick={handleRefresh} style={styles.iconBtn} title="새로고침" aria-label="새로고침">
          🔄
        </button>
      </div>
      {loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress} />
        </div>
      )}
      <div ref={webviewContainerRef} style={styles.webviewContainer} />

      {/* URL 설정 모달 */}
      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div className="glass-solid" style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>외출 신청 URL 설정</h3>
            <p style={styles.modalDesc}>
              학교에서 사용하는 외출 신청 시스템 URL을 입력하세요. 비워두면 기본값 사용.
            </p>
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder={DEFAULT_OUTING_URL}
              style={styles.input}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button onClick={() => setShowSettings(false)} style={styles.cancelBtn}>취소</button>
              <button onClick={saveSettings} style={styles.saveBtn}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0, background: 'rgba(128,128,128,0.05)',
  },
  backBtn: {
    background: 'rgba(74, 144, 226, 0.15)',
    border: '1px solid rgba(74, 144, 226, 0.3)',
    cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
    fontSize: 12, fontWeight: 600, color: 'var(--accent)',
  },
  label: { flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, padding: '4px 6px', borderRadius: 6,
  },
  loadingBar: { height: 2, background: 'var(--border-subtle)', overflow: 'hidden', flexShrink: 0 },
  loadingProgress: {
    height: '100%', width: '30%', background: 'var(--accent)',
    animation: 'tpass-loading 1.2s ease-in-out infinite', borderRadius: 2,
  },
  webviewContainer: { flex: 1, overflow: 'hidden' },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    padding: 20, borderRadius: 12, minWidth: 360,
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  modalTitle: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  modalDesc: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 },
  input: {
    width: '100%', padding: '8px 12px', fontSize: 12,
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  cancelBtn: {
    padding: '6px 12px', fontSize: 12, fontWeight: 600,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  saveBtn: {
    padding: '6px 14px', fontSize: 12, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: '#fff', cursor: 'pointer',
  },
};

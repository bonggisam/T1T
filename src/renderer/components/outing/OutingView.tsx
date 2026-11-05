import React, { useState, useRef, useEffect } from 'react';
import { Ic } from '../common/Ic';

/**
 * 학생 외출 신청 현황 뷰 — webview 기반.
 * 기본 URL은 빌드 시 .env의 VITE_OUTING_URL에서 주입한다. 저장소에는 값을 두지 않는다.
 * 주입된 값은 설치 파일에서 꺼낼 수 있으므로, 실제 접근 통제는 문서의 공유 권한으로 한다.
 * 화면의 ⚙️ 설정에서 기기별 URL로 바꿀 수 있다 (localStorage 'tonet-outing-url').
 */
const DEFAULT_OUTING_URL = import.meta.env.VITE_OUTING_URL || '';
const STORAGE_KEY = 'tonet-outing-url';

function getSavedOutingUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch { return ''; }
}

function getOutingUrl(): string {
  return getSavedOutingUrl() || DEFAULT_OUTING_URL;
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
    // 기본 주소는 화면에 드러내지 않고, 사용자가 직접 저장한 주소만 채운다.
    setDraftUrl(getSavedOutingUrl());
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
          <Ic name="calendar" />캘린더
        </button>
        <span style={styles.label}><Ic name="list" />외출상황 ({todayStr})</span>
        <button onClick={openSettings} style={styles.iconBtn} title="외출상황 URL 설정" aria-label="설정">
          <Ic name="settings" gap={false} />
        </button>
        <button onClick={handleRefresh} style={styles.iconBtn} title="새로고침" aria-label="새로고침">
          <Ic name="refresh" gap={false} />
        </button>
      </div>
      {url && loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress} />
        </div>
      )}
      {url ? (
        <div ref={webviewContainerRef} style={styles.webviewContainer} />
      ) : (
        <div style={styles.emptyState}>
          <span>외출상황 URL이 설정되어 있지 않습니다.</span>
          <button onClick={openSettings} style={styles.saveBtn}>URL 설정</button>
        </div>
      )}

      {/* URL 설정 모달 */}
      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowSettings(false)}>
          <div className="glass-solid" style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>외출상황 URL 설정</h3>
            <p style={styles.modalDesc}>
              학교에서 사용하는 외출 신청 조회 페이지 URL을 입력하세요.{DEFAULT_OUTING_URL && ' 비워두면 기본값 사용.'}
            </p>
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://"
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
    flexShrink: 0, background: 'var(--tint-neutral)',
  },
  backBtn: {
    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
    fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--accent)',
  },
  label: { flex: 1, fontSize: 'var(--fs-control)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 'var(--fs-lead)', padding: '4px 6px', borderRadius: 6,
  },
  loadingBar: { height: 2, background: 'var(--border-subtle)', overflow: 'hidden', flexShrink: 0 },
  loadingProgress: {
    height: '100%', width: '30%', background: 'var(--accent)',
    animation: 'tpass-loading 1.2s ease-in-out infinite', borderRadius: 2,
  },
  webviewContainer: { flex: 1, overflow: 'hidden' },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 24, fontSize: 'var(--fs-control)', color: 'var(--text-muted)', textAlign: 'center',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'var(--scrim)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    padding: 20, borderRadius: 12, minWidth: 360,
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    boxShadow: '0 8px 32px var(--scrim)',
  },
  modalTitle: { fontSize: 'var(--fs-lead)', fontWeight: 700, marginBottom: 8 },
  modalDesc: { fontSize: 'var(--fs-body)', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 },
  input: {
    width: '100%', padding: '8px 12px', fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  cancelBtn: {
    padding: '6px 12px', fontSize: 'var(--fs-body)', fontWeight: 600,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  saveBtn: {
    padding: '6px 14px', fontSize: 'var(--fs-body)', fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer',
  },
};

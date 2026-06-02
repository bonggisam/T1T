import React, { useState, useRef, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';

const LIBRARY_URLS: Record<School, { url: string; label: string; emoji: string }> = {
  taeseong_middle: {
    url: 'https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%83%9C%EC%84%B1%EC%A4%91%ED%95%99%EA%B5%90&provCode=J10&neisCode=J100000822',
    label: '태성중학교',
    emoji: '🏫',
  },
  taeseong_high: {
    url: 'https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%83%9C%EC%84%B1%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&provCode=J10&neisCode=J100000822',
    label: '태성고등학교',
    emoji: '🎓',
  },
};

interface LibraryViewProps {
  onBack: () => void;
}

/**
 * 학교 도서관 도서검색 — 독서로(read365.edunet.net) 시스템을 앱 내부 webview로 표시.
 * 학교 선택 가능, 새로고침, 외부 브라우저로 열기 옵션 제공.
 */
export function LibraryView({ onBack }: LibraryViewProps) {
  const { user } = useAuthStore();
  const { librarySchool, setLibrarySchool } = useUIStore();
  const defaultSchool: School = (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high')
    ? user.school : 'taeseong_middle';
  const selectedSchool: School = librarySchool || defaultSchool;
  const target = LIBRARY_URLS[selectedSchool];

  const [loading, setLoading] = useState(true);
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
    webview.setAttribute('src', target.url);
    webview.setAttribute('style', 'width: 100%; height: 100%;');
    webview.setAttribute('allowpopups', '');
    webview.setAttribute('partition', 'persist:library');
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
    // 학교 변경 시 webview 재생성 (URL 변경 반영)
  }, [target.url]);

  function handleRefresh() {
    if (webviewRef.current) {
      webviewRef.current.reload();
      setLoading(true);
    }
  }

  function handleSchoolChange(s: School) {
    setLibrarySchool(s);
  }

  function handleOpenExternal() {
    window.electronAPI?.openExternal(target.url);
  }

  return (
    <div style={styles.container}>
      {/* 툴바: 뒤로 + 학교 선택 + 새로고침 + 외부 열기 */}
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기">
          📅 캘린더
        </button>
        <div style={styles.schoolToggle}>
          {(['taeseong_middle', 'taeseong_high'] as School[]).map((sk) => {
            const info = LIBRARY_URLS[sk];
            const active = selectedSchool === sk;
            return (
              <button
                key={sk}
                onClick={() => handleSchoolChange(sk)}
                style={{
                  ...styles.schoolBtn,
                  ...(active ? styles.schoolBtnActive : {}),
                }}
              >
                {info.emoji} {info.label}
              </button>
            );
          })}
        </div>
        <button onClick={handleRefresh} style={styles.iconBtn} title="새로고침" aria-label="새로고침">
          🔄
        </button>
        <button onClick={handleOpenExternal} style={styles.iconBtn} title="외부 브라우저로 열기" aria-label="외부 열기">
          ↗
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
    gap: 6,
    padding: '6px 10px',
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
    flexShrink: 0,
  },
  schoolToggle: {
    display: 'flex',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
  },
  schoolBtn: {
    background: 'transparent',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  schoolBtnActive: {
    background: 'rgba(217,119,6,0.18)',
    borderColor: 'rgba(217,119,6,0.5)',
    color: '#D97706',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    padding: '4px 8px',
    borderRadius: 6,
    color: 'var(--text-secondary)',
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
    background: '#D97706',
    animation: 'tpass-loading 1.2s ease-in-out infinite',
    borderRadius: 2,
  },
  webviewContainer: {
    flex: 1,
    overflow: 'hidden',
    background: '#fff',
  },
};

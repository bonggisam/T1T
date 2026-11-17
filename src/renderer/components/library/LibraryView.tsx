import React, { useState, useRef, useEffect } from 'react';
import { isPageLoadFailure, WebFailNotice } from '../common/WebFailNotice';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';
import { type IconName } from '../common/Ic';
import { ExternalLink } from 'lucide-react';
import { RefreshButton, SchoolSeg, ToolHeader } from '../common/ToolView';

const LIBRARY_URLS: Record<School, { url: string; label: string; icon: IconName }> = {
  taeseong_middle: {
    url: 'https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%83%9C%EC%84%B1%EC%A4%91%ED%95%99%EA%B5%90&provCode=J10&neisCode=J100003492',
    label: '태성중학교',
    icon: 'school',
  },
  taeseong_high: {
    url: 'https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%83%9C%EC%84%B1%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&provCode=J10&neisCode=J100000822',
    label: '태성고등학교',
    icon: 'graduation',
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
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
      if (isPageLoadFailure(e)) setFailed(true);
    };

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
  }, [target.url, attempt]);

  function retry() {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }

  function handleRefresh() {
    if (webviewRef.current) {
      webviewRef.current.reload();
      setLoading(true);
    }
  }

  // 빠른 연속 클릭 시 webview 재생성 누적 방지
  const switchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSchoolChange(s: School) {
    if (switchDebounceRef.current) clearTimeout(switchDebounceRef.current);
    switchDebounceRef.current = setTimeout(() => {
      setLibrarySchool(s);
      switchDebounceRef.current = null;
    }, 250);
  }
  useEffect(() => {
    return () => {
      if (switchDebounceRef.current) clearTimeout(switchDebounceRef.current);
    };
  }, []);

  function handleOpenExternal() {
    window.electronAPI?.openExternal(target.url);
  }

  return (
    <div style={styles.container}>
      {/* 툴바: 뒤로 + 학교 선택 + 새로고침 + 외부 열기 */}
      <ToolHeader tab="library" onBack={onBack}>
        <SchoolSeg value={selectedSchool} onChange={handleSchoolChange} />
        <RefreshButton onClick={handleRefresh} />
        <button type="button" onClick={handleOpenExternal} className="tv-iconbtn" title="외부 브라우저로 열기" aria-label="외부 열기">
          <ExternalLink size={14} />
        </button>
      </ToolHeader>
      {loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress} />
        </div>
      )}
      {failed && <WebFailNotice label="도서관" onRetry={retry} />}
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
  loadingBar: {
    height: 2,
    background: 'var(--border-subtle)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  loadingProgress: {
    height: '100%',
    width: '30%',
    background: 'var(--library)',
    animation: 'tpass-loading 1.2s ease-in-out infinite',
    borderRadius: 2,
  },
  webviewContainer: {
    flex: 1,
    overflow: 'hidden',
    background: 'var(--paper)',
  },
};

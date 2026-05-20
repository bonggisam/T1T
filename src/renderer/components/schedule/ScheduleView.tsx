import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';

/**
 * 학사일정 — 학교 홈페이지 webview (NEIS 미사용).
 * 태성중: https://taesung-m.goeyi.kr/taesung-m/ps/schdul/selectSchdulMainList.do?mi=4372
 * 태성고: https://taesung-h.goeyi.kr/taesung-h/ps/schdul/selectSchdulMainList.do?mi=14259
 */
const SCHEDULE_URLS: Record<School, string> = {
  taeseong_middle: 'https://taesung-m.goeyi.kr/taesung-m/ps/schdul/selectSchdulMainList.do?mi=4372',
  taeseong_high: 'https://taesung-h.goeyi.kr/taesung-h/ps/schdul/selectSchdulMainList.do?mi=14259',
};

const SCHOOL_OPTIONS: { key: School; label: string; icon: string }[] = [
  { key: 'taeseong_middle', label: '태성중', icon: '🏫' },
  { key: 'taeseong_high', label: '태성고', icon: '🎓' },
];

interface ScheduleViewProps {
  onBack: () => void;
}

export function ScheduleView({ onBack }: ScheduleViewProps) {
  const { user } = useAuthStore();
  const defaultSchool: School = (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high')
    ? user.school : 'taeseong_middle';
  const [selectedSchool, setSelectedSchool] = useState<School>(defaultSchool);
  const [loading, setLoading] = useState(true);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    const container = webviewContainerRef.current;
    if (!container) return;
    container.innerHTML = '';

    let mounted = true;
    const onStartLoad = () => { if (mounted) setLoading(true); };
    const onStopLoad = () => { if (mounted) setLoading(false); };
    const onFailLoad = () => { if (mounted) setLoading(false); };

    const webview = document.createElement('webview');
    webview.setAttribute('src', SCHEDULE_URLS[selectedSchool]);
    webview.setAttribute('style', 'width: 100%; height: 100%;');
    webview.setAttribute('allowpopups', '');
    webview.setAttribute('partition', 'persist:schedule');
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
  }, [selectedSchool]);

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
        <span style={styles.label}>📚 학사일정</span>
        <button onClick={handleRefresh} style={styles.iconBtn} title="새로고침" aria-label="새로고침">
          🔄
        </button>
      </div>

      <div style={styles.schoolToggle}>
        {SCHOOL_OPTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelectedSchool(s.key)}
            style={{
              ...styles.schoolBtn,
              ...(selectedSchool === s.key ? styles.schoolBtnActive : {}),
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
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
  schoolToggle: {
    display: 'flex', gap: 6,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  schoolBtn: {
    flex: 1,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  schoolBtnActive: {
    background: 'var(--accent)',
    color: '#fff',
    border: '1px solid transparent',
    fontWeight: 700,
  },
  loadingBar: { height: 2, background: 'var(--border-subtle)', overflow: 'hidden', flexShrink: 0 },
  loadingProgress: {
    height: '100%', width: '30%', background: 'var(--accent)',
    animation: 'tpass-loading 1.2s ease-in-out infinite', borderRadius: 2,
  },
  webviewContainer: { flex: 1, overflow: 'hidden' },
};

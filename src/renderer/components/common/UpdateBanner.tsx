import React, { useEffect, useState } from 'react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

interface UpdateInfo {
  version?: string;
  percent?: number;
  error?: string;
}

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo>({});

  useEffect(() => {
    const cleanup = window.electronAPI?.onUpdaterEvent((channel, data) => {
      switch (channel) {
        case 'updater:checking':
          setStatus('checking');
          break;
        case 'updater:available':
          setStatus('available');
          setInfo({ version: data?.version });
          break;
        case 'updater:not-available':
          setStatus('idle');
          break;
        case 'updater:progress':
          setStatus('downloading');
          setInfo((prev) => ({ ...prev, percent: data?.percent }));
          break;
        case 'updater:downloaded':
          setStatus('downloaded');
          break;
        case 'updater:error':
          setStatus('error');
          setInfo((prev) => ({ ...prev, error: typeof data === 'string' ? data : 'Unknown error' }));
          // Auto-dismiss error after 5 seconds
          setTimeout(() => setStatus('idle'), 5000);
          break;
      }
    });
    return cleanup;
  }, []);

  if (status === 'idle' || status === 'checking') return null;

  return (
    <div style={{
      ...styles.banner,
      background: status === 'error' ? 'var(--danger)' : 'var(--accent)',
    }}>
      {status === 'available' && (
        <>
          <span style={styles.text}>
            새 버전 {info.version}이 있습니다
          </span>
          <button onClick={() => window.electronAPI?.updaterDownload()} style={styles.btn}>
            다운로드
          </button>
          <button onClick={() => setStatus('idle')} style={styles.dismissBtn}>✕</button>
        </>
      )}
      {status === 'downloading' && (
        <span style={styles.text}>
          업데이트 다운로드 중... {info.percent ?? 0}%
        </span>
      )}
      {status === 'downloaded' && (
        <>
          <span style={styles.text}>
            업데이트 준비 완료!
          </span>
          <button onClick={() => window.electronAPI?.updaterInstall()} style={styles.btn}>
            지금 재시작
          </button>
          <button onClick={() => setStatus('idle')} style={styles.dismissBtn}>나중에</button>
        </>
      )}
      {status === 'error' && (
        <span style={styles.text}>업데이트 오류: {info.error}</span>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '4px 8px',
    flexShrink: 0,
  },
  text: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
  },
  btn: {
    padding: '2px 10px',
    fontSize: 10,
    fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 4,
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    cursor: 'pointer',
  },
  dismissBtn: {
    padding: '2px 6px',
    fontSize: 10,
    border: 'none',
    background: 'none',
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
  },
};

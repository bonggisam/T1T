import React, { useEffect, useState } from 'react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date';

interface UpdateInfo {
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
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
          // 수동 확인 시 사용자에게 "최신 상태" 명시적 표시 (5초 후 자동 사라짐)
          setStatus('up-to-date');
          setTimeout(() => setStatus('idle'), 5000);
          break;
        case 'updater:progress':
          setStatus('downloading');
          setInfo({
            percent: data?.percent,
            transferred: data?.transferred,
            total: data?.total,
          });
          break;
        case 'updater:downloaded':
          setStatus('downloaded');
          break;
        case 'updater:error':
          setStatus('error');
          setInfo({ error: typeof data === 'string' ? data : 'Unknown error' });
          setTimeout(() => setStatus('idle'), 8000);
          break;
      }
    });
    return cleanup;
  }, []);

  if (status === 'idle' || status === 'checking') return null;

  const fmtMB = (b?: number) => b ? `${(b / 1024 / 1024).toFixed(1)}MB` : '';

  const bg =
    status === 'error' ? 'var(--danger)' :
    status === 'up-to-date' ? '#10B981' :
    status === 'downloaded' ? '#059669' :
    'var(--accent)';

  return (
    <div style={{ ...styles.banner, background: bg }}>
      {status === 'up-to-date' && (
        <>
          <span style={styles.text}>✅ 최신 버전을 사용 중입니다</span>
          <button onClick={() => setStatus('idle')} style={styles.dismissBtn}>✕</button>
        </>
      )}
      {status === 'available' && (
        <>
          <span style={styles.text}>
            🎉 새 버전 v{info.version} — 자동 다운로드 중
          </span>
          <button onClick={() => setStatus('idle')} style={styles.dismissBtn}>✕</button>
        </>
      )}
      {status === 'downloading' && (
        <span style={styles.text}>
          ⬇️ 다운로드 {info.percent ?? 0}% {info.transferred && info.total ? `(${fmtMB(info.transferred)}/${fmtMB(info.total)})` : ''}
        </span>
      )}
      {status === 'downloaded' && (
        <>
          <span style={styles.text}>
            ✨ 업데이트 준비 완료 — 재시작하면 적용됩니다
          </span>
          <button onClick={() => window.electronAPI?.updaterInstall()} style={styles.btn}>
            지금 재시작
          </button>
          <button onClick={() => setStatus('idle')} style={styles.dismissBtn}>나중에</button>
        </>
      )}
      {status === 'error' && (
        <>
          <span style={styles.text}>⚠️ 업데이트 오류: {info.error}</span>
          <button onClick={() => setStatus('idle')} style={styles.dismissBtn}>✕</button>
        </>
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

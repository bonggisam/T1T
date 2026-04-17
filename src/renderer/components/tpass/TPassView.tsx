import React, { useState, useRef } from 'react';

const TPASS_URL = 'https://script.google.com/macros/s/AKfycbzAkY37jTDVAeUfmPtA9uMjyle0pAH3_vFyqTal7RbF0dX_-ATYuALGEWH0O1NWdjT3/exec';

interface TPassViewProps {
  onBack: () => void;
}

export function TPassView({ onBack }: TPassViewProps) {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기">
          📅 캘린더
        </button>
        <span style={styles.label}>TPass</span>
        <button
          onClick={() => {
            if (iframeRef.current) {
              iframeRef.current.src = TPASS_URL;
              setLoading(true);
            }
          }}
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
      <iframe
        ref={iframeRef}
        src={TPASS_URL}
        style={styles.iframe}
        onLoad={() => setLoading(false)}
        title="TPass"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
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
  iframe: {
    flex: 1,
    border: 'none',
    width: '100%',
    background: '#fff',
  },
};

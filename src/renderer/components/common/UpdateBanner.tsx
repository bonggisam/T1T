import React, { useEffect, useRef, useState } from 'react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date';

interface UpdateInfo {
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  error?: string;
  releaseNotes?: string;
  /** 자동 설치 불가(Mac 앱 위치에 쓰기 권한 없음 등) — 수동 다운로드만 안내 */
  manualOnly?: boolean;
  /** 이 시간(분) 동안 입력이 없거나 화면이 잠기면 자동 설치 */
  idleMinutes?: number;
}

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo>({});
  const [installing, setInstalling] = useState(false);
  // 이벤트 핸들러(useEffect [] 클로저)에서 최신 status를 읽기 위한 ref
  const statusRef = useRef<UpdateStatus>('idle');
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    const cleanup = window.electronAPI?.onUpdaterEvent((channel, data) => {
      switch (channel) {
        case 'updater:checking':
          setStatus('checking');
          break;
        case 'updater:available':
          // 30분 재확인에서 같은 버전이 다시 오면 다운로드 완료/진행 상태를 뒤집지 않음
          // (뒤집히면 "지금 재시작 + 설치" 버튼이 사라져 사용자가 설치할 방법을 잃음)
          if (statusRef.current === 'downloaded' || statusRef.current === 'downloading') break;
          setStatus('available');
          // releaseNotes는 string 또는 [{note}] 배열 — 문자열로 정규화
          {
            const rn = data?.releaseNotes;
            const notes = typeof rn === 'string'
              ? rn
              : Array.isArray(rn)
                ? rn.map((x: any) => x?.note || '').join('\n')
                : '';
            setInfo({ version: data?.version, releaseNotes: notes, manualOnly: !!data?.manualOnly });
          }
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
          setInfo((prev) => ({ ...prev, idleMinutes: data?.idleMinutes }));
          break;
        case 'updater:installing':
          // 사용자가 '지금 재시작' 클릭 후 main에서 발송
          setInstalling(true);
          break;
        case 'updater:error': {
          const msg = typeof data === 'string' ? data : 'Unknown error';
          setInstalling(false); // 실패 시 installing 해제 → 사용자가 다시 시도 가능
          if (statusRef.current === 'downloaded') {
            // 설치 시작 단계 실패 — 'downloaded'를 유지해 "지금 재시작 + 설치" 버튼을 살려둠 (재시도 가능).
            // 'error'로 넘기면 12초 뒤 사라지고 앱을 재시작하기 전엔 설치 버튼으로 돌아올 방법이 없었음.
            setInfo((prev) => ({ ...prev, error: msg }));
          } else {
            setStatus('error');
            setInfo({ error: msg });
            setTimeout(() => setStatus('idle'), 12000);
          }
          break;
        }
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
            {info.manualOnly
              ? `🎉 새 버전 v${info.version} — 이 Mac에서는 수동 설치가 필요합니다`
              : `🎉 새 버전 v${info.version} — 자동 다운로드 중`}
          </span>
          {info.manualOnly && (
            <button
              onClick={() => window.electronAPI?.updaterOpenDownloadPage()}
              style={styles.btn}
            >
              📥 다운로드 페이지 열기
            </button>
          )}
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
          {installing ? (
            <>
              <span style={styles.text}>🔄 업데이트 설치 중… 잠시 후 새 버전이 자동으로 열려요 (최대 60초 — 안 뜨면 수동 다운로드)</span>
              <button
                onClick={() => window.electronAPI?.updaterOpenDownloadPage()}
                style={styles.btn}
              >
                수동 다운로드
              </button>
            </>
          ) : (
            <>
              <span style={styles.text}>
                ✨ 업데이트 준비 완료 · {info.idleMinutes ?? 10}분간 자리를 비우거나 화면을 잠그면 자동 설치
                {info.error ? ` — ⚠️ 설치 시작 실패: ${info.error} (다시 시도 가능)` : ''}
              </span>
              <button
                disabled={installing}
                onClick={() => {
                  if (confirm('지금 T1T를 재시작하고 업데이트를 적용할까요?\n\n진행:\n1. 앱이 자동 종료\n2. 새 버전 자동 설치 (몇 초)\n3. 새 버전 자동 실행\n\n만약 자동 설치가 안 되면 "수동 다운로드" 버튼으로 직접 받으세요.')) {
                    setInstalling(true);
                    window.electronAPI?.updaterInstall();
                  }
                }}
                style={styles.btn}
              >
                지금 설치
              </button>
              <button
                onClick={() => window.electronAPI?.updaterOpenDownloadPage()}
                style={styles.btn}
              >
                수동 다운로드
              </button>
              <button onClick={() => setStatus('idle')} style={styles.dismissBtn} title="배너만 닫아요. 자리를 비우면 자동 설치돼요">닫기</button>
            </>
          )}
        </>
      )}
      {status === 'error' && (
        <>
          <span style={styles.text}>⚠️ 자동 업데이트 오류: {info.error}</span>
          <button
            onClick={() => window.electronAPI?.updaterOpenDownloadPage()}
            style={styles.btn}
          >
            수동 다운로드
          </button>
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
    flexWrap: 'wrap',
    gap: 6,
    padding: '6px 10px',
    flexShrink: 0,
  },
  text: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    lineHeight: 1.4,
    flex: '1 1 180px',
    minWidth: 0,
  },
  btn: {
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 700,
    border: 'none',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.22)',
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dismissBtn: {
    padding: '3px 6px',
    fontSize: 11,
    border: 'none',
    background: 'none',
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};

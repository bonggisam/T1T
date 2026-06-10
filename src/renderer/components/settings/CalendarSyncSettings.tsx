import React, { useState } from 'react';
import {
  isGoogleConnected,
  connectGoogle,
  disconnectGoogle,
} from '../../utils/calendarSync';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { forceResyncSharedToGoogle, getSyncDiagnostics, syncSharedEventsToGoogle } from '../../utils/sharedEventsGoogleSync';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';

interface CalendarSyncSettingsProps {
  syncInterval: number;
  onSyncIntervalChange: (minutes: number) => void;
}

const SYNC_INTERVALS = [
  { value: 0.17, label: '10초 (실시간 체감)' },
  { value: 0.25, label: '15초 (권장)' },
  { value: 0.5, label: '30초' },
  { value: 1, label: '1분' },
  { value: 5, label: '5분' },
  { value: 15, label: '15분' },
  { value: 30, label: '30분' },
];

export function CalendarSyncSettings({ syncInterval, onSyncIntervalChange }: CalendarSyncSettingsProps) {
  const [googleConnected, setGoogleConnected] = useState(isGoogleConnected());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const { syncExternalCalendars } = usePersonalEventStore();

  async function handleGoogleConnect() {
    setConnecting(true);
    setError('');
    try {
      const res = await connectGoogle();
      setGoogleConnected(res.success);
      if (res.success) {
        syncExternalCalendars();
      } else {
        setError(res.error || 'Google 연동 실패 — 콘솔 로그 참조');
      }
    } catch (err: any) {
      console.error('[GoogleAuth] connect failed:', err);
      setError(err?.message || '연동 중 오류 발생');
    }
    setConnecting(false);
  }

  function handleGoogleDisconnect() {
    disconnectGoogle();
    setGoogleConnected(false);
  }

  return (
    <div style={styles.container}>
      {/* Google Calendar */}
      <div style={styles.providerRow}>
        <div style={styles.providerInfo}>
          <span style={styles.providerIcon}>📅</span>
          <span style={styles.providerName}>Google Calendar</span>
        </div>
        <div style={styles.providerActions}>
          {googleConnected ? (
            <>
              <span style={styles.connectedBadge}>연동됨</span>
              <button onClick={handleGoogleDisconnect} style={styles.disconnectBtn}>해제</button>
            </>
          ) : (
            <button
              onClick={handleGoogleConnect}
              disabled={connecting}
              style={styles.connectBtn}
            >
              {connecting ? '연결 중...' : '연동'}
            </button>
          )}
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* Sync interval */}
      <div style={styles.syncRow}>
        <span style={styles.label}>🔄 동기화 주기</span>
        <select
          value={syncInterval}
          onChange={(e) => onSyncIntervalChange(Number(e.target.value))}
          style={styles.select}
        >
          {SYNC_INTERVALS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {googleConnected && (
        <>
          <div style={styles.syncRow}>
            <span style={styles.label}>⚡ 즉시 동기화</span>
            <button
              onClick={async () => {
                const { showToast } = await import('../common/Toast');
                showToast('Google Calendar 동기화 중…', 'info');
                try {
                  await syncExternalCalendars();
                  showToast('✅ Google Calendar 동기화 완료', 'success');
                } catch (e: any) {
                  showToast(`❌ 동기화 실패: ${e?.message || '오류'}`, 'error');
                }
              }}
              style={styles.connectBtn}
            >
              지금 동기화
            </button>
          </div>

          {/* 강제 재동기화 — 옛 버전 잔재로 인한 중복/누락 해결용 */}
          <div style={styles.syncRow}>
            <span style={styles.label}>🛠️ 강제 재동기화</span>
            <button
              onClick={async () => {
                const { showToast } = await import('../common/Toast');
                const u = useAuthStore.getState().user;
                if (!u) return;
                if (!confirm('현재 Google 캘린더의 T1T 푸시 일정을 모두 다시 동기화합니다.\n\n중복이나 누락된 일정이 정상화됩니다. 진행할까요?')) return;
                try {
                  forceResyncSharedToGoogle(u.id);
                  showToast('동기화 매핑 초기화 — 재푸시 중…', 'info');
                  if (u.school === 'taeseong_middle' || u.school === 'taeseong_high') {
                    const events = useCalendarStore.getState().events;
                    const r = await syncSharedEventsToGoogle(u.id, u.school, events);
                    showToast(`✅ 재동기화 완료 — 생성 ${r.created}, 수정 ${r.updated}, 정리 ${r.deleted}`, 'success');
                  }
                  await syncExternalCalendars();
                } catch (e: any) {
                  showToast(`❌ 재동기화 실패: ${e?.message || '오류'}`, 'error');
                }
              }}
              style={{ ...styles.connectBtn, background: '#F59E0B' }}
            >
              재동기화
            </button>
          </div>

          {/* 동기화 상태 진단 */}
          {(() => {
            const u = useAuthStore.getState().user;
            if (!u) return null;
            const d = getSyncDiagnostics(u.id);
            return (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                매핑 {d.mappedCount}개 · {d.mapKeyHealthy ? '정상' : '⚠️ 손상'} · 마이그레이션 {d.hasMigrationMark ? '✓' : '미적용'}
              </div>
            );
          })()}

          {/* 공유/학사 일정도 본인 Google Calendar에 자동 push 안내 */}
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'var(--bg-secondary)',
            padding: '6px 10px',
            borderRadius: 6,
            lineHeight: 1.5,
            marginTop: 4,
          }}>
            ℹ️ 본인 학교 공유 일정 + 학사일정도 본인 Google Calendar로 자동 push됨 ([중·공유]/[고·공유]/[전체·공유] 등 학교 표시).<br/>
            <b>개인 일정</b>은 본인 캘린더에만 저장되며 다른 사람과 공유되지 않습니다.
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  providerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    background: 'var(--bg-secondary)',
    borderRadius: 8,
  },
  providerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  providerIcon: {
    fontSize: 16,
  },
  providerName: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  providerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  connectedBadge: {
    fontSize: 10,
    color: 'var(--success)',
    fontWeight: 600,
  },
  connectBtn: {
    padding: '3px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid var(--accent)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--accent)',
    cursor: 'pointer',
  },
  disconnectBtn: {
    padding: '3px 10px',
    fontSize: 11,
    border: '1px solid var(--danger)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
  },
  error: {
    fontSize: 10,
    color: 'var(--danger)',
    margin: 0,
  },
  syncRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  select: {
    padding: '4px 8px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
};

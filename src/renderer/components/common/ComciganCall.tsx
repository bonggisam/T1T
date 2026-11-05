import React, { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { COMCIGAN_SUPPORT_URL, useComciganOutageStore } from '../../store/comciganOutageStore';
import { showToast } from './Toast';

const SCHOOL_SHORT: Record<string, string> = { taeseong_middle: '태성중', taeseong_high: '태성고' };

function isOperator(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

function openSupport(): void {
  window.electronAPI?.openExternal(COMCIGAN_SUPPORT_URL).catch((err) => {
    console.warn('[ComciganCall] openExternal failed:', err);
  });
}

/**
 * 컴시간이 막혔을 때 누르는 단추. 선생님은 운영자에게 알리고, 운영자는 컴시간 문의 게시판을 연다.
 * 하루에 한 번만 알린다.
 */
export function ComciganCallButton({ style }: { style?: React.CSSProperties }) {
  const user = useAuthStore((s) => s.user);
  const calledOn = useComciganOutageStore((s) => s.calledOn);
  const call = useComciganOutageStore((s) => s.call);
  const [busy, setBusy] = useState(false);

  if (isOperator(user?.role)) {
    return <button type="button" onClick={openSupport} style={{ ...styles.call, ...style }}>컴시간 문의</button>;
  }
  if (calledOn === format(new Date(), 'yyyy-MM-dd')) {
    return <span style={{ ...styles.done, ...style }}>운영자에게 알렸습니다</span>;
  }

  async function handleCall() {
    setBusy(true);
    try {
      await call(user?.school ?? '');
      showToast('운영자에게 알렸습니다', 'success');
    } catch (err) {
      console.error('[ComciganCall] call failed:', err);
      showToast('알리지 못했습니다. 안내서의 문의처로 연락해 주세요', 'error');
    }
    setBusy(false);
  }

  return (
    <button type="button" onClick={handleCall} disabled={busy} style={{ ...styles.call, ...style }}>
      운영자에게 알리기
    </button>
  );
}

/** 시간표를 오래 받지 못할 때 어느 화면에서나 보이는 줄. 닫으면 그날은 다시 띄우지 않는다. */
export function ComciganOutageBanner() {
  const outage = useComciganOutageStore((s) => s.outage);
  const dismissedOn = useComciganOutageStore((s) => s.dismissedOn);
  const dismissToday = useComciganOutageStore((s) => s.dismissToday);

  if (!outage || dismissedOn === format(new Date(), 'yyyy-MM-dd')) return null;

  return (
    <div role="status" style={styles.banner}>
      <AlertTriangle size={12} strokeWidth={2.4} style={styles.icon} />
      <span style={styles.summary} title="수업 표시와 수업 화면 보호는 마지막으로 받은 시간표를 따릅니다">
        컴시간에서 시간표를 받지 못하고 있습니다
      </span>
      <ComciganCallButton />
      <button type="button" onClick={dismissToday} style={styles.plain}>닫기</button>
    </div>
  );
}

/** 운영자에게만 보이는 줄. 확인을 누를 때까지 남는다. */
export function OperatorOutageBanner() {
  const alert = useComciganOutageStore((s) => s.alert);
  const acknowledge = useComciganOutageStore((s) => s.acknowledge);

  if (!alert || alert.count <= 0) return null;

  async function handleAcknowledge() {
    try {
      await acknowledge();
    } catch (err) {
      console.error('[ComciganCall] acknowledge failed:', err);
      showToast('확인을 저장하지 못했습니다', 'error');
    }
  }

  const when = alert.reportedAt ? format(alert.reportedAt, 'M/d HH:mm') : '';
  const school = SCHOOL_SHORT[alert.school] ?? '';
  const detail = [when, school, alert.appVersion && `v${alert.appVersion}`].filter(Boolean).join(' · ');

  return (
    <div role="alert" style={styles.banner}>
      <AlertTriangle size={12} strokeWidth={2.4} style={styles.icon} />
      <span style={styles.summary} title={detail}>
        컴시간이 막혔다는 알림 {alert.count}건{detail ? ` · ${detail}` : ''}
      </span>
      <button type="button" onClick={openSupport} style={styles.call}>컴시간 문의</button>
      <button type="button" onClick={handleAcknowledge} style={styles.plain}>확인</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    background: 'var(--warning-soft)',
    borderBottom: '1px solid var(--warning-edge)',
  },
  icon: {
    flexShrink: 0,
    color: 'var(--warning)',
  },
  summary: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  call: {
    flexShrink: 0,
    padding: '1px 8px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  done: {
    flexShrink: 0,
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  },
  plain: {
    flexShrink: 0,
    padding: '1px 4px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

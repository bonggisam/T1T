import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { computeHidden, usePersonalHidden, usePrivacyStore } from '../../store/privacyStore';

/**
 * 가린 동안 안의 내용을 그리지 않는다.
 * 쓰던 글이 사라지지 않도록 내리지 않고 표시만 끈다. 가림이 풀리면 하던 그대로 돌아온다.
 */
export function PrivateContent({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const hidden = usePersonalHidden();
  return (
    <>
      <div style={{ display: hidden ? 'none' : 'contents' }}>{children}</div>
      {hidden && fallback}
    </>
  );
}

/** 화면 전체가 개인 내용일 때 대신 보여 주는 안내. 위쪽 줄의 "지금 보기"로 되돌린다. */
export function PrivateNotice({ children }: { children: React.ReactNode }) {
  return <div style={styles.notice}>{children}</div>;
}

/** 왜 개인 일정이 안 보이는지, 어떻게 되돌리는지 알려 주는 줄. 수업 중에 잠시 보이게 한 동안에도 표시한다. */
export function PrivacyBanner() {
  const inClass = usePrivacyStore((s) => s.inClass);
  const manual = usePrivacyStore((s) => s.manual);
  const toggle = usePrivacyStore((s) => s.toggle);
  const hidden = computeHidden(inClass, manual);

  if (!hidden && !inClass) return null;

  const message = !hidden
    ? '수업 중인데 개인 일정이 보이고 있습니다'
    : manual === 'hide'
      ? '개인 일정을 가렸습니다'
      : '수업 시간이라 개인 일정을 가렸습니다';

  return (
    <div role="status" style={styles.banner}>
      {hidden ? <EyeOff size={12} strokeWidth={2.2} /> : <Eye size={12} strokeWidth={2.2} />}
      <span style={styles.message}>{message}</span>
      <button onClick={toggle} style={styles.button} title="Ctrl+Shift+H">
        {hidden ? '지금 보기' : '다시 가리기'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  notice: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    fontSize: 'var(--fs-control)',
    textAlign: 'center',
    color: 'var(--text-secondary)',
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    padding: '3px 10px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  message: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  button: {
    flexShrink: 0,
    padding: '1px 8px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--accent)',
    background: 'transparent',
    border: '1px solid var(--accent)',
    borderRadius: 6,
    cursor: 'pointer',
  },
};

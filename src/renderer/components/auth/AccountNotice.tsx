import React from 'react';
import { useAuthStore } from '../../store/authStore';

interface AccountNoticeProps {
  title: string;
  message: string;
  /** 있으면 "다시 시도" 단추를 보여 준다 */
  onRetry?: () => void;
}

/** 달력을 열 수 없을 때의 안내. 공용 PC에서 다른 계정으로 바꿀 수 있게 로그아웃을 항상 둔다 */
export function AccountNotice({ title, message, onRetry }: AccountNoticeProps) {
  const logout = useAuthStore((s) => s.logout);
  return (
    <div style={styles.container}>
      <div className="animate-fade-in" style={styles.content}>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          {onRetry && <button onClick={onRetry} style={styles.primary}>다시 시도</button>}
          <button onClick={logout} style={styles.secondary}>로그아웃</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { textAlign: 'center', maxWidth: 320 },
  title: { fontSize: 'var(--fs-heading)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 },
  message: { fontSize: 'var(--fs-lead)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 },
  actions: { display: 'flex', gap: 8, justifyContent: 'center' },
  primary: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 7,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondary: {
    padding: '6px 14px',
    border: '1px solid var(--border-color)',
    borderRadius: 7,
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--fs-body)',
    cursor: 'pointer',
  },
};

import React from 'react';
import { useAuthStore } from '../../store/authStore';

export function PendingApproval() {
  const { logout } = useAuthStore();

  return (
    <div style={styles.container}>
      <div className="animate-fade-in" style={styles.content}>
        <div style={styles.icon}>⏳</div>
        <h2 style={styles.title}>승인 대기 중</h2>
        <p style={styles.message}>
          관리자의 승인을 기다리고 있습니다.
        </p>
        <p style={styles.submessage}>
          승인이 완료되면 로그인할 수 있습니다.
        </p>
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    textAlign: 'center',
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  submessage: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 20,
  },
  logoutBtn: {
    padding: '8px 24px',
    fontSize: 13,
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};

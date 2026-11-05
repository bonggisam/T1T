import React, { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { useAuthStore } from '../../store/authStore';

export function PendingApproval() {
  const { logout, user } = useAuthStore();

  // 내 user 문서 변화를 실시간 감지 → 승인되면 자동 새로고침
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.id), (snap) => {
      const data = snap.data();
      if (data && data.status !== 'pending') {
        // 승인이나 거절이 정해지면 그 화면으로 간다 (onAuthStateChanged 재발동)
        window.location.reload();
      }
    }, (err) => console.warn('[PendingApproval] listener failed:', err));
    return () => unsub();
  }, [user?.id]);

  return (
    <div style={styles.container}>
      <div className="animate-fade-in" style={styles.content}>
        <div style={styles.icon}></div>
        <h2 style={styles.title}>승인 대기 중</h2>
        <p style={styles.message}>
          관리자의 승인을 기다리고 있습니다.
        </p>
        <p style={styles.submessage}>
          승인이 완료되면 자동으로 화면이 전환됩니다.
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
    fontSize: 'var(--fs-hero)',
    marginBottom: 12,
  },
  title: {
    fontSize: 'var(--fs-heading)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  message: {
    fontSize: 'var(--fs-lead)',
    color: 'var(--text-secondary)',
    marginBottom: 4,
  },
  submessage: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-muted)',
    marginBottom: 20,
  },
  logoutBtn: {
    padding: '8px 24px',
    fontSize: 'var(--fs-control)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};

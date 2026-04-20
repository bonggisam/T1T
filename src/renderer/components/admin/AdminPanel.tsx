import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, limit as fsLimit, orderBy } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { useAuthStore } from '../../store/authStore';
import { showToast } from '../common/Toast';
import type { User, UserStatus } from '@shared/types';
import { SCHOOL_LABELS } from '@shared/types';

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const { user } = useAuthStore();
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [tab, setTab] = useState<'pending' | 'active'>('pending');
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  if (!isAdmin) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>관리자 권한이 필요합니다.</p>
      </div>
    );
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      // Fetch pending users (최대 200명)
      const pendingQ = query(collection(db, 'users'), where('status', '==', 'pending'), fsLimit(200));
      const pendingSnap = await getDocs(pendingQ);
      const pending = pendingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as User));

      // Fetch active users (최대 500명)
      const activeQ = query(collection(db, 'users'), where('status', '==', 'active'), fsLimit(500));
      const activeSnap = await getDocs(activeQ);
      const active = activeSnap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as User));

      setPendingUsers(pending);
      setActiveUsers(active);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
    setLoading(false);
  }

  async function handleApprove(userId: string, role: 'teacher' | 'head_teacher' = 'teacher') {
    try {
      await updateDoc(doc(db, 'users', userId), { status: 'active', role });
      fetchUsers();
    } catch (err) {
      console.error('Approve failed:', err);
      showToast('승인 처리에 실패했습니다.', 'error');
    }
  }

  async function handleReject(userId: string) {
    try {
      await updateDoc(doc(db, 'users', userId), { status: 'rejected' });
      fetchUsers();
    } catch (err) {
      console.error('Reject failed:', err);
      showToast('거절 처리에 실패했습니다.', 'error');
    }
  }

  async function handleChangeRole(userId: string, role: 'teacher' | 'head_teacher') {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
      fetchUsers();
    } catch (err) {
      console.error('Role change failed:', err);
      showToast('역할 변경에 실패했습니다.', 'error');
    }
  }

  async function handleDeactivate(userId: string) {
    try {
      await updateDoc(doc(db, 'users', userId), { status: 'deactivated' });
      fetchUsers();
    } catch (err) {
      console.error('Deactivate failed:', err);
      showToast('비활성화 처리에 실패했습니다.', 'error');
    }
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>👥 사용자 관리</h3>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      {/* Tab buttons */}
      <div style={styles.tabs}>
        <button
          onClick={() => setTab('pending')}
          style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }}
        >
          승인 대기 ({pendingUsers.length})
        </button>
        <button
          onClick={() => setTab('active')}
          style={{ ...styles.tab, ...(tab === 'active' ? styles.tabActive : {}) }}
        >
          활성 사용자 ({activeUsers.length})
        </button>
      </div>

      {/* Content */}
      <div style={styles.list}>
        {loading ? (
          <p style={styles.emptyMsg}>로딩 중...</p>
        ) : tab === 'pending' ? (
          pendingUsers.length === 0 ? (
            <p style={styles.emptyMsg}>대기 중인 요청이 없습니다.</p>
          ) : (
            pendingUsers.map((u) => (
              <div key={u.id} style={styles.userCard}>
                <div style={styles.userInfo}>
                  <span style={styles.userName}>
                    {u.name}
                    <span style={{
                      ...styles.schoolBadge,
                      background: u.school === 'taeseong_high' ? '#8B5CF6' : '#10B981',
                    }}>
                      {u.school === 'taeseong_high' ? '🎓 고' : '🏫 중'}
                    </span>
                  </span>
                  <span style={styles.userEmail}>{u.email} · {SCHOOL_LABELS[u.school] || '미지정'}</span>
                </div>
                <div style={styles.userActions}>
                  <button onClick={() => handleApprove(u.id, 'teacher')} style={styles.approveBtn}>교사</button>
                  <button onClick={() => handleApprove(u.id, 'head_teacher')} style={styles.approveHeadBtn}>부장</button>
                  <button onClick={() => handleReject(u.id)} style={styles.rejectBtn}>거절</button>
                </div>
              </div>
            ))
          )
        ) : (
          activeUsers.length === 0 ? (
            <p style={styles.emptyMsg}>활성 사용자가 없습니다.</p>
          ) : (
            activeUsers.map((u) => (
              <div key={u.id} style={styles.userCard}>
                <div style={styles.userInfo}>
                  <span style={styles.userName}>
                    {u.name}
                    <span style={{
                      ...styles.schoolBadge,
                      background: u.school === 'taeseong_high' ? '#8B5CF6' : '#10B981',
                    }}>
                      {u.school === 'taeseong_high' ? '🎓 고' : '🏫 중'}
                    </span>
                    <span style={{
                      ...styles.roleBadge,
                      background: u.role === 'head_teacher' ? '#F59E0B' : 'var(--accent)',
                    }}>
                      {u.role === 'super_admin' ? '슈퍼관리자' : u.role === 'admin' ? '관리자' : u.role === 'head_teacher' ? '부장교사' : '교사'}
                    </span>
                  </span>
                  <span style={styles.userEmail}>{u.email} · {SCHOOL_LABELS[u.school] || '미지정'}</span>
                </div>
                <div style={styles.userActions}>
                  {u.role === 'teacher' && (
                    <button onClick={() => handleChangeRole(u.id, 'head_teacher')} style={styles.promoteBtn}>부장 승격</button>
                  )}
                  {u.role === 'head_teacher' && (
                    <button onClick={() => handleChangeRole(u.id, 'teacher')} style={styles.demoteBtn}>교사 변경</button>
                  )}
                  {(u.role === 'teacher' || u.role === 'head_teacher') && (
                    <button onClick={() => handleDeactivate(u.id)} style={styles.deactivateBtn}>비활성화</button>
                  )}
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '0 12px 12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--text-muted)',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    padding: '6px 0',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: 'var(--accent)',
    color: '#fff',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  emptyMsg: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 40,
  },
  userCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    background: 'var(--bg-secondary)',
    borderRadius: 8,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  userEmail: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  roleBadge: {
    fontSize: 9,
    padding: '1px 6px',
    borderRadius: 4,
    background: 'var(--accent)',
    color: '#fff',
    fontWeight: 500,
  },
  schoolBadge: {
    fontSize: 9,
    padding: '1px 6px',
    borderRadius: 4,
    color: '#fff',
    fontWeight: 600,
    marginLeft: 4,
  },
  userActions: {
    display: 'flex',
    gap: 4,
  },
  approveBtn: {
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--success)',
    color: '#fff',
    cursor: 'pointer',
  },
  rejectBtn: {
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--danger)',
    color: '#fff',
    cursor: 'pointer',
  },
  approveHeadBtn: {
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: '#F59E0B',
    color: '#fff',
    cursor: 'pointer',
  },
  promoteBtn: {
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid #F59E0B',
    borderRadius: 6,
    background: 'transparent',
    color: '#F59E0B',
    cursor: 'pointer',
  },
  demoteBtn: {
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid var(--text-muted)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  deactivateBtn: {
    padding: '4px 10px',
    fontSize: 11,
    border: '1px solid var(--danger)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
  },
};

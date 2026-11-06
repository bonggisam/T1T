import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, limit as fsLimit, orderBy } from 'firebase/firestore';
import { reconcileUserDirectory } from '../../utils/userDirectory';
import { db } from '../../utils/firebase';
import { useAuthStore } from '../../store/authStore';
import { showToast } from '../common/Toast';
import type { User, UserStatus } from '@shared/types';
import { SCHOOL_LABELS } from '@shared/types';
import { Ic } from '../common/Ic';
import { TeachingTable } from './TeachingTable';

interface AdminPanelProps {
  onClose: () => void;
}

type SchoolFilter = 'all' | 'taeseong_middle' | 'taeseong_high';

interface ActiveUserCardProps {
  u: User;
  onChangeRole: (userId: string, role: 'teacher' | 'head_teacher') => void;
  onDeactivate: (userId: string) => void;
  onChangeSchool: (userId: string, school: 'taeseong_middle' | 'taeseong_high') => void;
}

function ActiveUserCard({ u, onChangeRole, onDeactivate, onChangeSchool }: ActiveUserCardProps) {
  const isSuperAdmin = u.role === 'super_admin';
  const isSchoolAssigned = u.school === 'taeseong_middle' || u.school === 'taeseong_high';
  // 슈퍼관리자는 학교 구분 없이 전체 관리
  const schoolBadgeBg = isSuperAdmin
    ? 'var(--warning)'
    : u.school === 'taeseong_high'
      ? 'var(--school-high)'
      : u.school === 'taeseong_middle'
        ? 'var(--school-middle)'
        : 'var(--neutral-badge)';
  const schoolBadgeText = isSuperAdmin
    ? '전체'
    : u.school === 'taeseong_high' ? '고' : u.school === 'taeseong_middle' ? '중' : '미지정';
  return (
    <div style={styles.userCard}>
      <div style={styles.userInfo}>
        <span style={styles.userName}>
          {u.name}
          <span style={{
            ...styles.schoolBadge,
            background: schoolBadgeBg,
          }}>
            {schoolBadgeText}
          </span>
          <span style={{
            ...styles.roleBadge,
            background: u.role === 'head_teacher' ? 'var(--warning)' : 'var(--accent)',
          }}>
            {u.role === 'super_admin' ? '슈퍼관리자' : u.role === 'admin' ? '관리자' : u.role === 'head_teacher' ? '부장교사' : '교사'}
          </span>
        </span>
        <span style={styles.userEmail}>{u.email} · {SCHOOL_LABELS[u.school] || '미지정'}</span>
      </div>
      <div style={styles.userActions}>
        {/* 슈퍼관리자는 학교 배정 불필요 */}
        {!isSuperAdmin && !isSchoolAssigned && (
          <>
            <button onClick={() => onChangeSchool(u.id, 'taeseong_middle')} style={styles.assignMiddleBtn} aria-label={`${u.name}을 태성중으로 배정`}>중 배정</button>
            <button onClick={() => onChangeSchool(u.id, 'taeseong_high')} style={styles.assignHighBtn} aria-label={`${u.name}을 태성고로 배정`}>고 배정</button>
          </>
        )}
        {/* 학교 배정된 경우 변경 버튼 (반대편 학교로) */}
        {!isSuperAdmin && isSchoolAssigned && (
          <button
            onClick={() => onChangeSchool(
              u.id,
              u.school === 'taeseong_high' ? 'taeseong_middle' : 'taeseong_high',
            )}
            style={styles.switchSchoolBtn}
            title="학교 변경"
            aria-label={`${u.name}의 학교를 ${u.school === 'taeseong_high' ? '태성중' : '태성고'}으로 변경`}
          >
            {u.school === 'taeseong_high' ? '→중' : '→고'}
          </button>
        )}
        {u.role === 'teacher' && (
          <button onClick={() => onChangeRole(u.id, 'head_teacher')} style={styles.promoteBtn}>부장 승격</button>
        )}
        {u.role === 'head_teacher' && (
          <button onClick={() => onChangeRole(u.id, 'teacher')} style={styles.demoteBtn}>교사 변경</button>
        )}
        {(u.role === 'teacher' || u.role === 'head_teacher') && (
          <button onClick={() => onDeactivate(u.id)} style={styles.deactivateBtn}>비활성화</button>
        )}
      </div>
    </div>
  );
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const { user } = useAuthStore();
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<'pending' | 'active' | 'blocked' | 'links'>('pending');
  const [schoolFilter, setSchoolFilter] = useState<SchoolFilter>('all');
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  if (!isAdmin) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 'var(--fs-control)', color: 'var(--text-muted)' }}>관리자 권한이 필요합니다.</p>
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

      // 비활성화하거나 거절한 사람도 보여 줘야 되돌릴 수 있다
      const blockedQ = query(collection(db, 'users'), where('status', 'in', ['deactivated', 'rejected']), fsLimit(500));
      const blockedSnap = await getDocs(blockedQ);
      const blocked = blockedSnap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as User));

      setPendingUsers(pending);
      setActiveUsers(active);
      setBlockedUsers(blocked);
      setLoadFailed(false);
      // 승인, 비활성화, 학교 변경을 알림 대상 명단에 맞춘다
      reconcileUserDirectory().catch((err) => console.warn('[Directory] reconcile failed:', err));
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setLoadFailed(true);
    }
    setLoading(false);
  }

  async function handleRestore(target: User) {
    const next = target.status === 'rejected' ? 'pending' : 'active';
    try {
      await updateDoc(doc(db, 'users', target.id), { status: next });
      showToast(next === 'active' ? `${target.name} 교사를 다시 활성화했습니다.` : `${target.name} 교사를 승인 대기로 옮겼습니다.`);
    } catch (err) {
      console.error('Restore failed:', err);
      showToast('되돌리지 못했습니다.', 'error');
    } finally {
      fetchUsers();
    }
  }

  async function handleApprove(userId: string, role: 'teacher' | 'head_teacher' = 'teacher') {
    // 학교 미지정 교사 승인 시 경고
    const target = pendingUsers.find((u) => u.id === userId);
    if (target && target.school !== 'taeseong_middle' && target.school !== 'taeseong_high') {
      const ok = window.confirm(
        `${target.name} 교사의 학교가 미지정되어 있습니다.\n먼저 학교를 배정한 후 승인하는 것을 권장합니다.\n\n그래도 승인하시겠습니까?`
      );
      if (!ok) return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), { status: 'active', role });
    } catch (err) {
      console.error('Approve failed:', err);
      showToast('승인 처리에 실패했습니다.', 'error');
    } finally {
      fetchUsers();
    }
  }

  async function handleReject(userId: string) {
    const target = pendingUsers.find((u) => u.id === userId);
    if (!window.confirm(`${target?.name ?? '이 사용자'}의 가입을 거절할까요?\n"비활성·거절" 목록에서 되돌릴 수 있습니다.`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { status: 'rejected' });
    } catch (err) {
      console.error('Reject failed:', err);
      showToast('거절 처리에 실패했습니다.', 'error');
    } finally {
      fetchUsers();
    }
  }

  async function handleChangeRole(userId: string, role: 'teacher' | 'head_teacher') {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
    } catch (err) {
      console.error('Role change failed:', err);
      showToast('역할 변경에 실패했습니다.', 'error');
    } finally {
      fetchUsers();
    }
  }

  async function handleDeactivate(userId: string) {
    const target = activeUsers.find((u) => u.id === userId);
    if (!window.confirm(`${target?.name ?? '이 사용자'} 교사를 비활성화할까요?\n달력을 쓸 수 없게 되며, "비활성·거절" 목록에서 되돌릴 수 있습니다.`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { status: 'deactivated' });
    } catch (err) {
      console.error('Deactivate failed:', err);
      showToast('비활성화 처리에 실패했습니다.', 'error');
    } finally {
      fetchUsers();
    }
  }

  async function handleChangeSchool(userId: string, school: 'taeseong_middle' | 'taeseong_high') {
    try {
      await updateDoc(doc(db, 'users', userId), { school });
      showToast(`${school === 'taeseong_high' ? '태성고' : '태성중'}으로 배정했습니다.`);
    } catch (err) {
      console.error('School change failed:', err);
      showToast('학교 배정에 실패했습니다.', 'error');
    } finally {
      fetchUsers(); // 성공/실패 관계없이 UI 동기화
    }
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}><Ic name="users" />사용자 관리</h3>
        <button onClick={onClose} style={styles.closeBtn}><Ic name="x" gap={false} /></button>
      </div>

      {/* Tab buttons */}
      <div style={styles.tabs}>
        <button
          onClick={() => { setTab('pending'); setSchoolFilter('all'); }}
          style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }}
        >
          승인 대기 ({pendingUsers.length})
        </button>
        <button
          onClick={() => { setTab('active'); setSchoolFilter('all'); }}
          style={{ ...styles.tab, ...(tab === 'active' ? styles.tabActive : {}) }}
        >
          활성 사용자 ({activeUsers.length})
        </button>
        <button
          onClick={() => { setTab('blocked'); setSchoolFilter('all'); }}
          style={{ ...styles.tab, ...(tab === 'blocked' ? styles.tabActive : {}) }}
        >
          비활성·거절 ({blockedUsers.length})
        </button>
        <button
          onClick={() => { setTab('links'); setSchoolFilter('all'); }}
          style={{ ...styles.tab, ...(tab === 'links' ? styles.tabActive : {}) }}
        >
          담당 학급 표
        </button>
      </div>

      {/* 학교별 서브필터 (활성 탭에서만) */}
      {tab === 'active' && (
        <div style={styles.subFilter}>
          {(['all', 'taeseong_middle', 'taeseong_high'] as SchoolFilter[]).map((s) => {
            const count = s === 'all'
              ? activeUsers.length
              : activeUsers.filter((u) => u.school === s).length;
            const label = s === 'all' ? '전체' : s === 'taeseong_middle' ? '태성중' : '태성고';
            return (
              <button
                key={s}
                onClick={() => setSchoolFilter(s)}
                style={{ ...styles.subFilterBtn, ...(schoolFilter === s ? styles.subFilterBtnActive : {}) }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {tab === 'links' && !loading && <TeachingTable users={activeUsers} />}

      {/* Content */}
      {tab !== 'links' && <div style={styles.list}>
        {loading ? (
          <p style={styles.emptyMsg}>로딩 중...</p>
        ) : loadFailed ? (
          <div style={styles.emptyMsg}>
            <p>사용자 목록을 읽지 못했습니다. 인터넷 연결을 확인해 주세요.</p>
            <button onClick={fetchUsers} style={styles.approveBtn}>다시 시도</button>
          </div>
        ) : tab === 'blocked' ? (
          blockedUsers.length === 0 ? (
            <p style={styles.emptyMsg}>비활성화하거나 거절한 사용자가 없습니다.</p>
          ) : (
            blockedUsers.map((u) => (
              <div key={u.id} style={styles.userCard}>
                <div style={styles.userInfo}>
                  <span style={styles.userName}>{u.name}</span>
                  <span style={styles.userEmail}>{u.email} · {u.status === 'rejected' ? '가입 거절' : '비활성화'}</span>
                </div>
                <div style={styles.userActions}>
                  <button onClick={() => handleRestore(u)} style={styles.approveBtn}>
                    {u.status === 'rejected' ? '승인 대기로' : '다시 활성화'}
                  </button>
                </div>
              </div>
            ))
          )
        ) : tab === 'pending' ? (
          pendingUsers.length === 0 ? (
            <p style={styles.emptyMsg}>대기 중인 요청이 없습니다.</p>
          ) : (
            pendingUsers.map((u) => {
              const isSchoolAssigned = u.school === 'taeseong_middle' || u.school === 'taeseong_high';
              const badgeBg = u.school === 'taeseong_high'
                ? 'var(--school-high)'
                : u.school === 'taeseong_middle'
                  ? 'var(--school-middle)'
                  : 'var(--neutral-badge)'; // 미지정 회색
              const badgeText = u.school === 'taeseong_high' ? '고' : u.school === 'taeseong_middle' ? '중' : '미지정';
              return (
                <div key={u.id} style={styles.userCard}>
                  <div style={styles.userInfo}>
                    <span style={styles.userName}>
                      {u.name}
                      <span style={{ ...styles.schoolBadge, background: badgeBg }}>{badgeText}</span>
                    </span>
                    <span style={styles.userEmail}>{u.email} · {SCHOOL_LABELS[u.school] || '미지정'}</span>
                  </div>
                  <div style={styles.userActions}>
                    {!isSchoolAssigned && (
                      <>
                        <button onClick={() => handleChangeSchool(u.id, 'taeseong_middle')} style={styles.assignMiddleBtn} aria-label={`${u.name}을 태성중으로 배정`}>중</button>
                        <button onClick={() => handleChangeSchool(u.id, 'taeseong_high')} style={styles.assignHighBtn} aria-label={`${u.name}을 태성고로 배정`}>고</button>
                      </>
                    )}
                    <button onClick={() => handleApprove(u.id, 'teacher')} style={styles.approveBtn}>교사</button>
                    <button onClick={() => handleApprove(u.id, 'head_teacher')} style={styles.approveHeadBtn}>부장</button>
                    <button onClick={() => handleReject(u.id)} style={styles.rejectBtn}>거절</button>
                  </div>
                </div>
              );
            })
          )
        ) : (
          (() => {
            const filteredActive = schoolFilter === 'all'
              ? activeUsers
              : activeUsers.filter((u) => u.school === schoolFilter);

            if (filteredActive.length === 0) {
              return <p style={styles.emptyMsg}>해당 학교에 활성 사용자가 없습니다.</p>;
            }

            // 전체일 때는 학교별 그룹핑 (슈퍼관리자는 별도 그룹)
            if (schoolFilter === 'all') {
              const superAdmins = activeUsers.filter((u) => u.role === 'super_admin');
              const normalUsers = activeUsers.filter((u) => u.role !== 'super_admin');
              const middle = normalUsers.filter((u) => u.school === 'taeseong_middle');
              const high = normalUsers.filter((u) => u.school === 'taeseong_high');
              const other = normalUsers.filter((u) => u.school !== 'taeseong_middle' && u.school !== 'taeseong_high');

              return (
                <>
                  {/* 슈퍼관리자는 학교 구분 없이 상단 표시 */}
                  {superAdmins.length > 0 && (
                    <>
                      <div style={{ ...styles.groupHeader, color: 'var(--warning)' }}><Ic name="crown" />전체 관리자 ({superAdmins.length})</div>
                      {superAdmins.map((u) => <ActiveUserCard key={u.id} u={u} onChangeRole={handleChangeRole} onDeactivate={handleDeactivate} onChangeSchool={handleChangeSchool} />)}
                    </>
                  )}
                  {/* 미지정 교사를 먼저 처리할 수 있게 맨 위 노출 */}
                  {other.length > 0 && (
                    <>
                      <div style={{ ...styles.groupHeader, color: 'var(--danger)' }}><Ic name="alert" />학교 미지정 ({other.length}) — 배정이 필요합니다</div>
                      {other.map((u) => <ActiveUserCard key={u.id} u={u} onChangeRole={handleChangeRole} onDeactivate={handleDeactivate} onChangeSchool={handleChangeSchool} />)}
                    </>
                  )}
                  {middle.length > 0 && (
                    <>
                      <div style={styles.groupHeader}><Ic name="school" />태성중학교 ({middle.length})</div>
                      {middle.map((u) => <ActiveUserCard key={u.id} u={u} onChangeRole={handleChangeRole} onDeactivate={handleDeactivate} onChangeSchool={handleChangeSchool} />)}
                    </>
                  )}
                  {high.length > 0 && (
                    <>
                      <div style={styles.groupHeader}><Ic name="graduation" />태성고등학교 ({high.length})</div>
                      {high.map((u) => <ActiveUserCard key={u.id} u={u} onChangeRole={handleChangeRole} onDeactivate={handleDeactivate} onChangeSchool={handleChangeSchool} />)}
                    </>
                  )}
                </>
              );
            }

            // 특정 학교 선택 시: 플랫 리스트
            return filteredActive.map((u) => <ActiveUserCard key={u.id} u={u} onChangeRole={handleChangeRole} onDeactivate={handleDeactivate} onChangeSchool={handleChangeSchool} />);
          })()
        )}
      </div>}
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
    fontSize: 'var(--fs-subtitle)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--fs-lead)',
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
    fontSize: 'var(--fs-body)',
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
    color: 'var(--on-accent)',
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
    fontSize: 'var(--fs-control)',
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
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  userEmail: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  roleBadge: {
    fontSize: 'var(--fs-tiny)',
    padding: '1px 6px',
    borderRadius: 4,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontWeight: 500,
  },
  schoolBadge: {
    fontSize: 'var(--fs-tiny)',
    padding: '1px 6px',
    borderRadius: 4,
    color: 'var(--on-accent)',
    fontWeight: 600,
    marginLeft: 4,
  },
  subFilter: {
    display: 'flex',
    gap: 4,
    marginBottom: 8,
  },
  subFilterBtn: {
    flex: 1,
    padding: '4px 8px',
    fontSize: 'var(--fs-caption)',
    fontWeight: 600,
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  subFilterBtnActive: {
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    border: '1px solid var(--accent)',
  },
  groupHeader: {
    fontSize: 'var(--fs-label)',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    padding: '8px 4px 4px',
    borderBottom: '1px solid var(--border-subtle)',
    marginTop: 4,
    marginBottom: 4,
  },
  userActions: {
    display: 'flex',
    gap: 4,
  },
  approveBtn: {
    padding: '4px 12px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--success)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
  rejectBtn: {
    padding: '4px 12px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--danger)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
  approveHeadBtn: {
    padding: '4px 12px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--warning)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
  promoteBtn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--warning)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--warning)',
    cursor: 'pointer',
  },
  assignMiddleBtn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--school-middle)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
  assignHighBtn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--school-high)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
  switchSchoolBtn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    fontWeight: 500,
    border: '1px dashed var(--text-muted)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  demoteBtn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--text-muted)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  deactivateBtn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--danger)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
  },
};

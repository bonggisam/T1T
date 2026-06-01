import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Search, Plus, Pencil, Trash2, Check, X, Copy, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useKeyphoneStore, type KeyphoneEntry } from '../../store/keyphoneStore';
import { showToast } from '../common/Toast';
import type { School } from '@shared/types';

interface KeyphoneViewProps {
  onBack: () => void;
}

/**
 * 학교별 색상 — 라이트/다크 모드 분리.
 * 다크 모드에서 보라가 너무 어두워 안 보이는 문제 해결을 위해 밝은 색조 사용.
 */
const SCHOOL_COLORS = {
  taeseong_middle: { light: '#10B981', dark: '#34D399' }, // 그린(light) → 그린-400(dark)
  taeseong_high:   { light: '#8B5CF6', dark: '#C4B5FD' }, // 바이올렛-500 → 바이올렛-300 (훨씬 밝게)
};

/** 키폰 번호부 — 양교 전화번호 조회 + 관리자 편집. */
export function KeyphoneView({ onBack }: KeyphoneViewProps) {
  const { user } = useAuthStore();
  const { entries, loading, subscribe, cleanup, addEntry, updateEntry, deleteEntry, seedIfEmpty, resetAndReseed } = useKeyphoneStore();

  // 수정 권한: admin / super_admin 만 (부장 제외)
  const canEdit = user?.role === 'super_admin' || user?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const autoSeedAttempted = React.useRef(false);

  // 다크모드 감지 — data-theme 속성 변경 추적 (실시간 반영)
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const SCHOOLS = useMemo<{ key: School; label: string; icon: string; color: string }[]>(() => [
    { key: 'taeseong_middle', label: '태성중학교', icon: '🏫', color: isDark ? SCHOOL_COLORS.taeseong_middle.dark : SCHOOL_COLORS.taeseong_middle.light },
    { key: 'taeseong_high',   label: '태성고등학교', icon: '🎓', color: isDark ? SCHOOL_COLORS.taeseong_high.dark : SCHOOL_COLORS.taeseong_high.light },
  ], [isDark]);

  const defaultSchool: School = (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high')
    ? user.school : 'taeseong_middle';
  const [selectedSchool, setSelectedSchool] = useState<School>(defaultSchool);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<KeyphoneEntry>>({});
  const [addingForSchool, setAddingForSchool] = useState<School | null>(null);
  const [addDraft, setAddDraft] = useState<Partial<KeyphoneEntry>>({});
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    subscribe();
    return () => cleanup();
    // M6: zustand 함수는 마운트 시 1회만 호출 — 의존성에 넣으면 매 렌더 재구독 위험
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmpty = !loading && entries.length === 0;

  // 관리자가 진입하고 컬렉션이 비어 있으면 자동으로 1회 시드
  useEffect(() => {
    if (!canEdit) return;
    if (loading) return;
    if (!isEmpty) return;
    if (autoSeedAttempted.current) return;
    autoSeedAttempted.current = true;
    (async () => {
      try {
        const res = await seedIfEmpty();
        if (res.seeded) {
          showToast(`키폰 번호부 ${res.count}건 자동 등록 완료`, 'success');
        }
      } catch (err: any) {
        console.error('[Keyphone] auto-seed failed:', err);
        showToast(`자동 시드 실패: ${err?.message || err}`, 'error');
      }
    })();
  }, [canEdit, loading, isEmpty, seedIfEmpty]);

  const palette = SCHOOLS.find((s) => s.key === selectedSchool)!;

  const filtered = useMemo(() => {
    const list = entries.filter((e) => e.school === selectedSchool);
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((e) =>
      e.department.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      e.keyphone.toLowerCase().includes(q) ||
      e.phone.toLowerCase().includes(q),
    );
  }, [entries, selectedSchool, search]);

  // 부서별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, KeyphoneEntry[]>();
    for (const e of filtered) {
      const key = e.department || '기타';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function copy(text: string) {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(`복사됨: ${text}`, 'success'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text: string) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(ok ? `복사됨: ${text}` : '복사 실패', ok ? 'success' : 'error');
    } catch {
      showToast('복사 실패', 'error');
    }
  }

  function startEdit(e: KeyphoneEntry) {
    setEditingId(e.id);
    setEditDraft({ ...e });
  }
  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
  }
  async function saveEdit() {
    if (!editingId) return;
    // M8: trim 적용 (문자열 필드만)
    const trimmed: any = { ...editDraft };
    for (const k of ['department', 'name', 'role', 'keyphone', 'phone', 'note']) {
      if (typeof trimmed[k] === 'string') trimmed[k] = trimmed[k].trim();
    }
    try {
      await updateEntry(editingId, trimmed);
      showToast('수정되었습니다', 'success');
      cancelEdit();
    } catch (err: any) {
      showToast(`수정 실패: ${err?.message || err}`, 'error');
    }
  }
  async function remove(e: KeyphoneEntry) {
    if (!confirm(`'${e.department} / ${e.name || e.role || '항목'}'을(를) 삭제할까요?`)) return;
    try {
      await deleteEntry(e.id);
      showToast('삭제되었습니다', 'success');
    } catch (err: any) {
      showToast(`삭제 실패: ${err?.message || err}`, 'error');
    }
  }
  function startAdd(school: School) {
    setAddingForSchool(school);
    setAddDraft({ school, department: '', name: '', role: '', keyphone: '', phone: '' });
  }
  function cancelAdd() {
    setAddingForSchool(null);
    setAddDraft({});
  }
  async function saveAdd() {
    if (!addingForSchool) return;
    // M8: 모든 필드 trim 후 검증
    const dept = (addDraft.department || '').trim();
    const name = (addDraft.name || '').trim();
    const role = (addDraft.role || '').trim();
    const keyphone = (addDraft.keyphone || '').trim();
    const phone = (addDraft.phone || '').trim();
    if (!dept && !name && !keyphone && !phone) {
      showToast('최소 한 가지 정보는 입력해주세요', 'error');
      return;
    }
    if (!keyphone && !phone) {
      showToast('키폰 또는 전화번호 중 하나는 필수입니다', 'error');
      return;
    }
    try {
      const maxOrder = Math.max(0, ...entries.filter((e) => e.school === addingForSchool).map((e) => e.order));
      await addEntry({
        school: addingForSchool,
        department: dept,
        name,
        role,
        keyphone,
        phone,
        order: maxOrder + 1,
      });
      showToast('추가되었습니다', 'success');
      cancelAdd();
    } catch (err: any) {
      showToast(`추가 실패: ${err?.message || err}`, 'error');
    }
  }

  async function handleReset() {
    if (!confirm('⚠️ 기존 키폰 번호부를 모두 삭제하고 초기 데이터(2026.3.1 기준)로 다시 채울까요?\n이 작업은 되돌릴 수 없습니다.')) return;
    setSeeding(true);
    try {
      const n = await resetAndReseed();
      showToast(`재시드 완료: ${n}건 등록`, 'success');
    } catch (err: any) {
      showToast(`재시드 실패: ${err?.message || err}`, 'error');
    }
    setSeeding(false);
  }

  return (
    <div style={styles.wrap}>
      {/* 헤더 */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn} title="돌아가기" aria-label="뒤로">
          <ArrowLeft size={18} />
        </button>
        <span style={styles.headerTitle}>📞 키폰 번호부</span>
        <span style={{ flex: 1 }} />
        {isSuperAdmin && !isEmpty && (
          <button onClick={handleReset} disabled={seeding} style={styles.resetBtn} title="기존 데이터 삭제 후 초기 데이터로 재등록">
            <RefreshCw size={13} /> 재시드
          </button>
        )}
      </div>

      {/* 학교 탭 */}
      <div style={styles.tabRow}>
        {SCHOOLS.map((s) => {
          const active = selectedSchool === s.key;
          const count = entries.filter((e) => e.school === s.key).length;
          return (
            <button
              key={s.key}
              onClick={() => setSelectedSchool(s.key)}
              style={{
                ...styles.tab,
                background: active ? `${s.color}22` : 'transparent',
                color: active ? s.color : 'var(--text-secondary)',
                borderColor: active ? s.color : 'var(--border-subtle)',
              }}
            >
              {s.icon} {s.label}
              <span style={{
                ...styles.countPill,
                background: active ? `${s.color}33` : 'var(--bg-hover)',
                color: active ? s.color : 'var(--text-muted)',
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* 검색 + 추가 */}
      <div style={styles.toolbar}>
        <div style={styles.searchBox}>
          <Search size={14} color="var(--text-muted)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="부서·이름·직책·번호 검색"
            style={styles.searchInput}
          />
        </div>
        {canEdit && (
          <button onClick={() => startAdd(selectedSchool)} style={{ ...styles.addBtn, background: `${palette.color}22`, color: palette.color }}>
            <Plus size={14} /> 추가
          </button>
        )}
      </div>

      {/* 본문 */}
      <div style={styles.body}>
        {loading ? (
          <div style={styles.placeholder}>로딩 중…</div>
        ) : isEmpty ? (
          <div style={styles.placeholder}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📞</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>키폰 번호부 준비 중…</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {canEdit ? '잠시 후 초기 데이터가 자동 등록됩니다.' : '관리자가 처음 접속하면 초기 데이터가 자동 등록됩니다.'}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={styles.placeholder}>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>검색 결과가 없습니다</div>
          </div>
        ) : (
          <>
            {/* 추가 폼 */}
            {addingForSchool === selectedSchool && (
              <div style={{ ...styles.row, background: 'var(--bg-hover)', borderLeft: `3px solid ${palette.color}` }}>
                <input style={styles.editInput} placeholder="부서명" value={addDraft.department || ''} onChange={(e) => setAddDraft({ ...addDraft, department: e.target.value })} />
                <input style={styles.editInput} placeholder="이름" value={addDraft.name || ''} onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} />
                <input style={styles.editInput} placeholder="직책/담당" value={addDraft.role || ''} onChange={(e) => setAddDraft({ ...addDraft, role: e.target.value })} />
                <input style={styles.editInput} placeholder="키폰 (예: 8273)" value={addDraft.keyphone || ''} onChange={(e) => setAddDraft({ ...addDraft, keyphone: e.target.value })} />
                <input style={styles.editInput} placeholder="외부 전화" value={addDraft.phone || ''} onChange={(e) => setAddDraft({ ...addDraft, phone: e.target.value })} />
                <div style={styles.actionGroup}>
                  <button onClick={saveAdd} style={styles.iconBtnSuccess} title="저장"><Check size={14} /></button>
                  <button onClick={cancelAdd} style={styles.iconBtnGhost} title="취소"><X size={14} /></button>
                </div>
              </div>
            )}

            {grouped.map(([dept, list]) => (
              <div key={dept} style={styles.group}>
                <div
                  style={{
                    ...styles.groupHeader,
                    color: palette.color,
                    borderBottomColor: `${palette.color}55`,
                    background: `${palette.color}12`, // 다크모드 가독성: 부서 헤더 배경 틴트
                  }}
                >
                  {dept}
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6, fontWeight: 500 }}>· {list.length}명</span>
                </div>
                {list.map((e) => {
                  const isEditing = editingId === e.id;
                  if (isEditing) {
                    return (
                      <div key={e.id} style={{ ...styles.row, background: 'var(--bg-hover)' }}>
                        <input style={styles.editInput} value={editDraft.department || ''} onChange={(ev) => setEditDraft({ ...editDraft, department: ev.target.value })} placeholder="부서" />
                        <input style={styles.editInput} value={editDraft.name || ''} onChange={(ev) => setEditDraft({ ...editDraft, name: ev.target.value })} placeholder="이름" />
                        <input style={styles.editInput} value={editDraft.role || ''} onChange={(ev) => setEditDraft({ ...editDraft, role: ev.target.value })} placeholder="직책" />
                        <input style={styles.editInput} value={editDraft.keyphone || ''} onChange={(ev) => setEditDraft({ ...editDraft, keyphone: ev.target.value })} placeholder="키폰" />
                        <input style={styles.editInput} value={editDraft.phone || ''} onChange={(ev) => setEditDraft({ ...editDraft, phone: ev.target.value })} placeholder="전화" />
                        <div style={styles.actionGroup}>
                          <button onClick={saveEdit} style={styles.iconBtnSuccess} title="저장"><Check size={14} /></button>
                          <button onClick={cancelEdit} style={styles.iconBtnGhost} title="취소"><X size={14} /></button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={e.id} style={styles.row}>
                      <div style={styles.cellName}>
                        <span style={styles.nameText}>{e.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                        {e.role && <span style={styles.roleBadge}>{e.role}</span>}
                      </div>
                      <div style={styles.cellKp}>
                        {e.keyphone ? (
                          <button
                            onClick={() => copy(e.keyphone)}
                            style={{
                              ...styles.copyBtn,
                              color: palette.color,
                              borderColor: `${palette.color}66`,
                              background: `${palette.color}18`, // 다크모드 가독성: 색 틴트 배경
                            }}
                            title={`복사: ${e.keyphone}`}
                          >
                            <Copy size={10} style={{ verticalAlign: '-1px', marginRight: 3 }} />{e.keyphone}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </div>
                      <div style={styles.cellPhone}>
                        {e.phone ? (
                          <button onClick={() => copy(e.phone)} style={styles.phoneBtn} title={`복사: ${e.phone}`}>
                            {e.phone}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </div>
                      {canEdit && (
                        <div style={styles.actionGroup}>
                          <button onClick={() => startEdit(e)} style={styles.iconBtnGhost} title="수정"><Pencil size={12} /></button>
                          <button onClick={() => remove(e)} style={{ ...styles.iconBtnGhost, color: 'var(--danger)' }} title="삭제"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      <div style={styles.footnote}>
        {canEdit
          ? '관리자 모드: 항목을 추가·수정·삭제할 수 있습니다.'
          : '조회 전용 모드 — 관리자만 수정 가능합니다.'}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    // 다크모드에서 글래스 배경 대비 강화 — 살짝 어둡게 깔아 텍스트 가독성 확보
    background: 'var(--bg-secondary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    padding: 4,
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
  },
  seedBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 600,
    background: 'rgba(74,144,226,0.15)',
    color: 'var(--accent)',
    border: '1px solid rgba(74,144,226,0.4)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  resetBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 10,
    fontWeight: 600,
    background: 'rgba(245,158,11,0.12)',
    color: '#F59E0B',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  tabRow: {
    display: 'flex',
    gap: 6,
    padding: '8px 14px',
    borderBottom: '1px solid var(--border-color)', // 다크에서도 보이게
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700, // 다크모드 가독성
    border: '1px solid',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  countPill: {
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 8,
    minWidth: 16,
    textAlign: 'center',
  },
  toolbar: {
    display: 'flex',
    gap: 8,
    padding: '8px 14px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  searchBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: '1px solid var(--border-color)', // 더 진한 테두리
    borderRadius: 8,
    background: 'var(--bg-hover)', // 약간 밝게 → 다크모드에서 검색박스 윤곽 명확
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 12,
  },
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0 16px',
  },
  group: {
    marginBottom: 8,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: 700,
    padding: '8px 14px 4px',
    borderBottom: '1px solid',
    letterSpacing: 0.2,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 0.9fr 1.4fr auto',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    fontSize: 12,
    borderBottom: '1px solid var(--border-color)', // 행 구분선 강화
  },
  cellName: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  nameText: {
    fontWeight: 600, // 다크모드에서 더 굵게
    color: 'var(--text-primary)',
  },
  roleBadge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 6,
    background: 'var(--bg-active)', // bg-hover보다 진해서 다크에서도 윤곽 보임
    color: 'var(--text-secondary)', // muted → secondary로 (85% 가시성)
    whiteSpace: 'nowrap',
  },
  cellKp: {
    fontSize: 11,
  },
  cellPhone: {
    fontSize: 11,
    color: 'var(--text-primary)', // 전화번호도 primary로 (다크에서 100% 흰색)
  },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 700,
    background: 'transparent',
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  phoneBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-primary)', // 다크에서도 진하게
    padding: '2px 4px',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 500,
    textAlign: 'left',
  },
  actionGroup: {
    display: 'flex',
    gap: 2,
  },
  iconBtnGhost: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary)', // muted → secondary
    padding: 4,
    borderRadius: 4,
    display: 'inline-flex',
    alignItems: 'center',
  },
  iconBtnSuccess: {
    background: 'rgba(16,185,129,0.15)',
    border: 'none',
    cursor: 'pointer',
    color: '#10B981',
    padding: 4,
    borderRadius: 4,
    display: 'inline-flex',
    alignItems: 'center',
  },
  editInput: {
    padding: '5px 8px',
    fontSize: 11,
    border: '1px solid var(--border-color)', // 더 진한 테두리 → 다크에서도 입력 영역 명확
    borderRadius: 4,
    background: 'var(--bg-hover)', // transparent 대신 살짝 밝게 → 다크에서도 식별 가능
    color: 'var(--text-primary)',
    minWidth: 0,
    width: '100%',
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    color: 'var(--text-secondary)',
    fontSize: 13,
  },
  footnote: {
    padding: '8px 14px',
    fontSize: 10,
    color: 'var(--text-muted)',
    borderTop: '1px solid var(--border-subtle)',
    textAlign: 'center',
  },
};

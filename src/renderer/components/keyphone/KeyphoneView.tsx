import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Search, Plus, Pencil, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useKeyphoneStore, type KeyphoneEntry } from '../../store/keyphoneStore';
import { showToast } from '../common/Toast';
import type { School } from '@shared/types';
import { Ic, type IconName } from '../common/Ic';
import { Emo } from '../common/designKit';
import '../common/designs.css';
import './KeyphoneView.css';

const SCHOOLS: { key: School; label: string; icon: IconName }[] = [
  { key: 'taeseong_middle', label: '태성중학교', icon: 'school' },
  { key: 'taeseong_high', label: '태성고등학교', icon: 'graduation' },
];

interface KeyphoneViewProps {
  onBack: () => void;
}

/** 키폰 번호부 — 양교 전화번호 조회 + 관리자 편집. */
export function KeyphoneView({ onBack }: KeyphoneViewProps) {
  const { user } = useAuthStore();
  const { entries, loading, subscribe, cleanup, addEntry, updateEntry, deleteEntry, seedIfEmpty, resetAndReseed } = useKeyphoneStore();

  // 수정 권한: admin / super_admin 만 (부장 제외)
  const canEdit = user?.role === 'super_admin' || user?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const autoSeedAttempted = React.useRef(false);

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
    if (!confirm('기존 키폰 번호부를 모두 삭제하고 초기 데이터(2026.3.1 기준)로 다시 채울까요?\n이 작업은 되돌릴 수 없습니다.')) return;
    setSeeding(true);
    try {
      const n = await resetAndReseed();
      showToast(`재시드 완료: ${n}건 등록`, 'success');
    } catch (err: any) {
      showToast(`재시드 실패: ${err?.message || err}`, 'error');
    }
    setSeeding(false);
  }


  const editFields = (draft: Partial<KeyphoneEntry>, set: (next: Partial<KeyphoneEntry>) => void) => (
    <>
      <input className="kp-input" placeholder="부서" value={draft.department || ''} onChange={(e) => set({ ...draft, department: e.target.value })} />
      <input className="kp-input" placeholder="이름" value={draft.name || ''} onChange={(e) => set({ ...draft, name: e.target.value })} />
      <input className="kp-input" placeholder="직책" value={draft.role || ''} onChange={(e) => set({ ...draft, role: e.target.value })} />
      <input className="kp-input" placeholder="키폰" value={draft.keyphone || ''} onChange={(e) => set({ ...draft, keyphone: e.target.value })} />
      <input className="kp-input" placeholder="외부전화" value={draft.phone || ''} onChange={(e) => set({ ...draft, phone: e.target.value })} />
    </>
  );

  return (
    <div className="md-root kp-root" data-school={selectedSchool}>
      <div className="kp-head">
        <button onClick={onBack} className="kp-back" title="돌아가기" aria-label="뒤로">
          <ArrowLeft size={18} />
        </button>
        <span className="kp-title"><Ic name="phone" />키폰 번호부</span>
        <span className="kp-space" />
        {isSuperAdmin && !isEmpty && (
          <button onClick={handleReset} disabled={seeding} className="kp-reset" title="기존 데이터 삭제 후 초기 데이터로 재등록">
            <RefreshCw size={13} /> 재시드
          </button>
        )}
      </div>

      <div className="kp-tabs" role="group" aria-label="학교">
        {SCHOOLS.map((s) => (
          <button
            key={s.key}
            className="kp-tab"
            data-school={s.key}
            aria-pressed={selectedSchool === s.key}
            onClick={() => setSelectedSchool(s.key)}
          >
            <Ic name={s.icon} />{s.label}
            <span className="kp-count">{entries.filter((e) => e.school === s.key).length}</span>
          </button>
        ))}
      </div>

      <div className="kp-tip" role="note">
        <Emo e="☎️" className="kp-tipEmoji" />
        <span className="kp-tipText">중 ↔ 고 전화 연결</span>
        <span className="kp-keys">
          <kbd>*</kbd><kbd>2</kbd>
          <span className="kp-then">누르고</span>
          <kbd className="kp-ext">내선번호</kbd>
        </span>
      </div>

      <div className="kp-tools">
        <label className="kp-search">
          <Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="부서·이름·직책·번호 검색" />
        </label>
        {canEdit && (
          <button onClick={() => startAdd(selectedSchool)} className="kp-add">
            <Plus size={14} /> 추가
          </button>
        )}
      </div>

      <div className="kp-body">
        {loading ? (
          <div className="kp-empty">로딩 중…</div>
        ) : isEmpty ? (
          <div className="kp-empty">
            <Emo e="☎️" className="kp-emptyEmoji" />
            <b>키폰 번호부 준비 중…</b>
            <span>{canEdit ? '잠시 후 초기 데이터가 자동 등록됩니다.' : '관리자가 처음 접속하면 초기 데이터가 자동 등록됩니다.'}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="kp-empty"><span>검색 결과가 없습니다</span></div>
        ) : (
          <>
            {addingForSchool === selectedSchool && (
              <div className="kp-edit is-add">
                {editFields(addDraft, setAddDraft)}
                <div className="kp-acts">
                  <button onClick={saveAdd} className="kp-ok" title="저장"><Check size={14} /></button>
                  <button onClick={cancelAdd} className="kp-ghost" title="취소"><X size={14} /></button>
                </div>
              </div>
            )}

            <div className="kp-cols">
              {grouped.map(([name, list]) => (
                <section key={name} className="kp-group">
                  <h4 className="kp-dept">
                    <span>{name}</span>
                    <span className="kp-deptCount">{list.length}</span>
                  </h4>
                  {list.map((e) => (editingId === e.id ? (
                    <div key={e.id} className="kp-edit">
                      {editFields(editDraft, setEditDraft)}
                      <div className="kp-acts">
                        <button onClick={saveEdit} className="kp-ok" title="저장"><Check size={14} /></button>
                        <button onClick={cancelEdit} className="kp-ghost" title="취소"><X size={14} /></button>
                      </div>
                    </div>
                  ) : (
                    <div key={e.id} className="kp-row">
                      <span className="kp-name">
                        {e.name || <span className="kp-noname">—</span>}
                        {e.role && <span className="kp-role">{e.role}</span>}
                      </span>
                      {e.keyphone && (
                        <button onClick={() => copy(e.keyphone)} className="kp-num" title={`복사: ${e.keyphone}`}>{e.keyphone}</button>
                      )}
                      {e.phone && (
                        <button onClick={() => copy(e.phone)} className="kp-tel" title={`복사: ${e.phone}`}>{e.phone}</button>
                      )}
                      {canEdit && (
                        <div className="kp-acts">
                          <button onClick={() => startEdit(e)} className="kp-ghost" title="수정"><Pencil size={11} /></button>
                          <button onClick={() => remove(e)} className="kp-ghost is-danger" title="삭제"><Trash2 size={11} /></button>
                        </div>
                      )}
                    </div>
                  )))}
                </section>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="kp-foot">
        {canEdit
          ? '번호를 누르면 복사됩니다 · 관리자는 항목을 추가·수정·삭제할 수 있습니다.'
          : '번호를 누르면 복사됩니다.'}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import type { School, User } from '@shared/types';
import { SCHOOL_LABELS } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import {
  buildLinkRows, chooseAccount, duplicateUserIds, linkEntriesOf, needsAttention, type LinkRow,
} from '../../utils/comciganLinks';
import { ComciganCallButton } from '../common/ComciganCall';
import { showToast } from '../common/Toast';
import { ipcErrorMessage } from '../../utils/ipcError';

const MAX_GRADE = 3;

interface SchoolPick {
  code: number;
  name: string;
  region?: string;
}

function statusText(row: LinkRow, duplicate: boolean): string {
  if (duplicate) return '한 계정에 표기가 둘';
  if (row.accountGone) return '계정이 비활성입니다';
  if (!row.inTimetable) return '이번 주 시간표에 없음';
  if (row.status === 'suggested') return row.otherSchool ? '제안 · 다른 학교 계정' : '제안';
  if (row.status === 'ambiguous') return `후보 ${row.candidates.length}명`;
  if (row.status === 'none') return '계정 없음';
  return row.otherSchool ? '연결됨 · 다른 학교 계정' : '연결됨';
}

function statusColor(row: LinkRow, duplicate: boolean): string {
  if (duplicate || row.accountGone || row.status === 'ambiguous') return 'var(--warning)';
  if (row.status === 'linked' && row.inTimetable) return 'var(--text-muted)';
  return 'var(--text-secondary)';
}

/**
 * 컴시간 표기와 계정 연결표.
 * 컴시간은 이름을 두 글자로만 보여 주므로, 앞 두 글자가 같은 계정을 제안하고 관리자가 확인해 저장한다.
 * 저장한 값은 회의 찾기와 시험감독 표가 쓴다.
 */
export function ComciganLinkTable({ users }: { users: User[] }) {
  const me = useAuthStore((s) => s.user);
  const links = useComciganLinksStore((s) => s.links);
  const linksLoaded = useComciganLinksStore((s) => s.linksLoaded);
  const linksDenied = useComciganLinksStore((s) => s.linksDenied);
  const loadGrid = useComciganLinksStore((s) => s.loadGrid);
  const saveLinks = useComciganLinksStore((s) => s.saveLinks);

  const ownSchool = me?.school === 'taeseong_high' ? 'taeseong_high' : 'taeseong_middle';
  const [school, setSchool] = useState<School>(ownSchool);
  const [pick, setPick] = useState<SchoolPick | null>(null);
  const [changingSchool, setChangingSchool] = useState(false);
  const [candidates, setCandidates] = useState<SchoolPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [labels, setLabels] = useState<string[] | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [rows, setRows] = useState<LinkRow[]>([]);
  // 표를 직접 고쳤다. 다시 만들 때 덮어쓰지 않는다.
  const [edited, setEdited] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const saved = links[school];
  const linkUsers = useMemo(
    () => users.map((u) => ({ id: u.id, name: u.name, school: u.school })).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [users],
  );

  // 학교를 바꾸면 저장된 코드에서 다시 시작한다
  useEffect(() => {
    setPick(null);
    setChangingSchool(false);
    setCandidates([]);
    setLabels(null);
    setRows([]);
    setEdited(false);
    setGridError(null);
    setAttentionOnly(false);
  }, [school]);

  const schoolCode = pick?.code ?? saved?.schoolCode ?? 0;
  const schoolName = pick?.name ?? saved?.schoolName ?? '';
  // 학교를 처음 정했거나 바꿨으면 표를 고치지 않아도 저장할 것이 있다
  const canSave = edited || (pick !== null && pick.code !== saved?.schoolCode);

  useEffect(() => {
    if (!schoolCode) return undefined;
    let active = true;
    setLoadingGrid(true);
    setGridError(null);
    loadGrid(school, schoolCode, MAX_GRADE)
      .then((grid) => {
        if (active) setLabels(Object.keys(grid.teachers));
      })
      .catch((err) => {
        console.warn('[LinkTable] grid failed:', err);
        if (active) setGridError(ipcErrorMessage(err, '컴시간에서 시간표를 받지 못했습니다'));
      })
      .finally(() => {
        if (active) setLoadingGrid(false);
      });
    return () => { active = false; };
  }, [school, schoolCode, loadGrid]);

  // 시간표나 저장값이 바뀌면 표를 다시 만든다. 고치는 중이면 덮어쓰지 않는다.
  const savedEntries = saved?.entries;
  useEffect(() => {
    if (!labels || edited) return;
    setRows(buildLinkRows(labels, savedEntries ?? [], linkUsers, school));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, savedEntries, linkUsers, school]);

  async function searchSchools() {
    setSearching(true);
    setCandidates([]);
    try {
      const results = await window.electronAPI?.comciganSearch(school === 'taeseong_middle' ? '태성중' : '태성고') ?? [];
      setCandidates(results.map((r) => ({ code: r.code, name: r.name, region: r.region })));
      if (results.length === 0) showToast('컴시간에서 학교를 찾지 못했습니다', 'error');
    } catch (err: any) {
      showToast(ipcErrorMessage(err, '학교를 찾지 못했습니다'), 'error');
    }
    setSearching(false);
  }

  const duplicates = useMemo(() => duplicateUserIds(rows), [rows]);
  const stats = useMemo(() => ({
    total: rows.length,
    linked: rows.filter((r) => r.status === 'linked').length,
    suggested: rows.filter((r) => r.status === 'suggested').length,
    ambiguous: rows.filter((r) => r.status === 'ambiguous').length,
    none: rows.filter((r) => r.status === 'none').length,
  }), [rows]);
  const shown = attentionOnly
    ? rows.filter((r) => needsAttention(r) || (r.userId !== null && duplicates.has(r.userId)))
    : rows;

  function changeRow(label: string, userId: string) {
    const user = linkUsers.find((u) => u.id === userId) ?? null;
    setRows((current) => current.map((r) => (r.label === label ? chooseAccount(r, user, school) : r)));
    setEdited(true);
  }

  function applySuggestions() {
    setRows((current) => current.map((r) => (r.status === 'suggested' ? { ...r, status: 'linked' as const } : r)));
    setEdited(true);
  }

  async function save() {
    if (!me || !schoolCode) return;
    setSaving(true);
    try {
      await saveLinks({
        school,
        schoolCode,
        schoolName,
        maxGrade: MAX_GRADE,
        entries: linkEntriesOf(rows),
        updatedBy: me.id,
      });
      setEdited(false);
      setPick(null);
      setChangingSchool(false);
      showToast('연결표를 저장했습니다', 'success');
    } catch (err: any) {
      console.error('[LinkTable] save failed:', err);
      showToast(
        err?.code === 'permission-denied' ? '서버 규칙이 아직 적용되지 않아 저장하지 못했습니다' : '연결표를 저장하지 못했습니다',
        'error',
      );
    }
    setSaving(false);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        <div className="seg" role="group" aria-label="학교">
          {LINK_SCHOOLS.map((s) => (
            <button key={s} type="button" aria-pressed={school === s} onClick={() => setSchool(s)}>
              {s === 'taeseong_middle' ? '태성중' : '태성고'}
            </button>
          ))}
        </div>
        {schoolCode > 0 && !changingSchool && (
          <span style={styles.schoolLine}>
            컴시간: {schoolName}
            <button type="button" style={styles.linkBtn} onClick={() => setChangingSchool(true)}>바꾸기</button>
          </span>
        )}
      </div>

      {linksDenied && <p style={styles.warn}>연결표를 읽지 못했습니다. 서버 규칙을 배포해야 저장할 수 있습니다.</p>}

      {(linksLoaded || linksDenied) && (!schoolCode || changingSchool) && (
        <div style={styles.searchBox}>
          <p style={styles.note}>컴시간에서 {SCHOOL_LABELS[school]}을 찾아 정해 주세요. 한 번만 하면 됩니다.</p>
          <button type="button" onClick={searchSchools} disabled={searching} style={styles.btn}>
            {searching ? '찾는 중...' : '컴시간에서 학교 찾기'}
          </button>
          {candidates.map((c) => (
            <button
              key={c.code}
              type="button"
              style={styles.candidate}
              onClick={() => { setPick(c); setChangingSchool(false); setCandidates([]); setEdited(false); setRows([]); setLabels(null); }}
            >
              {c.name}{c.region ? ` (${c.region})` : ''}
            </button>
          ))}
        </div>
      )}

      {loadingGrid && <p style={styles.note}>전교 시간표를 받는 중입니다...</p>}
      {gridError && <p style={styles.warn}>{gridError} <ComciganCallButton style={{ marginLeft: 4 }} /></p>}

      {rows.length > 0 && (
        <>
          <div style={styles.stats}>
            <span>표기 {stats.total}개 · 연결 {stats.linked} · 제안 {stats.suggested} · 후보 여럿 {stats.ambiguous} · 계정 없음 {stats.none}</span>
          </div>
          <div style={styles.actions}>
            <label style={styles.check}>
              <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
              확인할 것만
            </label>
            <button type="button" onClick={applySuggestions} disabled={stats.suggested === 0} style={styles.btn}>
              제안 {stats.suggested}건 적용
            </button>
            <button type="button" onClick={save} disabled={saving || !canSave} style={{ ...styles.primary, opacity: canSave ? 1 : 0.5 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>

          <div style={styles.table} role="table" aria-label="컴시간 표기와 계정">
            {shown.length === 0 && <p style={styles.note}>확인할 표기가 없습니다.</p>}
            {shown.map((row) => {
              const duplicate = row.userId !== null && duplicates.has(row.userId);
              return (
                <div key={row.label} style={styles.row} role="row">
                  <b style={styles.label} role="cell">{row.label}</b>
                  <select
                    value={row.userId ?? ''}
                    onChange={(e) => changeRow(row.label, e.target.value)}
                    aria-label={`${row.label} 표기의 계정`}
                    style={styles.select}
                  >
                    <option value="">연결 안 함</option>
                    {row.accountGone && row.userId && <option value={row.userId}>{row.name} (비활성)</option>}
                    {row.candidates.length > 0 && (
                      <optgroup label="이름이 맞는 계정">
                        {row.candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="모든 계정">
                      {linkUsers.filter((u) => !row.candidates.some((c) => c.id === u.id)).map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </optgroup>
                  </select>
                  <span style={{ ...styles.status, color: statusColor(row, duplicate) }} role="cell">{statusText(row, duplicate)}</span>
                </div>
              );
            })}
          </div>
          <p style={styles.note}>제안은 이름 앞 두 글자가 같다는 뜻일 뿐입니다. 저장한 값만 회의 찾기와 시험감독 표에 쓰입니다.</p>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  topRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  schoolLine: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  linkBtn: {
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  searchBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  candidate: {
    width: '100%',
    padding: '5px 8px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  stats: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  check: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginRight: 'auto',
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  btn: {
    padding: '4px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  primary: {
    padding: '4px 14px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  table: {
    flex: 1,
    minHeight: 80,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '44px minmax(0, 1fr) minmax(0, 0.9fr)',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
  },
  label: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-primary)',
  },
  select: {
    minWidth: 0,
    padding: '3px 4px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  status: {
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
  },
  note: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
  },
  warn: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    fontWeight: 600,
    color: 'var(--warning)',
  },
};

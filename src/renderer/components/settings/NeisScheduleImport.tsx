import React, { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  importNeisScheduleToFirestore, getNeisConfig, setNeisConfig, removeNeisConfig,
  lookupSchoolByCode, searchSchoolByName, hasCustomNeisConfig,
} from '../../utils/neisSchedule';
import { showToast } from '../common/Toast';
import { SCHOOL_LABELS } from '@shared/types';
import type { School } from '@shared/types';

interface SchoolSearchResult {
  code: string;
  name: string;
  education: string;
  region: string;
  kind: string;
}

export function NeisScheduleImport() {
  const { user } = useAuthStore();
  const [importing, setImporting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [schoolCodeInput, setSchoolCodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SchoolSearchResult[]>([]);
  const [configVersion, setConfigVersion] = useState(0);
  const [forceEdit, setForceEdit] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';
  const defaultSchool: School =
    user?.school === 'taeseong_high' || user?.school === 'taeseong_middle'
      ? user.school
      : 'taeseong_middle';
  const [targetSchool, setTargetSchool] = useState<School>(defaultSchool);

  if (!user) return null;
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  if (!isAdmin) {
    return <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>관리자만 학사일정을 가져올 수 있습니다.</p>;
  }
  if (!isSuperAdmin && user.school !== 'taeseong_middle' && user.school !== 'taeseong_high') {
    return (
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        학교가 미지정되어 학사일정을 가져올 수 없습니다.
        <br />본인 계정의 학교를 먼저 지정해주세요.
      </p>
    );
  }

  const activeSchool: School = isSuperAdmin ? targetSchool : (user.school as School);

  // 탭 전환 시 입력/검색 상태 초기화
  useEffect(() => {
    setForceEdit(false);
    setSchoolCodeInput('');
    setSearchQuery('');
    setSearchResults([]);
  }, [activeSchool]);
  const currentConfig = useMemo(
    () => getNeisConfig(activeSchool),
    [activeSchool, configVersion],
  );
  const isCustom = useMemo(
    () => hasCustomNeisConfig(activeSchool),
    [activeSchool, configVersion],
  );
  const schoolLabel = SCHOOL_LABELS[activeSchool];

  async function handleSaveByCode() {
    const code = schoolCodeInput.trim();
    if (!code) { showToast('학교 코드를 입력하세요', 'error'); return; }
    setLookingUp(true);
    try {
      const info = await lookupSchoolByCode(code);
      if ('error' in info) {
        const msg = info.error === 'timeout' ? 'NEIS 서버 응답 시간 초과. 잠시 후 다시 시도하세요.'
          : info.error === 'not_found' ? '해당 학교 코드를 찾을 수 없습니다. 코드를 다시 확인해주세요.'
          : '네트워크 오류. 인터넷 연결을 확인하세요.';
        showToast(msg, 'error');
        return;
      }
      setNeisConfig(activeSchool, { education: info.education, school: code });
      showToast(`${info.name} 설정 저장됨 (${info.education})`);
      setSchoolCodeInput('');
      setSearchResults([]);
      setForceEdit(false);
      setConfigVersion((v) => v + 1);
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSearch() {
    const q = searchQuery.trim();
    if (q.length < 2) { showToast('학교 이름을 2글자 이상 입력하세요', 'error'); return; }
    setSearching(true);
    try {
      const results = await searchSchoolByName(q);
      setSearchResults(results);
      if (results.length === 0) showToast('검색 결과가 없습니다', 'info');
    } finally {
      setSearching(false);
    }
  }

  function handlePickResult(r: SchoolSearchResult) {
    setNeisConfig(activeSchool, { education: r.education, school: r.code });
    showToast(`${r.name} 설정 저장됨`);
    setSearchQuery('');
    setSearchResults([]);
    setForceEdit(false);
    setConfigVersion((v) => v + 1);
  }

  async function handleImport() {
    const cfg = getNeisConfig(activeSchool);
    if (!cfg) { showToast('먼저 학교를 설정하세요', 'error'); return; }

    const year = new Date().getFullYear();
    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 1, 28);

    setImporting(true);
    try {
      const count = await importNeisScheduleToFirestore(activeSchool, user!.id, user!.name, from, to);
      showToast(`${schoolLabel}: ${count}개 학사일정을 가져왔습니다`);
    } catch (err: any) {
      console.error('[NEIS Import] failed:', err);
      showToast(err.message || '가져오기 실패', 'error');
    }
    setImporting(false);
  }

  return (
    <div style={styles.container}>
      {isSuperAdmin && (
        <div style={styles.schoolTabs}>
          <button
            onClick={() => setTargetSchool('taeseong_middle')}
            style={{ ...styles.tabBtn, ...(targetSchool === 'taeseong_middle' ? styles.tabBtnActive : {}) }}
          >🏫 태성중</button>
          <button
            onClick={() => setTargetSchool('taeseong_high')}
            style={{ ...styles.tabBtn, ...(targetSchool === 'taeseong_high' ? styles.tabBtnActive : {}) }}
          >🎓 태성고</button>
        </div>
      )}

      <p style={styles.desc}>
        📚 {schoolLabel} 학사일정을 NEIS에서 가져옵니다.
        <br />
        <span style={{ color: 'var(--text-muted)' }}>학교 코드만 입력하면 자동으로 교육청이 조회됩니다.</span>
      </p>

      {(!currentConfig || forceEdit) ? (
        <>
          {/* 방법 1: 학교 코드 직접 입력 */}
          <div style={styles.methodSection}>
            <span style={styles.methodLabel}>1️⃣ 학교 코드 직접 입력</span>
            <div style={styles.inputRow}>
              <input
                type="text"
                placeholder="학교 코드 (7자리, 예: 7530209)"
                value={schoolCodeInput}
                onChange={(e) => setSchoolCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={7}
                style={styles.input}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveByCode(); } }}
              />
              <button onClick={handleSaveByCode} disabled={lookingUp || !schoolCodeInput.trim()} style={styles.primaryBtn}>
                {lookingUp ? '조회 중...' : '저장'}
              </button>
            </div>
          </div>

          {/* 방법 2: 학교 이름 검색 */}
          <div style={styles.methodSection}>
            <span style={styles.methodLabel}>2️⃣ 학교 이름으로 검색</span>
            <div style={styles.inputRow}>
              <input
                type="text"
                placeholder="학교 이름 (예: 태성)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.input}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
              />
              <button onClick={handleSearch} disabled={searching || searchQuery.trim().length < 2} style={styles.primaryBtn}>
                {searching ? '검색 중...' : '🔍 검색'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div style={styles.resultsList}>
                {searchResults.map((r) => (
                  <button
                    key={r.code}
                    onClick={() => handlePickResult(r)}
                    style={styles.resultItem}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</span>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--accent)', color: '#fff' }}>
                        {r.kind}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{r.region} · {r.code}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p style={styles.hint}>
            💡 학교 코드는{' '}
            <a href="https://open.neis.go.kr/portal/guide/actKnowHow.do" target="_blank" rel="noreferrer" style={styles.link}>
              NEIS 교육정보개방포털
            </a>에서 조회 가능합니다.
          </p>

          {forceEdit && currentConfig && (
            <button onClick={() => setForceEdit(false)} style={styles.cancelEditBtn}>
              ← 현재 설정으로 돌아가기
            </button>
          )}
        </>
      ) : (
        <>
          <div style={styles.currentConfig}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>현재 설정:</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
              {currentConfig.education} / {currentConfig.school}
            </span>
            {!isCustom && (
              <span style={styles.defaultBadge}>기본값</span>
            )}
            <button
              onClick={() => {
                if (isCustom) {
                  // 커스텀 설정 → 기본값으로 복원
                  if (!window.confirm(`${schoolLabel} NEIS 설정을 초기화하시겠습니까?\n(내장 기본값으로 되돌아갑니다)`)) return;
                  removeNeisConfig(activeSchool);
                  setConfigVersion((v) => v + 1);
                  showToast(`${schoolLabel} 기본값으로 복원됨`);
                } else {
                  // 기본값 → 변경 모드 (입력 폼 표시)
                  setForceEdit(true);
                }
              }}
              style={styles.resetBtn}
            >{isCustom ? '재설정' : '변경'}</button>
          </div>
          <button onClick={handleImport} disabled={importing} style={styles.primaryBtn}>
            {importing ? '가져오는 중...' : `📥 ${schoolLabel} 학사일정 가져오기`}
          </button>
          <p style={styles.hint}>💡 중복된 일정은 자동으로 건너뜁니다.</p>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 8 },
  desc: { fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 },
  link: { color: 'var(--accent)', textDecoration: 'none' },
  methodSection: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '8px 10px', borderRadius: 6,
    background: 'var(--bg-secondary)',
  },
  methodLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' },
  inputRow: { display: 'flex', gap: 4 },
  input: {
    flex: 1, padding: '6px 10px', fontSize: 11,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)', outline: 'none',
  },
  resultsList: {
    display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4,
    maxHeight: 200, overflowY: 'auto',
  },
  resultItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '6px 8px', borderRadius: 4,
    background: 'var(--bg-primary, #fff)', border: '1px solid var(--border-subtle)',
    cursor: 'pointer', textAlign: 'left',
  },
  currentConfig: {
    display: 'flex', gap: 6, alignItems: 'center',
    padding: '6px 10px', borderRadius: 6,
    background: 'var(--bg-secondary)',
  },
  primaryBtn: {
    padding: '6px 12px', fontSize: 11, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: '#fff', cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  hint: { fontSize: 10, color: 'var(--text-muted)', margin: 0 },
  schoolTabs: { display: 'flex', gap: 4 },
  tabBtn: {
    flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 600,
    border: '1px solid var(--border-subtle)', borderRadius: 6,
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  tabBtnActive: {
    background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)',
  },
  cancelEditBtn: {
    padding: '4px 10px', fontSize: 10,
    border: '1px solid var(--border-color)', borderRadius: 4,
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  defaultBadge: {
    fontSize: 9, fontWeight: 700,
    padding: '1px 6px', borderRadius: 3,
    background: 'rgba(16,185,129,0.15)',
    color: '#10B981',
  },
  resetBtn: {
    marginLeft: 'auto', padding: '2px 8px', fontSize: 10,
    border: '1px solid var(--border-color)', borderRadius: 4,
    background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
  },
};

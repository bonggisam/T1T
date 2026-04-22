import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { importNeisScheduleToFirestore, getNeisConfig, setNeisConfig, removeNeisConfig } from '../../utils/neisSchedule';
import { showToast } from '../common/Toast';
import { SCHOOL_LABELS } from '@shared/types';
import type { School } from '@shared/types';

export function NeisScheduleImport() {
  const { user } = useAuthStore();
  const [importing, setImporting] = useState(false);
  const [eduCode, setEduCode] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [configVersion, setConfigVersion] = useState(0);

  // 슈퍼관리자는 중/고 모두 설정 가능 → 어떤 학교 설정할지 선택
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
  // 일반 관리자는 본인 학교 미지정 시 차단, 슈퍼관리자는 선택 가능
  if (!isSuperAdmin && user.school !== 'taeseong_middle' && user.school !== 'taeseong_high') {
    return (
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        학교가 미지정되어 학사일정을 가져올 수 없습니다.
        <br />본인 계정의 학교를 먼저 지정해주세요.
      </p>
    );
  }

  // 표시/조작 대상 학교 (슈퍼는 선택값, 일반은 본인 학교)
  const activeSchool: School = isSuperAdmin ? targetSchool : (user.school as School);
  const currentConfig = React.useMemo(
    () => getNeisConfig(activeSchool),
    [activeSchool, configVersion],
  );
  const schoolLabel = SCHOOL_LABELS[activeSchool];

  function handleSaveCode() {
    if (!eduCode.trim() || !schoolCode.trim()) return;
    setNeisConfig(activeSchool, { education: eduCode.trim(), school: schoolCode.trim() });
    showToast(`${schoolLabel} 학교 코드 저장됨`);
    setEduCode('');
    setSchoolCode('');
    setConfigVersion((v) => v + 1);
  }

  async function handleImport() {
    const cfg = getNeisConfig(activeSchool);
    if (!cfg) { showToast('먼저 학교 코드를 설정하세요', 'error'); return; }

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
      {/* 슈퍼관리자 전용 학교 선택 탭 */}
      {isSuperAdmin && (
        <div style={styles.schoolTabs}>
          <button
            onClick={() => setTargetSchool('taeseong_middle')}
            style={{
              ...styles.tabBtn,
              ...(targetSchool === 'taeseong_middle' ? styles.tabBtnActive : {}),
            }}
          >🏫 태성중</button>
          <button
            onClick={() => setTargetSchool('taeseong_high')}
            style={{
              ...styles.tabBtn,
              ...(targetSchool === 'taeseong_high' ? styles.tabBtnActive : {}),
            }}
          >🎓 태성고</button>
        </div>
      )}

      <p style={styles.desc}>
        📚 {schoolLabel} 학사일정을 NEIS에서 자동으로 가져옵니다.
        <br />
        <a href="https://open.neis.go.kr/portal/guide/actKnowHow.do" target="_blank" rel="noreferrer" style={styles.link}>
          학교 코드 조회 →
        </a>
      </p>

      {!currentConfig ? (
        <>
          <input
            type="text" placeholder="교육청 코드 (예: K10)"
            value={eduCode} onChange={(e) => setEduCode(e.target.value)}
            style={styles.input}
          />
          <input
            type="text" placeholder="학교 코드 (7자리 숫자)"
            value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)}
            style={styles.input}
          />
          <button onClick={handleSaveCode} disabled={!eduCode.trim() || !schoolCode.trim()} style={styles.primaryBtn}>
            {schoolLabel} 학교 코드 저장
          </button>
        </>
      ) : (
        <>
          <div style={styles.currentConfig}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>현재 설정:</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
              {currentConfig.education} / {currentConfig.school}
            </span>
            {isSuperAdmin && (
              <button
                onClick={() => {
                  if (!window.confirm(`${schoolLabel} NEIS 설정을 초기화하시겠습니까?`)) return;
                  removeNeisConfig(activeSchool);
                  setConfigVersion((v) => v + 1);
                  showToast(`${schoolLabel} 설정 초기화됨`);
                }}
                style={styles.resetBtn}
              >재설정</button>
            )}
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
  container: { display: 'flex', flexDirection: 'column', gap: 6 },
  desc: { fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 },
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 10 },
  input: {
    padding: '6px 10px', fontSize: 11,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  currentConfig: {
    display: 'flex', gap: 6, alignItems: 'center',
    padding: '4px 8px', borderRadius: 6,
    background: 'var(--bg-secondary)',
  },
  primaryBtn: {
    padding: '6px 12px', fontSize: 11, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: '#fff', cursor: 'pointer',
  },
  hint: { fontSize: 10, color: 'var(--text-muted)', margin: 0 },
  schoolTabs: {
    display: 'flex', gap: 4, marginBottom: 4,
  },
  tabBtn: {
    flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 600,
    border: '1px solid var(--border-subtle)', borderRadius: 6,
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  tabBtnActive: {
    background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)',
  },
  resetBtn: {
    marginLeft: 'auto', padding: '2px 8px', fontSize: 10,
    border: '1px solid var(--border-color)', borderRadius: 4,
    background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
  },
};

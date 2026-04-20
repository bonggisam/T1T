import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { importNeisScheduleToFirestore, getNeisConfig, setNeisConfig } from '../../utils/neisSchedule';
import { showToast } from '../common/Toast';
import { SCHOOL_LABELS } from '@shared/types';

export function NeisScheduleImport() {
  const { user } = useAuthStore();
  const [importing, setImporting] = useState(false);
  const [eduCode, setEduCode] = useState('');
  const [schoolCode, setSchoolCode] = useState('');

  if (!user) return null;
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';
  if (!isAdmin) {
    return <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>관리자만 학사일정을 가져올 수 있습니다.</p>;
  }

  const currentConfig = getNeisConfig(user.school);
  const schoolLabel = SCHOOL_LABELS[user.school];

  function handleSaveCode() {
    if (!eduCode.trim() || !schoolCode.trim() || !user) return;
    setNeisConfig(user.school, { education: eduCode.trim(), school: schoolCode.trim() });
    showToast('학교 코드 저장됨');
    setEduCode('');
    setSchoolCode('');
  }

  async function handleImport() {
    if (!user) return;
    const cfg = getNeisConfig(user.school);
    if (!cfg) { showToast('먼저 학교 코드를 설정하세요', 'error'); return; }

    // 올해 1월 1일 ~ 내년 2월 28일까지 (학년도)
    const year = new Date().getFullYear();
    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 1, 28);

    setImporting(true);
    try {
      const count = await importNeisScheduleToFirestore(user.school, user.id, user.name, from, to);
      showToast(`${count}개 학사일정을 가져왔습니다`);
    } catch (err: any) {
      console.error('[NEIS Import] failed:', err);
      showToast(err.message || '가져오기 실패', 'error');
    }
    setImporting(false);
  }

  return (
    <div style={styles.container}>
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
            학교 코드 저장
          </button>
        </>
      ) : (
        <>
          <div style={styles.currentConfig}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>현재 설정:</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
              {currentConfig.education} / {currentConfig.school}
            </span>
          </div>
          <button onClick={handleImport} disabled={importing} style={styles.primaryBtn}>
            {importing ? '가져오는 중...' : '📥 올해 학사일정 가져오기'}
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
};

import React, { useState } from 'react';
import { useComciganStore } from '../../store/comciganStore';
import { useAuthStore } from '../../store/authStore';
import { LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import { useComciganOutageStore } from '../../store/comciganOutageStore';
import { ComciganCallButton } from '../common/ComciganCall';

export function ComciganSettings() {
  const { config, timetableData, searchResults, searching, loading, error, searchSchool, configure, fetchTimetable, clearConfig } = useComciganStore();

  const [schoolQuery, setSchoolQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<{ code: number; name: string } | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [maxGrade, setMaxGrade] = useState(3);
  const user = useAuthStore((s) => s.user);
  const links = useComciganLinksStore((s) => s.links);
  const outage = useComciganOutageStore((s) => s.outage);
  // 관리자가 연결표에 올린 내 표기
  const myLinks = LINK_SCHOOLS.flatMap((school) => {
    const doc = links[school];
    return (doc?.entries ?? [])
      .filter((e) => e.userId === user?.id)
      .map((e) => ({ label: e.label, schoolCode: doc!.schoolCode, schoolName: doc!.schoolName, maxGrade: doc!.maxGrade }));
  });

  if (config) {
    // Already configured — show status
    const lastUpdate = timetableData?.lastUpdated
      ? new Date(timetableData.lastUpdated).toLocaleString('ko-KR')
      : '없음';
    const periodCount = timetableData?.teacherSchedule.length ?? 0;
    const currentLabel = config.teacherLabel ?? config.teacherName.substring(0, 2);
    const linked = myLinks.find((l) => l.schoolCode === config.schoolCode);

    return (
      <div style={styles.container}>
        <div style={styles.row}>
          <span style={styles.label}>학교</span>
          <span style={styles.value}>{config.schoolName}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>교사</span>
          <span style={styles.value}>{config.teacherName}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>컴시간 표기</span>
          <span style={styles.value}>{currentLabel}</span>
        </div>
        {linked && linked.label !== currentLabel && (
          <div style={styles.row}>
            <span style={{ ...styles.label, color: 'var(--warning)' }}>연결표의 내 표기는 {linked.label}입니다</span>
            <button onClick={() => configure({ ...config, teacherLabel: linked.label })} disabled={loading} style={styles.btn}>맞추기</button>
          </div>
        )}
        <div style={styles.row}>
          <span style={styles.label}>수업</span>
          <span style={styles.value}>주 {periodCount}교시</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>갱신</span>
          <span style={styles.value}>{lastUpdate}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>자동갱신</span>
          <span style={styles.value}>주중 07:30~17:00, 5분 간격</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={() => fetchTimetable()} disabled={loading} style={styles.btn}>
            {loading ? '갱신 중...' : '새로고침'}
          </button>
          <button onClick={() => clearConfig()} style={{ ...styles.btn, color: 'var(--danger)' }}>
            초기화
          </button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
        {(error || outage) && (
          <div style={styles.row}>
            <span style={styles.label}>시간표를 받지 못하고 있습니다</span>
            <ComciganCallButton />
          </div>
        )}
      </div>
    );
  }

  // Setup mode
  async function handleSearch() {
    if (!schoolQuery.trim()) return;
    await searchSchool(schoolQuery.trim());
  }

  async function handleConfigure() {
    if (!selectedSchool || !teacherName.trim()) return;
    await configure({
      schoolCode: selectedSchool.code,
      schoolName: selectedSchool.name,
      teacherName: teacherName.trim(),
      maxGrade,
    });
  }

  return (
    <div style={styles.container}>
      {/* 관리자가 연결표에 올려 두었으면 검색 없이 바로 연결한다 */}
      {user && myLinks.map((link) => (
        <button
          key={link.schoolCode}
          onClick={() => configure({
            schoolCode: link.schoolCode,
            schoolName: link.schoolName,
            teacherName: user.name,
            maxGrade: link.maxGrade || 3,
            teacherLabel: link.label,
          })}
          disabled={loading}
          style={{ ...styles.btn, background: 'var(--accent)', color: 'var(--on-accent)', width: '100%', marginBottom: 4 }}
        >
          {loading ? '설정 중...' : `연결표로 바로 연결: ${link.schoolName} (${link.label})`}
        </button>
      ))}

      {/* School search */}
      <div style={styles.searchRow}>
        <input
          type="text"
          placeholder="학교 이름 검색"
          value={schoolQuery}
          onChange={(e) => setSchoolQuery(e.target.value)}
          onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleSearch(); }}
          style={styles.input}
        />
        <button onClick={handleSearch} disabled={searching} style={styles.btn}>
          {searching ? '...' : '검색'}
        </button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div style={styles.results}>
          {searchResults.map((s) => (
            <div
              key={s.code}
              onClick={() => setSelectedSchool({ code: s.code, name: s.name })}
              style={{
                ...styles.resultItem,
                background: selectedSchool?.code === s.code ? 'var(--accent)' : 'transparent',
                color: selectedSchool?.code === s.code ? 'var(--on-accent)' : 'var(--text-primary)',
              }}
            >
              {s.name} <span style={{ fontSize: 'var(--fs-caption)', opacity: 0.7 }}>({s.region})</span>
            </div>
          ))}
        </div>
      )}

      {selectedSchool && (
        <>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--text-secondary)', marginTop: 6 }}>
            선택: <strong>{selectedSchool.name}</strong>
          </div>

          {/* Teacher name */}
          <input
            type="text"
            placeholder="교사 이름 (예: 김철수)"
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            style={{ ...styles.input, marginTop: 6 }}
          />

          {/* Max grade */}
          <div style={{ ...styles.row, marginTop: 6 }}>
            <span style={styles.label}>최고 학년</span>
            <select
              value={maxGrade}
              onChange={(e) => setMaxGrade(Number(e.target.value))}
              style={styles.select}
            >
              <option value={3}>3학년</option>
              <option value={6}>6학년</option>
            </select>
          </div>

          <button
            onClick={handleConfigure}
            disabled={!teacherName.trim() || loading}
            style={{ ...styles.btn, marginTop: 8, background: 'var(--accent)', color: 'var(--on-accent)', width: '100%' }}
          >
            {loading ? '설정 중...' : '시간표 연동 시작'}
          </button>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
      {error && (
        <div style={styles.row}>
          <span style={styles.label}>계속 안 되면 알려 주세요</span>
          <ComciganCallButton />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
  },
  value: {
    fontSize: 'var(--fs-label)',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  searchRow: {
    display: 'flex',
    gap: 4,
  },
  input: {
    flex: 1,
    padding: '5px 8px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  select: {
    padding: '3px 6px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  btn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  results: {
    maxHeight: 100,
    overflow: 'auto',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    marginTop: 4,
  },
  resultItem: {
    padding: '4px 8px',
    fontSize: 'var(--fs-label)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  error: {
    fontSize: 'var(--fs-caption)',
    color: 'var(--danger)',
    marginTop: 4,
  },
};

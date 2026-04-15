import React, { useState } from 'react';
import { useComciganStore } from '../../store/comciganStore';

export function ComciganSettings() {
  const { config, timetableData, searchResults, searching, loading, error, searchSchool, configure, fetchTimetable, clearConfig } = useComciganStore();

  const [schoolQuery, setSchoolQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<{ code: number; name: string } | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [maxGrade, setMaxGrade] = useState(3);

  if (config) {
    // Already configured — show status
    const lastUpdate = timetableData?.lastUpdated
      ? new Date(timetableData.lastUpdated).toLocaleString('ko-KR')
      : '없음';
    const periodCount = timetableData?.teacherSchedule.length ?? 0;

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
            {loading ? '갱신 중...' : '🔄 새로고침'}
          </button>
          <button onClick={() => clearConfig()} style={{ ...styles.btn, color: 'var(--danger)' }}>
            초기화
          </button>
        </div>
        {error && <p style={styles.error}>{error}</p>}
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
      {/* School search */}
      <div style={styles.searchRow}>
        <input
          type="text"
          placeholder="학교 이름 검색"
          value={schoolQuery}
          onChange={(e) => setSchoolQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
                color: selectedSchool?.code === s.code ? '#fff' : 'var(--text-primary)',
              }}
            >
              {s.name} <span style={{ fontSize: 10, opacity: 0.7 }}>({s.region})</span>
            </div>
          ))}
        </div>
      )}

      {selectedSchool && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
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
            style={{ ...styles.btn, marginTop: 8, background: 'var(--accent)', color: '#fff', width: '100%' }}
          >
            {loading ? '설정 중...' : '🏫 시간표 연동 시작'}
          </button>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
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
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  value: {
    fontSize: 11,
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
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  select: {
    padding: '3px 6px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  btn: {
    padding: '4px 10px',
    fontSize: 11,
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
    fontSize: 11,
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  error: {
    fontSize: 10,
    color: 'var(--danger)',
    marginTop: 4,
  },
};

import React, { useState } from 'react';
import { useComciganStore } from '../../store/comciganStore';
import { useAuthStore } from '../../store/authStore';
import { useComciganOutageStore } from '../../store/comciganOutageStore';
import { formatItems, formatOwnText } from '../../utils/teachingAssignments';
import { ComciganCallButton } from '../common/ComciganCall';
import { showToast } from '../common/Toast';

const SOURCE_LABEL: Record<string, string> = {
  admin: '관리자 표',
  self: '직접 입력',
  timetable: '전에 받은 시간표',
};

/**
 * 내 시간표. 나이스 시간표를 담당 학급 표와 맞춘 값이고, 학교와 이름으로 자동으로 연결된다.
 * 표에 없을 때만 직접 넣는다.
 */
export function ComciganSettings() {
  const user = useAuthStore((s) => s.user);
  const timetableData = useComciganStore((s) => s.timetableData);
  const assignment = useComciganStore((s) => s.assignment);
  const assignmentChecked = useComciganStore((s) => s.assignmentChecked);
  const loading = useComciganStore((s) => s.loading);
  const error = useComciganStore((s) => s.error);
  const fetchTimetable = useComciganStore((s) => s.fetchTimetable);
  const saveOwnItems = useComciganStore((s) => s.saveOwnItems);
  const outage = useComciganOutageStore((s) => s.outage);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const items = assignment?.items ?? [];
  const slots = assignment?.slots ?? [];
  const hasItems = items.length > 0 || slots.length > 0;
  const showForm = editing || (assignmentChecked && !hasItems);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setNote(null);
    try {
      const result = await saveOwnItems(text);
      if (!result.ok) {
        setNote(result.badLines.length > 0
          ? `이 줄을 읽지 못했습니다: ${result.badLines[0]}`
          : '과목과 학급을 넣어 주세요. 예: 국어 2-1 2-3');
        return;
      }
      setEditing(false);
      setText('');
      if (result.unknown.length > 0) {
        const first = result.unknown[0];
        setNote(`${first.grade}-${first.classNum} 시간표에서 ${first.subject}을(를) 찾지 못했습니다. 과목 이름을 확인해 주세요.`);
      } else {
        showToast('담당 학급을 저장했습니다', 'success');
      }
    } catch (err: any) {
      console.warn('[Timetable] save failed:', err);
      setNote(err?.code === 'permission-denied'
        ? '서버 규칙이 아직 적용되지 않아 저장하지 못했습니다'
        : '저장하지 못했습니다. 잠시 뒤 다시 해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  const lastUpdate = timetableData?.lastUpdated
    ? new Date(timetableData.lastUpdated).toLocaleString('ko-KR')
    : '없음';

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.label}>연결</span>
        <span style={styles.value}>{user?.name || '이름 없음'}{timetableData?.schoolName ? ` · ${timetableData.schoolName}` : ''}</span>
      </div>

      {hasItems && (
        <>
          <div style={styles.row}>
            <span style={styles.label}>담당</span>
            <span style={{ ...styles.value, textAlign: 'right' }}>{formatItems(items, slots)}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>근거</span>
            <span style={styles.value}>{SOURCE_LABEL[assignment?.source ?? 'timetable']}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>이번 주 수업</span>
            <span style={styles.value}>주 {timetableData?.teacherSchedule.length ?? 0}교시</span>
          </div>
        </>
      )}

      <div style={styles.row}>
        <span style={styles.label}>갱신</span>
        <span style={styles.value}>{lastUpdate}</span>
      </div>

      {hasItems && timetableData && timetableData.classTimes.length === 0 && (
        <p style={styles.warn}>시정표가 아직 없어 수업 시각을 모릅니다. 관리자에게 시정표 입력을 부탁해 주세요.</p>
      )}

      {!showForm && (
        <div style={styles.buttons}>
          <button onClick={() => fetchTimetable()} disabled={loading} style={styles.btn}>
            {loading ? '갱신 중...' : '새로고침'}
          </button>
          <button onClick={() => { setText(formatOwnText(items, slots)); setEditing(true); }} style={styles.btn}>담당 학급 고치기</button>
        </div>
      )}

      {showForm && (
        <div style={styles.form}>
          {!hasItems && (
            <p style={styles.note}>
              담당 학급 표에서 이름을 찾지 못했습니다. 관리자가 표를 올리면 자동으로 연결됩니다. 먼저 쓰시려면 직접 넣어 주세요.
            </p>
          )}
          <p style={styles.note}>나이스 시간표에 없는 이동수업은 요일과 교시를 함께 적습니다. 예: 문학 3-1 월4 수3</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'국어 2-1 2-3\n문학 3-1 월4 수3'}
            rows={Math.min(8, Math.max(3, text.split('\n').length))}
            aria-label="담당 과목과 학급"
            style={styles.textarea}
          />
          <div style={styles.buttons}>
            <button onClick={handleSave} disabled={saving || !text.trim()} style={styles.primary}>
              {saving ? '저장 중...' : '저장'}
            </button>
            {editing && <button onClick={() => { setEditing(false); setText(''); setNote(null); }} style={styles.btn}>취소</button>}
          </div>
        </div>
      )}

      {note && <p style={styles.warn}>{note}</p>}
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
    gap: 8,
  },
  label: {
    flex: 'none',
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
  },
  value: {
    fontSize: 'var(--fs-label)',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  buttons: {
    display: 'flex',
    gap: 6,
    marginTop: 6,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 6,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '5px 8px',
    fontSize: 'var(--fs-label)',
    fontFamily: 'inherit',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
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
  primary: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--accent)',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  note: {
    margin: 0,
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-secondary)',
  },
  warn: {
    margin: '4px 0 0',
    fontSize: 'var(--fs-caption)',
    color: 'var(--warning)',
  },
  error: {
    margin: '4px 0 0',
    fontSize: 'var(--fs-caption)',
    color: 'var(--danger)',
  },
};

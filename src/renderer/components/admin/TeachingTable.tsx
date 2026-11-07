import React, { useEffect, useMemo, useState } from 'react';
import { deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import type { School, User } from '@shared/types';
import { SCHOOL_LABELS } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import { loadNeisWeek, type NeisCell } from '../../utils/neisTimetable';
import {
  formatClassTimes, formatItems, parseAssignmentText, parseClassTimesText, resolveItems, type AssignmentRow,
} from '../../utils/teachingAssignments';
import { saveAssignmentRows, saveClassTimes, teacherDoc } from '../../utils/teachingDocs';
import { showToast } from '../common/Toast';

const SOURCE_LABEL: Record<string, string> = { admin: '관리자 표', self: '본인 입력', timetable: '자동', file: '컴시간 파일' };

interface PreviewRow extends AssignmentRow {
  /** 나이스 시간표의 그 학급에서 찾지 못한 과목 */
  unknown: string[];
  hasAccount: boolean;
}

/**
 * 담당 학급 표. 나이스 시간표에는 교사 이름이 없어서, 이 표로 이름과 시간표를 잇는다.
 * 한 번 올리면 선생님은 로그인한 이름과 학교로 자동으로 연결된다.
 * 컴시간 파일(학교 기초 시간표)은 관리자 화면의 기초 시간표 탭(도구 모음의 기초 시간표와 같은 화면)에서 올린다.
 */
export function TeachingTable({ users, onOpenBase }: { users: User[]; onOpenBase?: () => void }) {
  const me = useAuthStore((s) => s.user);
  const assignments = useComciganLinksStore((s) => s.assignments);
  const classTimes = useComciganLinksStore((s) => s.classTimes);
  const bases = useComciganLinksStore((s) => s.bases);
  const basesDenied = useComciganLinksStore((s) => s.basesDenied);
  const linksLoaded = useComciganLinksStore((s) => s.linksLoaded);
  const linksDenied = useComciganLinksStore((s) => s.linksDenied);

  const [school, setSchool] = useState<School>(me?.school === 'taeseong_high' ? 'taeseong_high' : 'taeseong_middle');
  const [cells, setCells] = useState<NeisCell[] | null>(null);
  const [neisError, setNeisError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [badLines, setBadLines] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [replaceAuto, setReplaceAuto] = useState(false);
  const [replaceFileRows, setReplaceFileRows] = useState(false);
  const [timesText, setTimesText] = useState('');

  useEffect(() => {
    let active = true;
    setCells(null);
    setNeisError(null);
    setPreview(null);
    setBadLines([]);
    setReplaceAuto(false);
    setReplaceFileRows(false);
    loadNeisWeek(school)
      .then((week) => { if (active) setCells(week.cells); })
      .catch((err) => { if (active) setNeisError(err?.message || '나이스에서 시간표를 받지 못했습니다'); });
    return () => { active = false; };
  }, [school]);

  const savedTimes = classTimes[school];
  useEffect(() => {
    setTimesText(formatClassTimes(savedTimes ?? []));
  }, [school, savedTimes]);

  const rows = useMemo(() => assignments[school] ?? [], [assignments, school]);
  const teachers = useMemo(() => users.filter((u) => u.school === school), [users, school]);
  const accountNames = useMemo(() => new Set(users.map((u) => (u.name || '').trim())), [users]);
  const rowNames = useMemo(() => new Set(rows.map((r) => r.name)), [rows]);
  const missing = useMemo(
    () => teachers.filter((u) => !rowNames.has((u.name || '').trim())).map((u) => u.name).sort((a, b) => a.localeCompare(b, 'ko')),
    [teachers, rowNames],
  );
  const listed = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ko')), [rows]);
  const namesOf = (source: string) => new Set(rows.filter((r) => r.source === source).map((r) => r.name));
  // 자동 연결은 전에 받은 시간표의 요일과 교시다. 다시 구할 수 없으므로 고른 경우에만 바꾼다
  const autoNames = useMemo(() => namesOf('timetable'), [rows]);
  // 컴시간 파일로 만든 표는 학교 전체 시간표에서 나온 정확한 값이라 붙여 넣기로 바꿀 때 묻는다
  const fileNames = useMemo(() => namesOf('file'), [rows]);
  const autoCount = preview?.filter((row) => autoNames.has(row.name)).length ?? 0;
  const fileRowCount = preview?.filter((row) => fileNames.has(row.name)).length ?? 0;
  const toSave = preview?.filter((row) => (
    (replaceAuto || !autoNames.has(row.name)) && (replaceFileRows || !fileNames.has(row.name))
  )) ?? [];

  // 기초 시간표는 기초 시간표 탭에서 올린다. 여기서는 올라 있는지만 보여 준다
  const base = bases[school] ?? null;
  const baseTeachers = useMemo(() => new Set(base?.lessons.map((l) => l.name) ?? []).size, [base]);

  function handlePreview() {
    const parsed = parseAssignmentText(text);
    setBadLines(parsed.badLines);
    setReplaceAuto(false);
    setReplaceFileRows(false);
    setPreview(parsed.rows.map((row) => {
      const resolved = cells ? resolveItems(row.items, cells) : { items: row.items, unknown: [] };
      return {
        name: row.name,
        items: resolved.items,
        slots: row.slots,
        unknown: resolved.unknown.map((u) => `${u.subject} ${u.grade}-${u.classNum}`),
        hasAccount: accountNames.has(row.name),
      };
    }));
  }

  async function handleSave() {
    if (!me || toSave.length === 0 || saving) return;
    setSaving(true);
    try {
      await saveAssignmentRows(school, toSave.map(({ name, items, slots }) => ({ name, items, slots })), me.id);
      showToast(`${toSave.length}명을 저장했습니다`, 'success');
      setText('');
      setPreview(null);
      setBadLines([]);
    } catch (err: any) {
      console.warn('[Teaching] save failed:', err);
      showToast(err?.code === 'permission-denied' ? '서버 규칙이 아직 적용되지 않아 저장하지 못했습니다' : '표를 저장하지 못했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(name: string) {
    if (!window.confirm(`${name} 선생님을 표에서 뺄까요?`)) return;
    try {
      await deleteDoc(teacherDoc(school, name));
    } catch (err) {
      console.warn('[Teaching] remove failed:', err);
      showToast('표에서 빼지 못했습니다', 'error');
    }
  }

  async function handleSaveTimes() {
    if (!me) return;
    const parsed = parseClassTimesText(timesText);
    if (parsed.length < 4) {
      showToast('교시 시작 시각을 차례로 넣어 주세요. 예: 08:40 09:35 10:30 11:25', 'error');
      return;
    }
    try {
      await saveClassTimes(school, parsed, me.id);
      showToast(`시정표 ${parsed.length}교시를 저장했습니다`, 'success');
    } catch (err) {
      console.warn('[Teaching] class times save failed:', err);
      showToast('시정표를 저장하지 못했습니다', 'error');
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.seg} role="group" aria-label="학교">
        {LINK_SCHOOLS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSchool(s)}
            aria-pressed={school === s}
            style={{ ...styles.segBtn, ...(school === s ? styles.segOn : {}) }}
          >
            {SCHOOL_LABELS[s]}
          </button>
        ))}
      </div>

      <p style={styles.note}>
        나이스 시간표에는 교사 이름이 없어서 이 표로 이름과 시간표를 잇습니다. 표의 이름이 계정 이름과 같으면 선생님이 따로 할 일 없이 자동으로 연결됩니다.
      </p>
      {linksDenied && <p style={styles.warn}>표를 읽지 못했습니다. 서버 규칙 적용 여부를 확인해 주세요.</p>}
      {neisError && <p style={styles.warn}>{neisError}. 과목 이름 확인 없이 저장됩니다.</p>}

      <section style={styles.card} aria-label="기초 시간표">
        <h4 style={styles.h4}>기초 시간표</h4>
        <p style={styles.note}>
          {base
            ? `선생님 ${baseTeachers}명 · 수업 ${base.lessons.length}칸${base.updatedAt ? ` · ${format(base.updatedAt, 'M/d HH:mm')} 올림` : ''}. `
            : basesDenied ? '서버 규칙이 적용되지 않아 읽지 못했습니다. ' : '아직 올리지 않았습니다. '}
          컴시간 파일은 기초 시간표 탭에서 올립니다. 올리면 이 표도 함께 채워집니다.
        </p>
        {onOpenBase && (
          <div style={styles.actions}>
            <button type="button" onClick={onOpenBase} style={styles.btn}>기초 시간표 열기</button>
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h4 style={styles.h4}>표 붙여 넣기</h4>
        <p style={styles.note}>줄마다 이름, 과목, 학급 순서로 씁니다. 엑셀이나 한글 표를 복사해 넣어도 됩니다. 과목이 여럿이면 줄을 나눕니다. 나이스 시간표에 없는 이동수업은 요일과 교시를 함께 적습니다.</p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          placeholder={'김선생\t국어\t2-1 2-3 2-5\n김선생\t독서\t1-2\n이선생\t수학\t1-1~4\n박선생\t문학\t3-1 월4 수3'}
          rows={6}
          aria-label="담당 학급 표"
          style={styles.textarea}
        />
        <div style={styles.actions}>
          <button type="button" onClick={handlePreview} disabled={!text.trim()} style={styles.btn}>표 확인</button>
          {toSave.length > 0 && (
            <button type="button" onClick={handleSave} disabled={saving} style={styles.primary}>
              {saving ? '저장 중...' : `${toSave.length}명 저장`}
            </button>
          )}
        </div>
        {autoCount > 0 && (
          <label style={styles.check}>
            <input type="checkbox" checked={replaceAuto} onChange={(e) => setReplaceAuto(e.target.checked)} />
            자동 연결된 {autoCount}명도 이 표로 바꾸기. 전에 받은 시간표의 요일과 교시는 서버에서 사라집니다.
          </label>
        )}
        {fileRowCount > 0 && (
          <label style={styles.check}>
            <input type="checkbox" checked={replaceFileRows} onChange={(e) => setReplaceFileRows(e.target.checked)} />
            컴시간 파일로 올린 {fileRowCount}명도 이 표로 바꾸기
          </label>
        )}
        {badLines.length > 0 && <p style={styles.warn}>읽지 못한 줄 {badLines.length}개: {badLines[0]}</p>}
        {preview && preview.length === 0 && <p style={styles.warn}>읽은 줄이 없습니다. 이름, 과목, 학급 순서인지 확인해 주세요.</p>}
        {preview && preview.length > 0 && (
          <ul style={styles.list} aria-label="저장할 표">
            {preview.map((row) => (
              <li key={row.name} style={styles.item}>
                <b style={styles.name}>{row.name}</b>
                <span style={styles.items}>{formatItems(row.items, row.slots)}</span>
                {!row.hasAccount && <span style={styles.tag}>가입 전</span>}
                {autoNames.has(row.name) && !replaceAuto && <span style={styles.tag}>자동 연결 유지</span>}
                {fileNames.has(row.name) && !replaceFileRows && <span style={styles.tag}>컴시간 파일 유지</span>}
                {row.unknown.length > 0 && <span style={styles.warnTag}>시간표에 없음: {row.unknown.join(', ')}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={styles.card}>
        <h4 style={styles.h4}>시정표</h4>
        <p style={styles.note}>나이스에는 수업 시각이 없습니다. 교시 시작 시각을 차례로 넣어 주세요.</p>
        <div style={styles.actions}>
          <input
            value={timesText}
            onChange={(e) => setTimesText(e.target.value)}
            placeholder="08:40 09:35 10:30 11:25 13:10 14:05 15:00"
            aria-label="시정표"
            style={styles.input}
          />
          <button type="button" onClick={handleSaveTimes} disabled={!timesText.trim()} style={styles.btn}>저장</button>
        </div>
      </section>

      <section style={styles.card}>
        <h4 style={styles.h4}>지금 표 ({listed.length}명)</h4>
        {!linksLoaded ? (
          <p style={styles.note}>표를 읽는 중입니다</p>
        ) : listed.length === 0 ? (
          <p style={styles.note}>아직 없습니다.</p>
        ) : (
          <ul style={styles.list} aria-label="담당 학급 표 목록">
            {listed.map((row) => (
              <li key={row.name} style={styles.item}>
                <b style={styles.name}>{row.name}</b>
                <span style={styles.items}>{formatItems(row.items, row.slots)}</span>
                <span style={styles.tag}>{SOURCE_LABEL[row.source]}</span>
                <button type="button" onClick={() => handleRemove(row.name)} style={styles.link}>빼기</button>
              </li>
            ))}
          </ul>
        )}
        {missing.length > 0 && (
          <p style={styles.warn}>표에 없는 선생님 {missing.length}명: {missing.join(', ')}</p>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px', overflow: 'auto', flex: 1 },
  seg: { display: 'flex', gap: 4 },
  segBtn: {
    padding: '4px 10px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  segOn: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 8,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
  },
  h4: { margin: 0, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--text-primary)' },
  note: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--text-secondary)', wordBreak: 'keep-all' },
  warn: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--warning)', wordBreak: 'keep-all' },
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
  input: {
    flex: 1,
    minWidth: 0,
    padding: '4px 8px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  actions: { display: 'flex', gap: 6, alignItems: 'center' },
  check: { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--fs-caption)', color: 'var(--text-secondary)', wordBreak: 'keep-all' },
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
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 },
  item: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, fontSize: 'var(--fs-label)' },
  name: { flex: 'none', minWidth: 52, color: 'var(--text-primary)' },
  items: { flex: 1, minWidth: 120, color: 'var(--text-secondary)' },
  tag: { flex: 'none', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' },
  warnTag: { flex: 'none', fontSize: 'var(--fs-caption)', color: 'var(--warning)' },
  link: {
    flex: 'none',
    padding: 0,
    fontSize: 'var(--fs-caption)',
    border: 'none',
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
  },
};

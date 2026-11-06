import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deleteDoc } from 'firebase/firestore';
import type { School, User } from '@shared/types';
import { SCHOOL_LABELS } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import { loadNeisWeek, type NeisCell } from '../../utils/neisTimetable';
import {
  assignmentsFromLessons, formatClassTimes, formatItems, parseAssignmentText, parseClassTimesText, resolveItems,
  type AssignmentRow, type BaseAssignments,
} from '../../utils/teachingAssignments';
import { decodeTimetableFile, parseTimetableFile, TIMETABLE_FILE_LABEL, type TimetableFile } from '../../utils/timetableFile';
import { saveAssignmentRows, saveClassTimes, teacherDoc } from '../../utils/teachingDocs';
import { showToast } from '../common/Toast';

const SOURCE_LABEL: Record<string, string> = { admin: '관리자 표', self: '본인 입력', timetable: '자동', file: '컴시간 파일' };
/** 컴시간에서 저장한 시간표 CSV는 수십 KB다 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** 이번 주 나이스와 같은 칸이 이보다 적으면 다른 학교 파일로 보고 저장하지 않는다 */
const WRONG_SCHOOL_RATE = 0.3;
/** 이보다 적으면 시험이나 행사 주간일 수 있다고 알린다 */
const UNUSUAL_WEEK_RATE = 0.9;

interface PreviewRow extends AssignmentRow {
  /** 나이스 시간표의 그 학급에서 찾지 못한 과목 */
  unknown: string[];
  hasAccount: boolean;
}

/**
 * 담당 학급 표. 나이스 시간표에는 교사 이름이 없어서, 이 표로 이름과 시간표를 잇는다.
 * 한 번 올리면 선생님은 로그인한 이름과 학교로 자동으로 연결된다.
 */
export function TeachingTable({ users }: { users: User[] }) {
  const me = useAuthStore((s) => s.user);
  const assignments = useComciganLinksStore((s) => s.assignments);
  const classTimes = useComciganLinksStore((s) => s.classTimes);
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
  const [upload, setUpload] = useState<{ fileName: string; file: TimetableFile } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [replaceSelf, setReplaceSelf] = useState(false);
  const [useFileTimes, setUseFileTimes] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setCells(null);
    setNeisError(null);
    setPreview(null);
    setBadLines([]);
    setReplaceAuto(false);
    setReplaceFileRows(false);
    setReplaceSelf(false);
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
  const selfNames = useMemo(() => namesOf('self'), [rows]);
  const autoCount = preview?.filter((row) => autoNames.has(row.name)).length ?? 0;
  const fileRowCount = preview?.filter((row) => fileNames.has(row.name)).length ?? 0;
  const toSave = preview?.filter((row) => (
    (replaceAuto || !autoNames.has(row.name)) && (replaceFileRows || !fileNames.has(row.name))
  )) ?? [];

  // ─── 컴시간 파일 ───
  const fileResult = useMemo<BaseAssignments | null>(
    () => (upload && cells && cells.length > 0 ? assignmentsFromLessons(upload.file.lessons, cells) : null),
    [upload, cells],
  );
  const fileRows = fileResult?.rows ?? [];
  const fileSelfCount = fileRows.filter((row) => selfNames.has(row.name)).length;
  const fileToSave = fileRows.filter((row) => replaceSelf || !selfNames.has(row.name));
  const fileNoAccount = fileRows.filter((row) => !accountNames.has(row.name)).length;
  const matchRate = fileResult && fileResult.total > 0 ? fileResult.sameCells / fileResult.total : 0;
  const wrongSchool = !!fileResult && matchRate < WRONG_SCHOOL_RATE;
  const unusualWeek = !!fileResult && !wrongSchool && matchRate < UNUSUAL_WEEK_RATE;
  // 시험 주간처럼 나이스가 평소와 크게 다르면 과목 이름을 못 맞춘 수업이 고정 칸으로 남는다. 그 주에는 저장하지 않는다
  const unusualBlocked = unusualWeek && (fileResult?.unresolved.length ?? 0) > 0;
  const fileTimes = upload?.file.classTimes ?? [];
  const timesDiffer = fileTimes.length > 0 && formatClassTimes(fileTimes) !== formatClassTimes(savedTimes ?? []);
  const unresolvedByName = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const u of fileResult?.unresolved ?? []) byName.set(u.name, [...(byName.get(u.name) ?? []), `${u.subject} ${u.grade}-${u.classNum}`]);
    return byName;
  }, [fileResult]);

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

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setUploadError(null);
    setReplaceSelf(false);
    setUseFileTimes(true);
    if (file.size > MAX_FILE_BYTES) {
      setUpload(null);
      setUploadError('파일이 너무 큽니다. 컴시간에서 저장한 시간표 CSV 파일인지 확인해 주세요.');
      return;
    }
    try {
      const parsed = parseTimetableFile(decodeTimetableFile(await file.arrayBuffer()));
      if (!parsed || parsed.lessons.length === 0) {
        setUpload(null);
        setUploadError('컴시간 시간표로 읽지 못했습니다. 컴시간 프로그램에서 주간시간표, 교사시간표, 전체시간표 중 하나를 CSV로 저장해 올려 주세요.');
        return;
      }
      setUpload({ fileName: file.name, file: parsed });
    } catch (err) {
      console.warn('[Teaching] file read failed:', err);
      setUpload(null);
      setUploadError('파일을 읽지 못했습니다');
    }
  }

  async function handleSaveFile() {
    if (!me || !fileResult || saving || wrongSchool || unusualBlocked || fileToSave.length === 0) return;
    setSaving(true);
    const withTimes = useFileTimes && timesDiffer;
    try {
      await saveAssignmentRows(school, fileToSave.map(({ name, items, slots }) => ({ name, items, slots })), me.id, 'file');
    } catch (err: any) {
      console.warn('[Teaching] file save failed:', err);
      showToast(err?.code === 'permission-denied' ? '서버 규칙이 아직 적용되지 않아 저장하지 못했습니다' : '표를 저장하지 못했습니다', 'error');
      setSaving(false);
      return;
    }
    let timesSaved = withTimes;
    if (withTimes) {
      try {
        await saveClassTimes(school, fileTimes, me.id);
      } catch (err) {
        console.warn('[Teaching] class times save failed:', err);
        timesSaved = false;
      }
    }
    if (withTimes && !timesSaved) showToast(`${fileToSave.length}명을 저장했지만 시정표는 저장하지 못했습니다`, 'error');
    else showToast(`${fileToSave.length}명을 저장했습니다${timesSaved ? '. 시정표도 바꿨습니다' : ''}`, 'success');
    setUpload(null);
    setReplaceSelf(false);
    setSaving(false);
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

      <section
        style={{ ...styles.card, ...(dragging ? styles.cardDrop : {}) }}
        aria-label="컴시간 파일 올리기"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <h4 style={styles.h4}>컴시간 파일 올리기</h4>
        <p style={styles.note}>
          학교 컴시간 프로그램에서 저장한 주간시간표, 교사시간표, 전체시간표 중 하나(CSV)를 올리면 모든 선생님의 담당 학급을 한 번에 만듭니다.
          수업 교체는 나이스 시간표를 따라 매주 저절로 반영됩니다.
        </p>
        <div style={styles.actions}>
          <button type="button" onClick={() => fileInput.current?.click()} style={styles.btn}>파일 고르기</button>
          <span style={styles.tag}>{upload ? upload.fileName : '여기에 끌어다 놓아도 됩니다'}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            aria-label="컴시간 시간표 파일"
            style={{ display: 'none' }}
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
        {uploadError && <p style={styles.warn}>{uploadError}</p>}
        {upload && !cells && !neisError && <p style={styles.note}>나이스 시간표를 받는 중입니다</p>}
        {upload && (neisError || cells?.length === 0) && (
          <p style={styles.warn}>나이스 시간표가 있어야 과목 이름을 맞출 수 있습니다. 수업이 있는 주에 다시 올려 주세요.</p>
        )}
        {upload && fileResult && (
          <>
            <p style={styles.note}>
              {TIMETABLE_FILE_LABEL[upload.file.kind]} · 선생님 {fileRows.length}명 · 수업 {fileResult.total}칸 ·
              이번 주 나이스와 같은 칸 {fileResult.sameCells}칸({Math.round(matchRate * 100)}%)
            </p>
            {wrongSchool && (
              <p style={styles.warn}>이번 주 {SCHOOL_LABELS[school]} 나이스 시간표와 거의 맞지 않습니다. 학교를 바르게 골랐는지 확인해 주세요.</p>
            )}
            {unusualBlocked && (
              <p style={styles.warn}>
                이번 주 나이스 시간표가 평소와 많이 달라(시험이나 행사 주간일 수 있습니다) 과목 {fileResult.unresolved.length}개의 이름을 맞추지 못했습니다.
                평소 수업을 하는 주에 다시 올려 주세요.
              </p>
            )}
            {unusualWeek && !unusualBlocked && (
              <p style={styles.note}>이번 주 나이스 시간표가 평소와 꽤 다르지만 과목 이름은 모두 맞췄습니다.</p>
            )}
            {!unusualBlocked && fileResult.unresolved.length > 0 && (
              <p style={styles.warn}>나이스에서 찾지 못한 과목 {fileResult.unresolved.length}개는 요일과 교시를 그대로 둡니다.</p>
            )}
            {upload.file.warnings.map((w) => <p key={w} style={styles.warn}>{w}</p>)}
            {fileNoAccount > 0 && <p style={styles.note}>아직 가입하지 않은 선생님 {fileNoAccount}명은 가입하면 바로 연결됩니다.</p>}
            {fileSelfCount > 0 && (
              <label style={styles.check}>
                <input type="checkbox" checked={replaceSelf} onChange={(e) => setReplaceSelf(e.target.checked)} />
                직접 고친 {fileSelfCount}명도 파일대로 바꾸기
              </label>
            )}
            {timesDiffer && (
              <label style={styles.check}>
                <input type="checkbox" checked={useFileTimes} onChange={(e) => setUseFileTimes(e.target.checked)} />
                시정표도 파일대로 바꾸기: {formatClassTimes(fileTimes)}
              </label>
            )}
            <div style={styles.actions}>
              <button
                type="button"
                onClick={handleSaveFile}
                disabled={saving || wrongSchool || unusualBlocked || fileToSave.length === 0}
                style={styles.primary}
              >
                {saving ? '저장 중...' : `${fileToSave.length}명 저장`}
              </button>
              <button type="button" onClick={() => setUpload(null)} style={styles.btn}>취소</button>
            </div>
            <ul style={styles.list} aria-label="파일에서 읽은 표">
              {fileRows.map((row) => (
                <li key={row.name} style={styles.item}>
                  <b style={styles.name}>{row.name}</b>
                  <span style={styles.items}>{formatItems(row.items, row.slots)}</span>
                  {!accountNames.has(row.name) && <span style={styles.tag}>가입 전</span>}
                  {selfNames.has(row.name) && !replaceSelf && <span style={styles.tag}>직접 고친 값 유지</span>}
                  {unresolvedByName.get(row.name) && (
                    <span style={styles.warnTag}>나이스에 없음: {unresolvedByName.get(row.name)?.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
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
  cardDrop: { borderColor: 'var(--accent)', background: 'var(--bg-secondary)' },
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

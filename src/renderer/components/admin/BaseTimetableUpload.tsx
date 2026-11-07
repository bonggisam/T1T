import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { School } from '@shared/types';
import { SCHOOL_LABELS } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { useComciganLinksStore } from '../../store/comciganLinksStore';
import { useUsersStore } from '../../store/usersStore';
import { applyBaseWeek } from '../../utils/baseTimetable';
import { loadNeisWeek, NEIS_SYNC_LABEL, type NeisCell } from '../../utils/neisTimetable';
import { assignmentsFromLessons, formatClassTimes, formatItems, type BaseAssignments } from '../../utils/teachingAssignments';
import { decodeTimetableFile, parseTimetableFile, TIMETABLE_FILE_LABEL, type TimetableFile } from '../../utils/timetableFile';
import { MAX_BASE_LESSONS, saveAssignmentRows, saveClassTimes } from '../../utils/teachingDocs';
import { showToast } from '../common/Toast';

const WEEKDAY_NAMES = ['월', '화', '수', '목', '금'];
/** 컴시간에서 저장한 시간표 CSV는 수십 KB다 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** 그 주 나이스와 같은 칸이 이보다 적으면 다른 학교 파일로 보고 저장하지 않는다 */
const WRONG_SCHOOL_RATE = 0.3;
/** 이보다 적으면 시험이나 행사 주간일 수 있다고 알린다 */
const UNUSUAL_WEEK_RATE = 0.9;

/** "2026-11-09"를 "11/9"로 */
function weekLabel(weekStart: string | null): string {
  const [, m, d] = (weekStart ?? '').split('-');
  return m && d ? `${Number(m)}/${Number(d)} 주` : '이번 주';
}

/**
 * 한 학교의 기초 시간표. 지금 올라 있는 표와 그 주 나이스 대조 결과를 보여 주고, 컴시간 파일을 올려 바꾼다.
 * 파일을 올리면 학교 기초 시간표와 담당 학급 표를 함께 저장해 선생님들이 이름으로 바로 연결된다.
 */
export function BaseTimetableUpload({ school }: { school: School }) {
  const me = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const assignments = useComciganLinksStore((s) => s.assignments);
  const classTimes = useComciganLinksStore((s) => s.classTimes);
  const bases = useComciganLinksStore((s) => s.bases);
  const basesDenied = useComciganLinksStore((s) => s.basesDenied);
  const linksDenied = useComciganLinksStore((s) => s.linksDenied);

  const [cells, setCells] = useState<NeisCell[] | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [neisError, setNeisError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ fileName: string; file: TimetableFile } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [replaceSelf, setReplaceSelf] = useState(false);
  const [useFileTimes, setUseFileTimes] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setCells(null);
    setNeisError(null);
    loadNeisWeek(school)
      .then((week) => {
        if (!active) return;
        setCells(week.cells);
        setWeekStart(week.weekStart);
      })
      .catch((err) => { if (active) setNeisError(err?.message || '나이스에서 시간표를 받지 못했습니다'); });
    return () => { active = false; };
  }, [school]);

  const week = weekLabel(weekStart);
  const rows = useMemo(() => assignments[school] ?? [], [assignments, school]);
  // 표의 이름이 그 학교 계정 이름과 같아야 연결된다
  const accountNames = useMemo(
    () => new Set(users.filter((u) => u.school === school).map((u) => (u.name || '').trim())),
    [users, school],
  );
  const selfNames = useMemo(() => new Set(rows.filter((r) => r.source === 'self').map((r) => r.name)), [rows]);
  const savedTimes = classTimes[school];

  // ─── 지금 기초 시간표와 그 주 나이스 대조 ───
  const base = bases[school];
  const baseNames = useMemo(() => new Set(base?.lessons.map((l) => l.name) ?? []), [base]);
  const baseWeek = useMemo(() => (base && cells ? applyBaseWeek(base.lessons, cells) : null), [base, cells]);
  const onBase = rows.filter((r) => r.source === 'file' && baseNames.has(r.name)).length;
  const offDaysText = (baseWeek?.stats.offDays ?? [])
    .map((d) => `${WEEKDAY_NAMES[d.weekday - 1]}${d.label ? `(${d.label})` : ''}`)
    .join(', ');

  // ─── 올린 파일 ───
  const fileResult = useMemo<BaseAssignments | null>(
    () => (upload && cells && cells.length > 0 ? assignmentsFromLessons(upload.file.lessons, cells) : null),
    [upload, cells],
  );
  const fileRows = fileResult?.rows ?? [];
  const fileSelfCount = fileRows.filter((row) => selfNames.has(row.name)).length;
  const fileToSave = fileRows.filter((row) => replaceSelf || !selfNames.has(row.name));
  const fileNoAccount = fileRows.filter((row) => !accountNames.has(row.name)).length;
  // 같은 칸 비율은 나이스가 다른 이름으로 적는 수업(스포츠클럽 같은)을 빼고 잰다. 그 수업은 어느 주에도 같은 칸이 없다
  const matchRate = fileResult && fileResult.comparable > 0 ? fileResult.sameCells / fileResult.comparable : 0;
  const wrongSchool = !!fileResult && matchRate < WRONG_SCHOOL_RATE;
  const unusualWeek = !!fileResult && !wrongSchool && matchRate < UNUSUAL_WEEK_RATE;
  // 시험 주간처럼 나이스가 평소와 크게 다르면 평소에는 맞출 과목도 못 맞춰 고정 칸으로 남는다. 그 주에는 저장하지 않는다.
  // 그런 주에는 나이스에서 사라진 과목과 원래 다른 이름으로 적는 수업을 가릴 수 없으므로 못 맞춘 수업이 하나라도 있으면 막는다
  const doubtful = fileResult?.unresolved.filter((u) => u.inNeis) ?? [];
  const unusualBlocked = unusualWeek && (fileResult?.unresolved.length ?? 0) > 0;
  const unresolvedSubjects = [...new Set(fileResult?.unresolved.map((u) => u.subject) ?? [])];
  const fileTimes = upload?.file.classTimes ?? [];
  const timesDiffer = fileTimes.length > 0 && formatClassTimes(fileTimes) !== formatClassTimes(savedTimes ?? []);
  const unresolvedByName = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const u of fileResult?.unresolved ?? []) byName.set(u.name, [...(byName.get(u.name) ?? []), `${u.subject} ${u.grade}-${u.classNum}`]);
    return byName;
  }, [fileResult]);
  const tooManyLessons = (fileResult?.lessons.length ?? 0) > MAX_BASE_LESSONS;
  const blocked = saving || wrongSchool || unusualBlocked || tooManyLessons || fileToSave.length === 0;

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
      console.warn('[BaseTimetable] file read failed:', err);
      setUpload(null);
      setUploadError('파일을 읽지 못했습니다');
    }
  }

  async function handleSave() {
    if (!me || !fileResult || !upload || blocked) return;
    setSaving(true);
    const withTimes = useFileTimes && timesDiffer;
    try {
      // 표와 함께 학교 기초 시간표를 저장한다. 직접 고친 선생님은 표를 그대로 두므로 기초 시간표로 대조하지 않는다
      await saveAssignmentRows(
        school,
        fileToSave.map(({ name, items, slots }) => ({ name, items, slots })),
        me.id,
        'file',
        { lessons: fileResult.lessons, fileName: upload.fileName },
      );
    } catch (err: any) {
      console.warn('[BaseTimetable] save failed:', err);
      showToast(err?.code === 'permission-denied' ? '서버 규칙이 아직 적용되지 않아 저장하지 못했습니다' : '기초 시간표를 저장하지 못했습니다', 'error');
      setSaving(false);
      return;
    }
    let timesSaved = withTimes;
    if (withTimes) {
      try {
        await saveClassTimes(school, fileTimes, me.id);
      } catch (err) {
        console.warn('[BaseTimetable] class times save failed:', err);
        timesSaved = false;
      }
    }
    const label = SCHOOL_LABELS[school];
    if (withTimes && !timesSaved) showToast(`${label} 기초 시간표를 저장했지만 시정표는 저장하지 못했습니다`, 'error');
    else showToast(`${label} 기초 시간표를 저장했습니다. 선생님 ${fileToSave.length}명${timesSaved ? ', 시정표도 바꿨습니다' : ''}`, 'success');
    setUpload(null);
    setReplaceSelf(false);
    setSaving(false);
  }

  return (
    <div style={styles.wrap}>
      <section style={styles.card} aria-label={`${SCHOOL_LABELS[school]} 지금 기초 시간표`}>
        <h4 style={styles.h4}>지금 기초 시간표</h4>
        {basesDenied ? (
          <p style={styles.warn}>기초 시간표를 읽지 못했습니다. 서버 규칙이 적용되었는지 확인해 주세요.</p>
        ) : base === undefined ? (
          <p style={styles.note}>확인하는 중입니다</p>
        ) : base === null ? (
          <p style={styles.note}>아직 올리지 않았습니다. 아래에서 컴시간 파일을 올려 주세요.</p>
        ) : (
          <>
            <p style={styles.note}>
              선생님 {baseNames.size}명 · 수업 {base.lessons.length}칸
              {base.updatedAt ? ` · ${format(base.updatedAt, 'M/d HH:mm')} 올림` : ''}
              {base.fileName ? ` · ${base.fileName}` : ''}
            </p>
            {onBase < baseNames.size && (
              <p style={styles.note}>
                이 표로 대조하는 선생님 {onBase}명. 나머지는 직접 고친 값이나 관리자 표를 씁니다.
              </p>
            )}
            {neisError && <p style={styles.warn}>{neisError}. 나이스 대조 결과를 보여 줄 수 없습니다.</p>}
            {baseWeek && (
              <p style={styles.note} aria-label="기초 시간표 대조">
                <b style={styles.strong}>{week} 나이스 대조</b> 같은 칸 {baseWeek.stats.same}
                {baseWeek.stats.fixed > 0 ? ` · 요일·교시대로 둔 수업 ${baseWeek.stats.fixed}` : ''}
                {' '}· 나이스에 칸이 없어 기초대로 {baseWeek.stats.kept} · 바뀌거나 빠진 칸 {baseWeek.stats.dropped}
                {' '}· 옮겨 온 수업 {baseWeek.stats.moved}
                {baseWeek.stats.ambiguous > 0 ? ` · 누구 수업인지 모르는 칸 ${baseWeek.stats.ambiguous}` : ''}
                {offDaysText ? ` · 쉬는 날 ${offDaysText}` : ''}
              </p>
            )}
          </>
        )}
      </section>

      <section
        style={{ ...styles.card, ...(dragging ? styles.cardDrop : {}) }}
        aria-label={`${SCHOOL_LABELS[school]} 컴시간 파일 올리기`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <h4 style={styles.h4}>컴시간 파일 올리기</h4>
        <p style={styles.note}>
          {SCHOOL_LABELS[school]} 컴시간 프로그램에서 저장한 주간시간표, 교사시간표, 전체시간표 중 하나(CSV)를 올립니다.
          올리면 이 학교 기초 시간표를 바꾸고 선생님들을 이름으로 한 번에 연결합니다.
          앱이 {NEIS_SYNC_LABEL} 나이스 시간표를 받아 기초 시간표와 칸마다 대조하고, 바뀐 수업만 그 주에 반영합니다.
        </p>
        {linksDenied && <p style={styles.warn}>담당 학급 표를 읽지 못했습니다. 서버 규칙 적용 여부를 확인해 주세요.</p>}
        <div style={styles.actions}>
          <button type="button" onClick={() => fileInput.current?.click()} style={styles.btn}>파일 고르기</button>
          <span style={styles.tag}>{upload ? upload.fileName : '여기에 끌어다 놓아도 됩니다'}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            aria-label={`${SCHOOL_LABELS[school]} 컴시간 시간표 파일`}
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
              {' '}{week} 나이스와 같은 칸 {fileResult.sameCells}칸({Math.round(matchRate * 100)}%)
            </p>
            {wrongSchool && (
              <p style={styles.warn}>{week} {SCHOOL_LABELS[school]} 나이스 시간표와 거의 맞지 않습니다. 이 학교 파일인지 확인해 주세요.</p>
            )}
            {unusualBlocked && (
              <p style={styles.warn}>
                {week} 나이스 시간표가 평소와 많이 달라 시험이나 행사 주간일 수 있습니다. 이런 주에는 과목 이름을 바르게 맞추지 못할 수 있으니
                평소 수업을 하는 주에 다시 올려 주세요.
              </p>
            )}
            {unusualWeek && !unusualBlocked && (
              <p style={styles.note}>{week} 나이스 시간표가 평소와 꽤 다르지만 과목 이름은 모두 맞췄습니다.</p>
            )}
            {!unusualBlocked && unresolvedSubjects.length > 0 && (
              <p style={styles.note}>
                나이스에서 이름을 찾지 못한 수업({unresolvedSubjects.join(', ')})은 요일과 교시대로 둡니다.
                {doubtful.length === 0 ? ' 스포츠클럽처럼 나이스가 동아리활동 같은 다른 이름으로 적는 수업으로 보입니다.' : ''}
              </p>
            )}
            {tooManyLessons && (
              <p style={styles.warn}>수업이 {MAX_BASE_LESSONS}칸보다 많아 저장할 수 없습니다. 한 학교 파일인지 확인해 주세요.</p>
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
              <button type="button" onClick={handleSave} disabled={blocked} style={styles.primary}>
                {saving ? '저장 중...' : `${SCHOOL_LABELS[school]} 기초 시간표로 저장 (${fileToSave.length}명)`}
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
                    <span style={styles.tag}>요일·교시대로: {unresolvedByName.get(row.name)?.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 8,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
  },
  cardDrop: { borderColor: 'var(--accent)', background: 'var(--bg-secondary)' },
  strong: { color: 'var(--text-primary)', fontWeight: 600 },
  h4: { margin: 0, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--text-primary)' },
  note: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--text-secondary)', wordBreak: 'keep-all' },
  warn: { margin: 0, fontSize: 'var(--fs-caption)', color: 'var(--warning)', wordBreak: 'keep-all' },
  actions: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
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
};

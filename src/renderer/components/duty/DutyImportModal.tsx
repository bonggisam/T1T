import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type { DutyEntry, DutyTable, School } from '@shared/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useDisableClickThrough } from '../../hooks/useDisableClickThrough';
import { useAuthStore } from '../../store/authStore';
import { labelNamesOf, LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import { useComciganStore } from '../../store/comciganStore';
import { useDutyStore } from '../../store/dutyStore';
import { useUsersStore } from '../../store/usersStore';
import { countByTeacher, groupByDate } from '../../utils/dutyEntries';
import {
  collectPeriods, formatDutyDate, minutesText, parseDutyTable, parseMinutes, rangeOfPeriods,
  type DutyDraft,
} from '../../utils/dutyTableParser';
import { DUTY_FILE_ACCEPT, DutyFileError, isSlowFile, readDutyFile, tableHtmlToText } from '../../utils/dutyFileReader';
import { snapKnownNames } from '../../utils/tableFromBoxes';
import { periodStartsOf } from '../../utils/pasteEventParser';
import { classDurationMin } from '../../utils/classPeriods';
import { Ic } from '../common/Ic';
import { showToast } from '../common/Toast';

const KIND_CHOICES = ['시험 감독', '당직', '일직', '야간 자습 감독'];
const MAX_ENTRIES = 2000;

type PeriodTimes = Record<number, { start: number | null; end: number | null }>;

interface DutyImportModalProps {
  /** 있으면 그 표를 고친다 */
  table?: DutyTable | null;
  onClose: () => void;
}

function periodTimesFrom(rows: DutyDraft[], classTimes: string[]): PeriodTimes {
  const starts = periodStartsOf(classTimes);
  const duration = classDurationMin(classTimes);
  const out: PeriodTimes = {};
  for (const period of collectPeriods(rows)) {
    const start = starts.get(period) ?? null;
    out[period] = { start, end: start !== null ? start + duration : null };
  }
  // 줄에 이미 시각이 있으면 그 값을 쓴다 (저장된 표). 여러 교시 줄은 첫 교시 시작과 마지막 교시 끝만 알 수 있다.
  for (const row of rows) {
    if (row.periods.length === 0) continue;
    const first = Math.min(...row.periods);
    const last = Math.max(...row.periods);
    if (row.startMin !== null) out[first] = { ...out[first], start: row.startMin };
    if (row.endMin !== null) out[last] = { ...out[last], end: row.endMin };
  }
  return out;
}

function toDrafts(table: DutyTable): DutyDraft[] {
  return table.entries.map((e) => ({ ...e, source: '' }));
}

/**
 * 시험감독 표 올리기. 담당자가 파일을 올리거나 표를 붙여 넣어 읽은 값을 고치고 저장하면 각 선생님 달력에 차례가 나타난다.
 * 파일은 이 PC 안에서 읽고, 원문과 파일은 저장하지 않으며 이름, 날짜, 시각, 종류, 장소만 남긴다.
 */
export function DutyImportModal({ table = null, onClose }: DutyImportModalProps) {
  const user = useAuthStore((s) => s.user);
  const saveTable = useDutyStore((s) => s.saveTable);
  const links = useComciganLinksStore((s) => s.links);
  const users = useUsersStore((s) => s.users);
  const ownClassTimes = useComciganStore((s) => s.timetableData?.classTimes);
  const grids = useComciganLinksStore((s) => s.grids);

  const ownSchool: School | 'all' = user?.school === 'taeseong_middle' || user?.school === 'taeseong_high' ? user.school : 'all';
  const [title, setTitle] = useState(table?.title ?? '');
  const [school, setSchool] = useState<School | 'all'>(table?.school ?? ownSchool);
  const [kind, setKind] = useState(KIND_CHOICES[0]);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<DutyDraft[]>(() => (table ? toDrafts(table) : []));
  const [skipped, setSkipped] = useState<string[]>([]);
  const [unreadable, setUnreadable] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [fileProblems, setFileProblems] = useState<string[]>([]);
  const [readFromPhoto, setReadFromPhoto] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // 아래 내용을 손으로 고쳤는가. 다시 읽거나 닫으면 사라지므로 먼저 묻는다.
  const edited = useRef(false);
  // 아래 내용이 아직 저장된 표 그대로인가. 고치는 표를 새 글로 바꿀 때도 묻는다.
  const showingSaved = useRef(!!table);
  // 창 안에서 시작한 끌기가 창 밖에서 끝나도 바깥 칸을 누른 것으로 온다
  const pressedInside = useRef(false);

  useEscapeKey(requestClose);
  useDisableClickThrough();

  // 시정표는 표의 학교 것을 먼저 쓴다. 시험 교시는 다를 수 있어 아래에서 고칠 수 있다.
  const classTimes = useMemo(() => {
    const schoolGrid = school !== 'all' ? grids[school] : undefined;
    if (schoolGrid?.classTimes?.length) return schoolGrid.classTimes;
    if (ownClassTimes?.length) return ownClassTimes;
    return Object.values(grids).find((g) => g?.classTimes?.length)?.classTimes ?? [];
  }, [school, grids, ownClassTimes]);
  const [periodTimes, setPeriodTimes] = useState<PeriodTimes>(() => (table ? periodTimesFrom(toDrafts(table), []) : {}));

  // 시정표를 아직 받지 못했으면 받아 온다. 받으면 시각이 빈 줄과 시정표로 채운 줄만 새로 채운다.
  // 표에 적힌 시각과 담당자가 고친 시각, 이름, 지운 줄은 그대로 둔다.
  useEffect(() => {
    useComciganLinksStore.getState().loadGrids();
  }, []);
  const classKey = classTimes.join('|');
  const firstClassKey = useRef(true);
  useEffect(() => {
    if (firstClassKey.current) {
      firstClassKey.current = false;
      return;
    }
    if (table) return;
    const filled = rows.map((r) => {
      if (!r.autoTime && (r.startMin !== null || r.endMin !== null)) return r;
      const range = rangeOfPeriods(r.periods, classTimes);
      return range.startMin === null ? r : { ...r, ...range, autoTime: true };
    });
    setPeriodTimes(periodTimesFrom(filled, classTimes));
    setRows(filled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey]);

  const labelNames = useMemo(() => labelNamesOf(links, school), [links, school]);
  const knownNames = useMemo(() => {
    const names = new Set<string>();
    users.forEach((u) => { if (u.name) names.add(u.name); });
    for (const key of LINK_SCHOOLS) links[key]?.entries.forEach((e) => names.add(e.name));
    return names;
  }, [users, links]);

  function hasUnsavedInput(): boolean {
    if (edited.current || text.trim()) return true;
    if (table) return !showingSaved.current || title !== table.title || school !== table.school || kind !== KIND_CHOICES[0];
    return !!title.trim();
  }

  function requestClose() {
    if (saving) return;
    if (hasUnsavedInput() && !window.confirm('저장하지 않고 닫을까요?\n입력하거나 고친 내용이 사라집니다.')) return;
    onClose();
  }

  /** 글을 표로 읽어 아래 내용을 바꾼다. 아래 내용을 그대로 두었으면 false */
  function handleText(value: string): boolean {
    const result = parseDutyTable(value, kind, { classTimes, labelNames, knownNames: [...knownNames] });
    const readNothing = result.rows.length === 0;
    // 고치는 표는 글이 표로 읽히지 않으면 아래 내용을 그대로 둔다. 한 글자 쳤다고 표가 사라지면 안 된다.
    if (table && readNothing) {
      setText(value);
      setSkipped(result.skipped);
      setUnreadable(!!value.trim());
      return false;
    }
    if ((edited.current || showingSaved.current) && !window.confirm('표를 다시 읽을까요?\n아래 내용이 새로 읽은 내용으로 바뀌고, 아래에서 고친 내용은 사라집니다.')) return false;
    edited.current = false;
    showingSaved.current = false;
    setText(value);
    setRows(result.rows);
    setSkipped(result.skipped);
    setPeriodTimes(periodTimesFrom(result.rows, classTimes));
    setUnreadable(readNothing && !!value.trim());
    setOpenDate(null);
    return true;
  }

  /** 파일을 읽어 표 칸에 넣는다. 여러 장이면 이어 붙인다 */
  async function importFiles(files: File[]) {
    if (files.length === 0 || reading) return;
    const problems: string[] = [];
    const parts: string[] = [];
    let photo = false;
    setFileProblems([]);
    for (const file of files) {
      setReading(isSlowFile(file)
        ? `${file.name}을(를) 읽는 중입니다. 사진은 처음에 조금 오래 걸립니다.`
        : `${file.name}을(를) 읽는 중입니다.`);
      try {
        const result = await readDutyFile(file);
        if (!result.text.trim()) {
          problems.push(`${file.name}: 표를 찾지 못했습니다.`);
          continue;
        }
        parts.push(result.fromOcr ? snapKnownNames(result.text, [...knownNames, ...Object.values(labelNames)]) : result.text);
        photo = photo || result.fromOcr;
      } catch (err) {
        console.error('[Duty] file read failed:', err);
        problems.push(`${file.name}: ${err instanceof DutyFileError ? err.message : '파일을 읽지 못했습니다.'}`);
      }
    }
    // 읽는 동안 창을 닫았으면 더 하지 않는다
    if (!fileInput.current) return;
    setReading(null);
    setFileProblems(problems);
    if (parts.length === 0 || !handleText(parts.join('\n\n'))) return;
    setReadFromPhoto(photo);
    if (!title.trim()) setTitle(files[0].name.replace(/\.[^.]+$/, '').slice(0, 60));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const images = [...e.clipboardData.files].filter((file) => file.type.startsWith('image/'));
    // 표를 복사하면 그림과 글이 함께 올 수 있다. 글이 있으면 글을 쓴다 (글이 더 정확하다)
    const html = e.clipboardData.getData('text/html');
    const table = html ? tableHtmlToText(html) : null;
    if (table) {
      e.preventDefault();
      if (handleText(table)) setReadFromPhoto(false);
      return;
    }
    if (images.length > 0 && !e.clipboardData.getData('text/plain').trim()) {
      e.preventDefault();
      void importFiles(images.map((file, i) => (file.name ? file : new File([file], `붙여넣은 그림 ${i + 1}.png`, { type: file.type }))));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    void importFiles([...e.dataTransfer.files]);
  }

  function handleKind(value: string) {
    setKind(value);
    // 표에서 종류를 읽지 못해 기본값이 들어간 줄만 따라 바꾼다
    setRows((current) => current.map((r) => (r.kind === kind ? { ...r, kind: value } : r)));
  }

  function updateRow(id: string, updates: Partial<DutyDraft>) {
    edited.current = true;
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }

  function removeRow(id: string) {
    const next = rows.filter((r) => r.id !== id);
    edited.current = true;
    setRows(next);
    // 칸에 보이던 시각의 줄이 없어질 수 있다. 저장된 표는 처음처럼 줄의 시각만 보여 준다.
    setPeriodTimes(periodTimesFrom(next, table ? [] : classTimes));
  }

  function addRow(date: string) {
    edited.current = true;
    setRows((current) => [...current, {
      id: `m${Date.now().toString(36)}${current.length}`,
      date,
      periods: [],
      startMin: null,
      endMin: null,
      name: '',
      kind,
      place: '',
      source: '',
    }]);
    setOpenDate(date);
  }

  function renameAll(from: string, to: string) {
    edited.current = true;
    setRows((current) => current.map((r) => (r.name === from ? { ...r, name: to } : r)));
  }

  function changePeriodTime(period: number, edge: 'start' | 'end', value: string) {
    const minutes = parseMinutes(value);
    const previous = periodTimes[period]?.[edge] ?? null;
    edited.current = true;
    setPeriodTimes({ ...periodTimes, [period]: { ...periodTimes[period], [edge]: minutes } });
    // 날짜마다 시각이 다를 수 있다. 칸에 보이던 시각과 같거나 시각이 없는 줄만 바꾼다.
    setRows((current) => current.map((row) => {
      if (row.periods.length === 0) return row;
      if (edge === 'start') {
        if (Math.min(...row.periods) !== period || (row.startMin !== previous && row.startMin !== null)) return row;
        return { ...row, startMin: minutes, autoTime: false };
      }
      if (Math.max(...row.periods) !== period || (row.endMin !== previous && row.endMin !== null)) return row;
      return { ...row, endMin: minutes, autoTime: false };
    }));
  }

  const dayGroups = useMemo(() => groupByDate(rows), [rows]);
  const periods = useMemo(() => collectPeriods(rows), [rows]);
  // 칸에는 교시마다 시각을 하나만 보여 주므로 날짜마다 다른 교시는 따로 알린다
  const mixedPeriods = useMemo(() => periods.filter((period) => {
    const timed = rows.filter((r) => r.periods.length > 0);
    const starts = timed.filter((r) => Math.min(...r.periods) === period && r.startMin !== null).map((r) => r.startMin);
    const ends = timed.filter((r) => Math.max(...r.periods) === period && r.endMin !== null).map((r) => r.endMin);
    return new Set(starts).size > 1 || new Set(ends).size > 1;
  }), [rows, periods]);
  const counts = useMemo(() => countByTeacher(rows.filter((r) => r.name)), [rows]);
  // 아는 이름이 없으면(연결표 전) 확인할 기준이 없으므로 표시하지 않는다
  const unknownNames = knownNames.size > 0 ? counts.filter((c) => !knownNames.has(c.name)) : [];
  const incomplete = rows.filter((r) => !r.name.trim() || !r.date).length;
  const tooMany = rows.length > MAX_ENTRIES;
  const canSave = !!title.trim() && rows.length > 0 && incomplete === 0 && !tooMany && !saving;

  async function handleSave() {
    if (!user || !canSave) return;
    setSaving(true);
    try {
      const entries: DutyEntry[] = rows.map((r, i) => ({
        id: r.id || `r${i}`,
        date: r.date,
        startMin: r.startMin,
        endMin: r.endMin,
        periods: r.periods,
        name: r.name.trim().slice(0, 20),
        kind: r.kind.trim().slice(0, 30),
        place: r.place.trim().slice(0, 30),
      }));
      await saveTable({ title: title.trim().slice(0, 60), school, entries }, { id: user.id, name: user.name }, table);
      showToast(table ? '표를 고쳤습니다' : '표를 저장했습니다. 각 선생님 달력에 차례가 나타납니다', 'success');
      onClose();
    } catch (err: any) {
      console.error('[Duty] save failed:', err);
      showToast(
        err?.code === 'permission-denied' ? '서버 규칙이 아직 적용되지 않아 저장하지 못했습니다' : '표를 저장하지 못했습니다',
        'error',
      );
      setSaving(false);
    }
  }

  return (
    <div
      style={styles.overlay}
      onMouseDown={(e) => { pressedInside.current = e.target !== e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && !pressedInside.current) requestClose(); }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.relatedTarget === null) setDragging(false); }}
      onDrop={handleDrop}
      role="dialog"
      aria-modal="true"
      aria-label={table ? '시험감독 표 고치기' : '시험감독 표 올리기'}
    >
      <div
        className="glass-solid animate-slide-up"
        style={dragging ? { ...styles.modal, outline: '2px dashed var(--accent)', outlineOffset: -4 } : styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h3 style={styles.title}>{table ? '시험감독 표 고치기' : '시험감독 표 올리기'}</h3>
          <button onClick={requestClose} style={styles.closeBtn} aria-label="닫기"><Ic name="x" gap={false} /></button>
        </div>

        <div style={styles.scroll}>
          <div style={styles.fieldRow}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="표 이름 (예: 2학기 2차 지필평가 감독)"
              aria-label="표 이름"
              maxLength={60}
              style={{ ...styles.input, flex: 2, minWidth: 180 }}
              autoFocus={!table}
            />
            <select value={school} onChange={(e) => setSchool(e.target.value as School | 'all')} style={styles.select} aria-label="학교">
              <option value="taeseong_middle">태성중</option>
              <option value="taeseong_high">태성고</option>
              <option value="all">양교</option>
            </select>
            <input
              type="text"
              list="duty-kinds"
              value={kind}
              onChange={(e) => handleKind(e.target.value)}
              aria-label="기본 종류"
              title="표에 종류가 없는 줄에 쓰는 이름"
              maxLength={30}
              style={{ ...styles.input, flex: 1, minWidth: 90 }}
            />
            <datalist id="duty-kinds">
              {KIND_CHOICES.map((k) => <option key={k} value={k} />)}
            </datalist>
          </div>

          <div style={styles.uploadRow}>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={!!reading} style={styles.uploadBtn}>
              <Upload size={14} />파일 올리기
            </button>
            <span style={styles.note}>엑셀, 한글, 워드, PDF, 사진. 끌어다 놓거나 캡처를 붙여 넣어도 됩니다.</span>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept={DUTY_FILE_ACCEPT}
              aria-label="표 파일 고르기"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void importFiles(files);
              }}
            />
          </div>

          {reading && (
            <p style={styles.readingBox} role="status"><span className="spinner" style={styles.spinner} />{reading}</p>
          )}
          {fileProblems.map((problem) => <p key={problem} style={styles.warnBox}>{problem}</p>)}
          {readFromPhoto && rows.length > 0 && (
            <p style={styles.warnBox}>
              사진에서 읽은 내용은 글자가 틀릴 수 있습니다. 저장하기 전에 아래 이름과 날짜를 꼭 확인해 주세요. 위 칸의 글을 고치면 바로 다시 읽습니다.
            </p>
          )}

          <textarea
            value={text}
            onChange={(e) => handleText(e.target.value)}
            onPaste={handlePaste}
            placeholder={table ? '새 표를 올리거나 붙여 넣으면 아래 내용이 바뀝니다' : '또는 엑셀이나 한글에서 표를 복사해 여기에 붙여 넣으세요'}
            aria-label="읽은 표"
            rows={table ? 2 : 4}
            style={styles.textarea}
          />
          <p style={styles.note}>
            표는 모든 선생님이 볼 수 있습니다. 시험 문제나 평가 자료, 개인 사유는 넣지 마세요. 파일은 이 PC 안에서 읽고, 읽어 낸 값만 저장합니다.
          </p>

          {unreadable && (
            <p style={styles.warnBox}>
              표를 읽지 못했습니다.{rows.length > 0 && ' 아래 내용은 그대로 둡니다.'} 날짜와 이름이 함께 있는 줄이 필요합니다. 예: 11/16(월) 1교시 1-1 김철수
            </p>
          )}

          {rows.length > 0 && (
            <p style={styles.summary}>
              {rows.length}건 · 교사 {counts.length}명
              {dayGroups.length > 0 && ` · ${formatDutyDate(dayGroups[0].date)}~${formatDutyDate(dayGroups[dayGroups.length - 1].date)}`}
              {skipped.length > 0 && ` · 읽지 못한 줄 ${skipped.length}개`}
            </p>
          )}
          {tooMany && <p style={styles.warnBox}>한 표에 {MAX_ENTRIES}건까지 저장할 수 있습니다. 표를 나누어 주세요.</p>}

          {skipped.length > 0 && (
            <details style={styles.details}>
              <summary style={styles.summaryLine}>읽지 못한 줄 {skipped.length}개</summary>
              {skipped.slice(0, 30).map((line, i) => <p key={i} style={styles.skipped}>{line}</p>)}
            </details>
          )}

          {unknownNames.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>확인할 이름 {unknownNames.length}명</h4>
              <p style={styles.note}>연결표에 없는 이름입니다. 틀렸으면 고치면 그 이름의 모든 줄이 바뀝니다.</p>
              <datalist id="duty-names">
                {[...knownNames].map((n) => <option key={n} value={n} />)}
              </datalist>
              <div style={styles.nameGrid}>
                {unknownNames.map(({ name, count }) => (
                  <label key={name} style={styles.nameRow}>
                    <input
                      type="text"
                      list="duty-names"
                      defaultValue={name}
                      onChange={() => { edited.current = true; }}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== name) renameAll(name, e.target.value.trim()); }}
                      aria-label={`${name} 이름 고치기`}
                      style={{ ...styles.input, width: 90 }}
                    />
                    <small style={styles.count}>{count}건</small>
                  </label>
                ))}
              </div>
            </div>
          )}

          {periods.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>교시 시각</h4>
              <p style={styles.note}>달력 표시와 미리 알림에 씁니다. 시험 교시가 수업 시정표와 다르면 고쳐 주세요.</p>
              {mixedPeriods.length > 0 && (
                <p style={styles.note}>
                  {mixedPeriods.map((p) => `${p}교시`).join(', ')}는 날짜마다 시각이 다릅니다. 칸을 고치면 보이는 시각과 같은 줄만 바뀝니다.
                </p>
              )}
              <div style={styles.nameGrid}>
                {periods.map((period) => (
                  <div key={period} style={styles.periodRow}>
                    <b style={styles.periodLabel}>{period}교시</b>
                    <input
                      type="time"
                      value={minutesText(periodTimes[period]?.start ?? null)}
                      onChange={(e) => changePeriodTime(period, 'start', e.target.value)}
                      aria-label={`${period}교시 시작`}
                      style={styles.timeInput}
                    />
                    <span style={styles.count}>~</span>
                    <input
                      type="time"
                      value={minutesText(periodTimes[period]?.end ?? null)}
                      onChange={(e) => changePeriodTime(period, 'end', e.target.value)}
                      aria-label={`${period}교시 끝`}
                      style={styles.timeInput}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {dayGroups.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>날짜별 내용</h4>
              {dayGroups.map(({ date, items }) => {
                const open = openDate === date;
                return (
                  <div key={date} style={styles.dayGroup}>
                    <button
                      type="button"
                      style={styles.dayHead}
                      aria-expanded={open}
                      onClick={() => setOpenDate(open ? null : date)}
                    >
                      <b>{formatDutyDate(date)}</b> {items.length}건
                      {items.some((r) => !r.name.trim()) && <span style={styles.warnText}> · 이름 없는 줄</span>}
                    </button>
                    {/* 표가 크면 칸이 수천 개가 되므로 연 날짜만 입력칸을 만든다 */}
                    {open && (
                      <div style={styles.dayRows}>
                        {items.map((row) => (
                          <div key={row.id} style={styles.row}>
                            <span style={styles.rowWhen}>
                              {row.periods.length > 0 ? `${row.periods.join(',')}교시` : minutesText(row.startMin) || '종일'}
                            </span>
                            <input value={row.place} onChange={(e) => updateRow(row.id, { place: e.target.value })} placeholder="장소" aria-label="장소" maxLength={30} style={styles.cell} />
                            <input value={row.kind} onChange={(e) => updateRow(row.id, { kind: e.target.value })} placeholder="종류" aria-label="종류" maxLength={30} style={styles.cell} />
                            <input value={row.name} onChange={(e) => updateRow(row.id, { name: e.target.value })} placeholder="이름" aria-label="이름" list="duty-names" maxLength={20} style={styles.cell} />
                            <button type="button" onClick={() => removeRow(row.id)} style={styles.removeBtn} aria-label="이 줄 지우기"><Ic name="x" gap={false} /></button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addRow(date)} style={styles.addRow}>+ 줄 추가</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {counts.length > 0 && (
            <details style={styles.details}>
              <summary style={styles.summaryLine}>교사별 횟수 (담당자 확인용)</summary>
              <div style={styles.countGrid}>
                {counts.map((c) => <span key={c.name} style={styles.countItem}>{c.name} {c.count}</span>)}
              </div>
            </details>
          )}
        </div>

        <div style={styles.actions}>
          {incomplete > 0 && <span style={styles.warnText}>이름이 빈 줄 {incomplete}개</span>}
          <button type="button" onClick={requestClose} style={styles.cancelBtn}>취소</button>
          <button type="button" onClick={handleSave} disabled={!canSave} style={{ ...styles.submitBtn, opacity: canSave ? 1 : 0.5 }}>
            {saving ? '저장 중...' : table ? '고친 내용 저장' : `${rows.length}건 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--scrim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 12,
  },
  modal: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 14,
    minHeight: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--fs-subtitle)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--fs-lead)',
    color: 'var(--text-muted)',
    padding: '2px 6px',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  fieldRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    flexShrink: 0,
  },
  input: {
    padding: '5px 8px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    minWidth: 0,
  },
  select: {
    padding: '5px 6px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  uploadRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  uploadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    border: 'none',
    borderRadius: 7,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },
  readingBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    background: 'var(--accent-soft)',
    fontSize: 'var(--fs-body)',
    color: 'var(--text-primary)',
    flexShrink: 0,
  },
  spinner: {
    width: 14,
    height: 14,
    flexShrink: 0,
  },
  textarea: {
    width: '100%',
    flexShrink: 0,
    padding: '8px 10px',
    fontSize: 'var(--fs-body)',
    lineHeight: 1.45,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  note: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  warnBox: {
    padding: '6px 8px',
    borderRadius: 6,
    background: 'var(--warning-soft)',
    fontSize: 'var(--fs-body)',
    lineHeight: 1.4,
    color: 'var(--text-primary)',
    flexShrink: 0,
  },
  summary: {
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    flexShrink: 0,
  },
  details: {
    flexShrink: 0,
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  summaryLine: {
    cursor: 'pointer',
    fontWeight: 600,
  },
  skipped: {
    padding: '2px 0 2px 12px',
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  nameGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  nameRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
  },
  count: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  periodRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 4px',
  },
  periodLabel: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-primary)',
  },
  timeInput: {
    padding: '2px 4px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 5,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    colorScheme: 'light dark',
  },
  dayGroup: {
    border: '1px solid var(--border-subtle)',
    borderRadius: 7,
    overflow: 'hidden',
  },
  dayHead: {
    width: '100%',
    padding: '4px 8px',
    border: 'none',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  dayRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 4,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '52px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 22px',
    alignItems: 'center',
    gap: 3,
  },
  rowWhen: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cell: {
    minWidth: 0,
    padding: '2px 5px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 5,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  removeBtn: {
    border: 'none',
    background: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 'var(--fs-label)',
    padding: 0,
  },
  addRow: {
    alignSelf: 'flex-start',
    padding: '2px 4px',
    border: 'none',
    background: 'none',
    color: 'var(--accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  countGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px 10px',
    padding: '4px 0 0 12px',
  },
  countItem: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  warnText: {
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--warning)',
    marginRight: 'auto',
  },
  cancelBtn: {
    padding: '6px 16px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '6px 16px',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
};

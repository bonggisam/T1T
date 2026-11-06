import React, { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw } from 'lucide-react';
import type { School } from '@shared/types';
import { SCHOOL_LABELS } from '@shared/types';
import { useWindowSize, WIDE_MIN } from '../../hooks/useWindowSize';
import { ComciganCallButton } from '../common/ComciganCall';
import { showToast } from '../common/Toast';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { gridTargets, LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import { useComciganStore } from '../../store/comciganStore';
import {
  buildFinderRows, buildPeople, cellKey, computeFinderWeek, FINDER_CONDITIONS, matchesFilter, subjectOptions, suggestSlots,
  type FinderCell, type FinderPerson, type FinderRow,
} from '../../utils/meetingFinder';

/*
 * 회의 시간 찾기 화면. 입력은 컴시간 시간표와 공유 일정뿐이다.
 * 이 화면은 개인 일정 저장소를 가져오지 않는다 (scripts/check-personal-isolation.cjs 가 검사한다).
 */

const GROUPS_KEY = 't1t-meeting-groups';
const NAMES_IN_DESCRIPTION = 30;
const SCHOOL_SHORT: Record<School, string> = { taeseong_middle: '중', taeseong_high: '고' };
const WEEKDAYS = ['월', '화', '수', '목', '금'];

interface SavedGroup {
  name: string;
  keys: string[];
}

function readGroups(): SavedGroup[] {
  try {
    const list = JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((g) => g && typeof g.name === 'string' && Array.isArray(g.keys)) : [];
  } catch {
    return [];
  }
}

function writeGroups(groups: SavedGroup[]): void {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch (e) {
    console.warn('[Meeting] localStorage write failed:', e);
  }
}

function cellText(cell: FinderCell): string {
  if (cell.state === 'free') return '가능';
  if (cell.state === 'busy') return `${cell.busy}명`;
  if (cell.state === 'conflict') return '일정';
  return '';
}

function cellStyle(cell: FinderCell): React.CSSProperties {
  switch (cell.state) {
    case 'free':
      return styles.cellFree;
    case 'conflict':
      return styles.cellConflict;
    case 'busy': {
      // 많은 사람이 수업 중일수록 진하게
      const ratio = cell.total ? cell.busy / cell.total : 0;
      return { ...styles.cellBusy, background: `color-mix(in srgb, var(--warning) ${Math.round(10 + ratio * 30)}%, transparent)` };
    }
    default:
      return styles.cellOff;
  }
}

function describeCell(cell: FinderCell): string {
  if (cell.state === 'off') return '쉬는 날입니다.';
  if (cell.state === 'past') return '이미 지난 시간입니다.';
  if (cell.busy > 0) return `${cell.total}명 중 ${cell.busy}명이 수업 중입니다.`;
  if (cell.state === 'conflict') return `대상 ${cell.total}명 모두 수업이 없지만 공유 일정과 겹칩니다.`;
  return `대상 ${cell.total}명 모두 수업이 없습니다.`;
}

/** 회의 시간 찾기: 회원과 요일을 고르면 공강을 추천한다. 모든 칸은 주간 격자로도 볼 수 있다 */
export function MeetingFinderView({ onBack }: { onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  // 공유 일정만 쓴다.
  const events = useCalendarStore((s) => s.events);
  const openEventDraft = useCalendarStore((s) => s.openEventDraft);
  const links = useComciganLinksStore((s) => s.links);
  const linksLoaded = useComciganLinksStore((s) => s.linksLoaded);
  const linksDenied = useComciganLinksStore((s) => s.linksDenied);
  const grids = useComciganLinksStore((s) => s.grids);
  const gridLoading = useComciganLinksStore((s) => s.gridLoading);
  const gridError = useComciganLinksStore((s) => s.gridError);
  const loadGrids = useComciganLinksStore((s) => s.loadGrids);
  const ownConfig = useComciganStore((s) => s.config);
  const { width } = useWindowSize();
  const wide = width >= WIDE_MIN;

  const ownSchool: School | null = user?.school === 'taeseong_middle' || user?.school === 'taeseong_high' ? user.school : null;
  const [now, setNow] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(() => (new Date().getDay() % 6 === 0 ? 1 : 0));
  const [pickedSchool, setPickedSchool] = useState<School | null>(ownSchool);
  const [grade, setGrade] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedCell, setPickedCell] = useState<string | null>(null);
  const [weekdays, setWeekdays] = useState<Set<number>>(() => new Set([1, 2, 3, 4, 5]));
  const [showGrid, setShowGrid] = useState(false);
  const [showPeople, setShowPeople] = useState(true);
  const [groups, setGroups] = useState<SavedGroup[]>(readGroups);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // 연결표를 읽은 뒤에 어떤 학교를 받을지 정한다
  useEffect(() => {
    if (linksLoaded) loadGrids();
  }, [linksLoaded, links, ownConfig, loadGrids]);

  const people = useMemo(() => buildPeople(grids, links), [grids, links]);
  const availableSchools = LINK_SCHOOLS.filter((s) => grids[s]);
  // 고른 학교의 시간표를 받지 못했으면 받은 학교를 모두 보여 준다. 목록이 빈 채 멈추지 않게 한다.
  const school = pickedSchool && grids[pickedSchool] ? pickedSchool : null;
  // 가입해 시간표가 연결된 회원만 고른다. 그 학교 연결표가 아직 없으면 컴시간 표기로 고를 수 있게 둔다.
  const hasMembers = useMemo(() => people.some((p) => p.userId && matchesFilter(p, { school })), [people, school]);
  const filtered = useMemo(
    () => people.filter((p) => (!hasMembers || p.userId) && matchesFilter(p, { school, grade, subject, query })),
    [people, hasMembers, school, grade, subject, query],
  );
  const chosen = useMemo(() => people.filter((p) => selected.has(p.key)), [people, selected]);
  // 시정표를 받지 못한 학교의 수업은 시각을 몰라 계산에 넣을 수 없다. 모르면 공강으로 잘못 나온다
  const unknownTimes = useMemo(() => chosen
    .filter((p) => p.labels.some(({ school }) => !grids[school]?.classTimes?.length))
    .map((p) => p.name), [chosen, grids]);
  const subjects = useMemo(() => subjectOptions(people, school), [people, school]);

  // 처음에는 나를 대상에 넣어 둔다
  const myKey = user ? `u:${user.id}` : null;
  const [seededMe, setSeededMe] = useState(false);
  useEffect(() => {
    if (seededMe || !myKey || !people.some((p) => p.key === myKey)) return;
    setSelected((current) => new Set(current).add(myKey));
    setSeededMe(true);
  }, [people, myKey, seededMe]);

  const targetSchools = useMemo(() => {
    const set = new Set<School>();
    chosen.forEach((p) => p.labels.forEach((l) => set.add(l.school)));
    return set;
  }, [chosen]);

  // 격자의 시각은 대상이 한 학교면 그 학교, 섞이면 내 학교 시정표를 따른다
  const baseSchool: School | null = targetSchools.size === 1
    ? [...targetSchools][0]
    : ownSchool && grids[ownSchool] ? ownSchool : availableSchools[0] ?? null;
  const baseGrid = baseSchool ? grids[baseSchool] : undefined;
  const rows = useMemo<FinderRow[] | null>(() => (baseGrid ? buildFinderRows(baseGrid) : null), [baseGrid]);
  const monday = useMemo(() => startOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 1 }), [now, weekOffset]);

  const week = useMemo(() => {
    if (!rows || chosen.length === 0) return null;
    return computeFinderWeek({ monday, rows, people: chosen, grids, events, now });
  }, [monday, rows, chosen, grids, events, now]);

  const suggestions = useMemo(
    () => (week && rows ? suggestSlots(week, rows, weekdays) : []),
    [week, rows, weekdays],
  );

  const picked = week && pickedCell ? week.cells[pickedCell] ?? null : null;
  const pickedRow = picked && rows ? rows.find((r) => r.key === picked.rowKey) ?? null : null;
  const pickedDay = picked && week ? week.days.find((d) => d.dateStr === picked.date) ?? null : null;

  function togglePerson(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPickedCell(null);
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
    setPickedCell(null);
  }

  /** 고를 수 없는 요일이면 그 까닭을 돌려준다 */
  function closedReason(index: number): string | null {
    const day = week?.days[index];
    if (!week || !day || !rows) return null;
    if (day.offReason) return day.offReason;
    return rows.every((r) => week.cells[cellKey(day.dateStr, r.key)]?.state === 'past') ? '지난 날' : null;
  }

  function selectAllFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      filtered.forEach((p) => next.add(p.key));
      return next;
    });
    setPickedCell(null);
  }

  function saveGroup() {
    const name = groupName.trim().slice(0, 20);
    if (!name || selected.size === 0) return;
    const next = [...groups.filter((g) => g.name !== name), { name, keys: [...selected] }];
    setGroups(next);
    writeGroups(next);
    setGroupName('');
  }

  function loadGroup(name: string) {
    const group = groups.find((g) => g.name === name);
    if (!group) return;
    // 그사이 연결표가 바뀌면 없는 사람이 남는다. 화면의 "대상 N명"과 실제 계산 인원이 어긋나지 않게 뺀다
    const known = new Set(people.map((p) => p.key));
    const keys = group.keys.filter((key) => known.has(key));
    if (keys.length < group.keys.length) {
      showToast(`묶음의 ${group.keys.length - keys.length}명을 시간표에서 찾지 못해 뺐습니다`, 'info');
    }
    setSelected(new Set(keys));
    setPickedCell(null);
  }

  function removeGroup(name: string) {
    const next = groups.filter((g) => g.name !== name);
    setGroups(next);
    writeGroups(next);
  }

  function createEvent(cell: FinderCell) {
    const names = chosen.map((p) => p.name);
    const shown = names.slice(0, NAMES_IN_DESCRIPTION).join(', ');
    const rest = names.length - NAMES_IN_DESCRIPTION;
    openEventDraft({
      title: '회의',
      start: cell.start,
      end: cell.end,
      category: 'meeting',
      responseType: 'attendance',
      scope: targetSchools.size === 1 ? [...targetSchools][0] : 'all',
      description: `대상: ${shown}${rest > 0 ? ` 외 ${rest}명` : ''}`,
    });
  }

  const noSource = linksLoaded && gridTargets(links, ownConfig).length === 0;

  const pickedLines = picked && pickedDay && (
    <>
      <p style={styles.detailLine}>{describeCell(picked)}</p>
      {picked.conflicts.length > 0 && (
        <p style={styles.detailLine}>겹치는 공유 일정: {picked.conflicts.map((c) => c.title).join(', ')}</p>
      )}
      {pickedDay.allDayTitles.length > 0 && (
        <p style={styles.detailLine}>그날 종일 일정: {pickedDay.allDayTitles.join(', ')}</p>
      )}
      <button type="button" style={styles.primaryBtn} onClick={() => createEvent(picked)}>이 시간으로 공유 일정 만들기</button>
    </>
  );

  const peoplePanel = (
    <section style={wide ? styles.peopleWide : styles.people} aria-label="회의 대상">
      <div style={styles.filterRow}>
        {availableSchools.length > 1 && (
          <div className="seg" role="group" aria-label="학교">
            <button type="button" aria-pressed={school === null} onClick={() => { setPickedSchool(null); setSubject(''); }}>전체</button>
            {availableSchools.map((s) => (
              <button key={s} type="button" aria-pressed={school === s} onClick={() => { setPickedSchool(s); setSubject(''); }}>
                {SCHOOL_SHORT[s]}
              </button>
            ))}
          </div>
        )}
        <select
          value={grade ?? ''}
          onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)}
          style={styles.select}
          aria-label="수업 학년"
        >
          <option value="">모든 학년</option>
          {[1, 2, 3].map((g) => <option key={g} value={g}>{g}학년 수업</option>)}
        </select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} style={styles.select} aria-label="과목">
          <option value="">모든 과목</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름 찾기"
        aria-label="이름 찾기"
        style={styles.input}
      />
      <div style={styles.listActions}>
        <button type="button" onClick={selectAllFiltered} style={styles.linkBtn}>보이는 {filtered.length}명 모두 선택</button>
        <button type="button" onClick={() => { setSelected(new Set()); setPickedCell(null); }} style={styles.linkBtn}>비우기</button>
      </div>
      <div style={wide ? styles.listWide : styles.list}>
        {filtered.length === 0 && <p style={styles.note}>맞는 교사가 없습니다.</p>}
        {filtered.map((person) => (
          <PersonRow key={person.key} person={person} checked={selected.has(person.key)} onToggle={togglePerson} />
        ))}
      </div>
      {!wide && (
        <button type="button" style={styles.foldDone} disabled={selected.size === 0} onClick={() => setShowPeople(false)}>
          {selected.size}명으로 공강 찾기
        </button>
      )}
      <div style={styles.groupRow}>
        {groups.length > 0 && (
          <select value="" onChange={(e) => loadGroup(e.target.value)} style={styles.select} aria-label="저장한 묶음 불러오기">
            <option value="">묶음 불러오기</option>
            {groups.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.keys.length}명)</option>)}
          </select>
        )}
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') saveGroup(); }}
          placeholder="묶음 이름 (교무부 등)"
          aria-label="묶음 이름"
          maxLength={20}
          style={{ ...styles.input, flex: 1, minWidth: 90 }}
        />
        <button type="button" onClick={saveGroup} disabled={!groupName.trim() || selected.size === 0} style={styles.smallBtn}>저장</button>
        {groups.some((g) => g.name === groupName.trim()) && (
          <button type="button" onClick={() => removeGroup(groupName.trim())} style={styles.smallBtn}>삭제</button>
        )}
      </div>
    </section>
  );

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} aria-label="달력으로 돌아가기"><ArrowLeft size={14} /></button>
        <h3 style={styles.heading}>회의 시간 찾기</h3>
        <button
          onClick={() => loadGrids(true)}
          disabled={gridLoading}
          style={styles.iconBtn}
          title="시간표 다시 받기"
          aria-label="시간표 다시 받기"
        >
          <RefreshCw size={14} style={gridLoading ? { opacity: 0.4 } : undefined} />
        </button>
      </div>

      {noSource ? (
        <div style={styles.center}>
          <p style={styles.empty}>컴시간 학교가 아직 정해지지 않았습니다.</p>
          {linksDenied && <p style={styles.warn}>연결표를 읽지 못했습니다. 서버 규칙 적용 여부를 관리자에게 확인해 주세요.</p>}
          <p style={styles.note}>
            {user?.role === 'admin' || user?.role === 'super_admin'
              ? '도구 모음의 관리자 > 컴시간 연결에서 학교를 정해 주세요.'
              : '관리자가 연결표를 저장하거나, 설정에서 내 컴시간 시간표를 연결하면 쓸 수 있습니다.'}
          </p>
        </div>
      ) : gridLoading && people.length === 0 ? (
        <div style={styles.center}><div className="spinner" /><p style={styles.note}>전교 시간표를 받는 중입니다</p></div>
      ) : gridError && people.length === 0 ? (
        <div style={styles.center}>
          <p style={styles.empty}>{gridError}</p>
          <div style={styles.errorActions}>
            <button type="button" onClick={() => loadGrids(true)} style={styles.smallBtn}>다시 시도</button>
            <ComciganCallButton />
          </div>
        </div>
      ) : (
        <div style={wide ? styles.bodyWide : styles.body}>
          {!wide && (
            <button type="button" style={styles.fold} onClick={() => setShowPeople((v) => !v)} aria-expanded={showPeople}>
              대상 {selected.size}명
              {showPeople ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          {(wide || showPeople) && peoplePanel}

          <section style={wide ? styles.gridPaneWide : styles.gridPane} aria-label="공강 찾기">
            {unknownTimes.length > 0 && (
              <p style={styles.warn}>시정표를 받지 못해 {unknownTimes.join(', ')}의 수업을 계산에 넣지 못했습니다. 공강으로 보여도 수업이 있을 수 있습니다.</p>
            )}
            <div style={styles.weekNav}>
              <button
                type="button"
                onClick={() => { setWeekOffset((v) => v - 1); setPickedCell(null); }}
                disabled={weekOffset <= 0}
                style={styles.iconBtn}
                aria-label="앞 주"
              >
                <ChevronLeft size={15} />
              </button>
              <strong style={styles.weekLabel}>
                {format(monday, 'M/d')}~{format(addDays(monday, 4), 'M/d')}
              </strong>
              <button
                type="button"
                onClick={() => { setWeekOffset((v) => v + 1); setPickedCell(null); }}
                disabled={weekOffset >= 8}
                style={styles.iconBtn}
                aria-label="다음 주"
              >
                <ChevronRight size={15} />
              </button>
              <div className="seg" role="group" aria-label="요일" style={styles.weekdays}>
                {WEEKDAYS.map((label, index) => {
                  const closed = closedReason(index);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={!closed && weekdays.has(index + 1)}
                      disabled={!!closed}
                      title={`${format(addDays(monday, index), 'M월 d일')} ${label}요일${closed ? ` (${closed})` : ''}`}
                      style={closed ? styles.weekdayClosed : undefined}
                      onClick={() => toggleWeekday(index + 1)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!rows ? (
              <p style={styles.note}>시정표를 받지 못해 칸을 만들 수 없습니다. 시간표를 다시 받아 주세요.</p>
            ) : chosen.length === 0 ? (
              <p style={styles.hint}>회원을 고르면 공강을 찾아 드립니다.</p>
            ) : week && (
              <>
                <div style={styles.suggestHead}>
                  <strong style={styles.suggestTitle}>추천 공강{suggestions.length > 0 ? ` ${suggestions.length}곳` : ''}</strong>
                  <button type="button" style={styles.linkBtn} aria-expanded={showGrid} onClick={() => setShowGrid((v) => !v)}>
                    {showGrid ? '전체 표 접기' : '전체 표 보기'}
                  </button>
                </div>
                {suggestions.length === 0 ? (
                  <p style={styles.hint}>
                    {weekdays.size === 0 ? '요일을 하나 이상 골라 주세요.' : '고른 요일에는 공강이 없습니다. 다른 요일이나 다음 주를 골라 보세요.'}
                  </p>
                ) : (
                  <>
                    {suggestions[0].cell.busy > 0 && (
                      <p style={styles.warn}>고른 요일에는 모두 되는 시간이 없어 가장 많이 되는 시간을 보여 드립니다.</p>
                    )}
                    <ol style={styles.slotList}>
                      {suggestions.map(({ cell, row, misses }, index) => {
                        const open = pickedCell === cell.key;
                        return (
                          <li key={cell.key} style={styles.slot}>
                            <button
                              type="button"
                              style={styles.slotBtn}
                              aria-expanded={open}
                              onClick={() => setPickedCell(open ? null : cell.key)}
                            >
                              <b style={styles.slotRank}>{index + 1}</b>
                              <span style={styles.slotMain}>
                                <strong style={styles.slotTime}>
                                  {format(cell.start, 'M/d(EEE)', { locale: ko })} {row.label}{' '}
                                  <span style={styles.slotClock}>{format(cell.start, 'HH:mm')}~{format(cell.end, 'HH:mm')}</span>
                                </strong>
                                <small style={styles.slotNote}>
                                  {misses.length > 0 ? misses.join(' · ') : `${FINDER_CONDITIONS.length}가지 조건 모두 맞음`}
                                </small>
                              </span>
                              <span style={cell.busy > 0 ? styles.slotBusy : styles.slotFree}>
                                {cell.busy > 0 ? `${cell.busy}명 수업` : cell.total > 1 ? '모두 공강' : '공강'}
                              </span>
                            </button>
                            {open && <div style={styles.slotDetail} aria-live="polite">{pickedLines}</div>}
                          </li>
                        );
                      })}
                    </ol>
                    <p style={styles.note}>추천 기준 (앞쪽 우선): {FINDER_CONDITIONS.join(', ')}</p>
                  </>
                )}

                {showGrid && (
                  <>
                    <span style={styles.summary}>
                      {week.free.length > 0 ? `모두 되는 칸 ${week.free.length}개` : '이번 주에는 모두 되는 칸이 없습니다'}
                    </span>
                <div style={styles.gridScroll}>
                  <div style={styles.grid} role="table" aria-label="교시별 가능 여부">
                    <div style={styles.corner} />
                    {week.days.map((day) => (
                      <div key={day.dateStr} style={styles.dayHead} role="columnheader">
                        <b>{format(day.date, 'EEE', { locale: ko })}</b> {format(day.date, 'M/d')}
                        {day.offReason
                          ? <small style={styles.dayNote} title={day.offReason}>{day.offReason}</small>
                          : day.allDayTitles.length > 0 && (
                            <small style={styles.dayNote} title={day.allDayTitles.join(', ')}>일정 {day.allDayTitles.length}건</small>
                          )}
                      </div>
                    ))}
                    {rows.map((row) => (
                      <React.Fragment key={row.key}>
                        <div style={styles.rowHead} role="rowheader">
                          <b>{row.label}</b>
                          <small style={styles.rowTime}>{row.time}</small>
                        </div>
                        {week.days.map((day) => {
                          const cell = week.cells[cellKey(day.dateStr, row.key)];
                          const off = cell.state === 'off' || cell.state === 'past';
                          return (
                            <button
                              key={cell.key}
                              type="button"
                              className="finder-cell"
                              disabled={off}
                              aria-pressed={pickedCell === cell.key}
                              aria-label={`${format(day.date, 'M월 d일 EEEE', { locale: ko })} ${row.label}, ${describeCell(cell)}`}
                              onClick={() => setPickedCell(cell.key)}
                              style={cellStyle(cell)}
                            >
                              {cellText(cell)}
                            </button>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {picked && pickedRow && !suggestions.some((s) => s.cell.key === picked.key) && (
                  <div style={styles.detail} aria-live="polite">
                    <strong style={styles.detailTitle}>
                      {format(picked.start, 'M월 d일 (EEE)', { locale: ko })} {pickedRow.label} {format(picked.start, 'HH:mm')}~{format(picked.end, 'HH:mm')}
                    </strong>
                    {pickedLines}
                  </div>
                )}
                  </>
                )}
              </>
            )}

            <div style={styles.notes}>
              {linksDenied && <p style={styles.warn}>연결표를 읽지 못해 컴시간 표기로 보여 드립니다. 서버 규칙 적용 여부를 관리자에게 확인해 주세요.</p>}
              {!linksDenied && (hasMembers
                ? <p style={styles.note}>가입해 시간표가 연결된 회원만 보입니다.</p>
                : <p style={styles.note}>아직 계정과 연결되지 않아 컴시간 표기로 보입니다. 관리자 &gt; 컴시간 연결에서 저장하면 회원 이름으로 나옵니다.</p>)}
              {gridError && people.length > 0 && (
                <p style={styles.warn}>{gridError} <ComciganCallButton style={{ marginLeft: 4 }} /></p>
              )}
              {weekOffset > 0 && <p style={styles.note}>컴시간은 이번 주 시간표만 알려 주므로 다음 주 이후는 이번 주 시간표로 어림합니다.</p>}
              {targetSchools.size > 1 && baseSchool && <p style={styles.note}>시각은 {SCHOOL_LABELS[baseSchool]} 시정표 기준이고, 다른 학교 수업은 시각으로 견줍니다.</p>}
              <p style={styles.note}>컴시간 시간표와 공유 일정만 봅니다. 개인 일정은 계산에 쓰지 않으며, 수업 중인 분은 인원수만 보여 드립니다.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PersonRow({ person, checked, onToggle }: { person: FinderPerson; checked: boolean; onToggle: (key: string) => void }) {
  const subjects = [...new Set(person.labels.flatMap((l) => l.subjects))].slice(0, 3).join(', ');
  const schools = person.labels.map((l) => SCHOOL_SHORT[l.school]).join('·');
  return (
    <label style={checked ? styles.personOn : styles.person}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(person.key)} />
      <span style={styles.personName}>{person.name}</span>
      <small style={styles.personMeta}>{schools}{subjects ? ` · ${subjects}` : ''}</small>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-subtle)',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    borderRadius: 6,
    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    color: 'var(--accent)',
    cursor: 'pointer',
  },
  heading: {
    flex: 1,
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: 4,
    border: 'none',
    borderRadius: 6,
    background: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    textAlign: 'center',
  },
  errorActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  empty: {
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '8px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  bodyWide: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '240px minmax(0, 1fr)',
    gap: 12,
    padding: '8px 12px 12px',
  },
  fold: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  people: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
  },
  peopleWide: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 0,
    overflow: 'hidden',
  },
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  select: {
    flex: 1,
    minWidth: 80,
    padding: '4px 6px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  input: {
    padding: '4px 8px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    minWidth: 0,
  },
  listActions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
  },
  linkBtn: {
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  list: {
    maxHeight: 132,
    overflowY: 'auto',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: 2,
  },
  listWide: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    padding: 2,
  },
  person: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 'var(--fs-body)',
  },
  personOn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 'var(--fs-body)',
    background: 'var(--accent-soft)',
  },
  personName: {
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
  personMeta: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  groupRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  smallBtn: {
    padding: '4px 8px',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  gridPane: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
  },
  gridPaneWide: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 0,
    overflowY: 'auto',
  },
  weekNav: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
  },
  weekLabel: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  weekdays: {
    marginLeft: 'auto',
  },
  weekdayClosed: {
    opacity: 0.35,
    cursor: 'default',
    textDecoration: 'line-through',
  },
  foldDone: {
    padding: '5px 10px',
    border: 'none',
    borderRadius: 7,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  suggestHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  suggestTitle: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-primary)',
  },
  slotList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  slot: {
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    overflow: 'hidden',
  },
  slotBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 10px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  slotRank: {
    flexShrink: 0,
    width: 18,
    fontSize: 'var(--fs-control)',
    color: 'var(--accent)',
    textAlign: 'center',
  },
  slotMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  slotTime: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-primary)',
  },
  slotClock: {
    fontWeight: 500,
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  slotNote: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.3,
    color: 'var(--text-muted)',
  },
  slotFree: {
    flexShrink: 0,
    padding: '1px 6px',
    borderRadius: 6,
    background: 'var(--success-soft)',
    color: 'var(--text-primary)',
    fontSize: 'var(--fs-label)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  slotBusy: {
    flexShrink: 0,
    padding: '1px 6px',
    borderRadius: 6,
    background: 'color-mix(in srgb, var(--warning) 22%, transparent)',
    color: 'var(--text-primary)',
    fontSize: 'var(--fs-label)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  slotDetail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
    padding: '0 10px 8px 36px',
  },
  summary: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
  },
  hint: {
    padding: '24px 8px',
    textAlign: 'center',
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  gridScroll: {
    overflowX: 'auto',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '58px repeat(5, minmax(46px, 1fr))',
    gap: 2,
  },
  corner: {},
  dayHead: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    padding: '2px 0',
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
    minWidth: 0,
  },
  dayNote: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-muted)',
  },
  rowHead: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    fontSize: 'var(--fs-label)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
  rowTime: {
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-muted)',
    fontVariantNumeric: 'tabular-nums',
  },
  cellFree: {
    background: 'var(--success-soft)',
    color: 'var(--text-primary)',
    fontWeight: 700,
  },
  cellConflict: {
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    fontWeight: 600,
  },
  cellBusy: {
    color: 'var(--text-primary)',
  },
  cellOff: {
    background: 'var(--tint-neutral-faint)',
    color: 'var(--text-muted)',
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
    padding: '8px 10px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
  },
  detailTitle: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-primary)',
  },
  detailLine: {
    fontSize: 'var(--fs-body)',
    lineHeight: 1.4,
    color: 'var(--text-secondary)',
  },
  primaryBtn: {
    marginTop: 4,
    padding: '5px 12px',
    border: 'none',
    borderRadius: 7,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  notes: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    marginTop: 2,
  },
  note: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
  },
  warn: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--warning)',
    fontWeight: 600,
  },
};

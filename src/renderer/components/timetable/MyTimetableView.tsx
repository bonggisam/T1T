import React, { useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, differenceInCalendarWeeks, format, isToday } from 'date-fns';
import { ArrowLeft, ChevronLeft, ChevronRight, PanelLeft, RefreshCw } from 'lucide-react';
import type { School, TeacherPeriod } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { useComciganStore } from '../../store/comciganStore';
import { LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import { useWeekLessons } from '../../hooks/useWeekLessons';
import { useTeacherWeek } from '../../hooks/useTeacherWeek';
import type { BaseChange } from '../../utils/baseTimetable';
import { baseChangeNote, timetableMonday } from '../../utils/classPeriods';
import { getHoliday } from '../../utils/holidays';
import { NEIS_SYNC_LABEL, timetableWeekStart } from '../../utils/neisTimetable';
import { teacherKey } from '../../utils/teachingAssignments';
import { ComciganCallButton } from '../common/ComciganCall';
import { cls, Emo } from '../common/designKit';
import '../common/designs.css';
import './MyTimetableView.css';

const WEEKDAYS = ['월', '화', '수', '목', '금'];
const SHORT_LABEL: Record<School, string> = { taeseong_middle: '태성중', taeseong_high: '태성고' };
/** 한 교시 길이를 모를 때 지금 교시를 고르는 데 쓰는 길이(분) */
const PERIOD_MINUTES = 50;
/** 교시 사이가 이만큼 벌어지면 점심으로 본다(분) */
const LUNCH_GAP_MINUTES = 80;
const SIDE_KEY = 't1t-timetable-side';

interface MyTimetableViewProps {
  onBack: () => void;
  /** 설정 > 내 시간표를 연다. 담당 학급을 직접 넣을 때 */
  onOpenSettings?: () => void;
}

interface Person {
  name: string;
  /** 가장 많이 가르치는 과목 */
  subject: string;
}

/** 이번 주, 다음 주, 지난주, 2주 뒤 */
function relativeWeek(monday: Date, now: Date = new Date()): string {
  const diff = differenceInCalendarWeeks(monday, now, { weekStartsOn: 1 });
  if (diff === 0) return '이번 주';
  if (diff === 1) return '다음 주';
  if (diff === -1) return '지난주';
  return diff > 0 ? `${diff}주 뒤` : `${-diff}주 전`;
}

/** 11월 9일 ~ 13일, 11월 30일 ~ 12월 4일 */
function weekRange(monday: Date): string {
  const friday = addDays(monday, 4);
  return `${format(monday, 'M월 d일')} ~ ${format(friday, friday.getMonth() === monday.getMonth() ? 'd일' : 'M월 d일')}`;
}

function startTimeOf(entry: string | undefined): string | null {
  const m = entry?.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function minutesOf(entry: string | undefined): number | null {
  const m = entry?.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 지금 하고 있는 교시. 수업 시간이 아니면 0 */
function currentPeriod(classTimes: string[], now: Date): number {
  const at = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < classTimes.length; i += 1) {
    const start = minutesOf(classTimes[i]);
    if (start === null) continue;
    const next = minutesOf(classTimes[i + 1]);
    const end = Math.min(start + PERIOD_MINUTES, next ?? Infinity);
    if (at >= start && at < end) return i + 1;
  }
  return 0;
}

function mostCommon(values: string[]): string {
  const count = new Map<string, number>();
  for (const v of values) if (v) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

const slotOf = (weekday: number, period: number) => `${weekday}-${period}`;
const schoolOf = (school: unknown): School | null => (
  school === 'taeseong_middle' || school === 'taeseong_high' ? school : null
);

/**
 * 내 시간표. 처음에는 내 수업을 요일과 교시로 한 주씩 본다. 앞뒤 주로 넘길 수 있다.
 * 왼쪽 메뉴에서 학교와 선생님을 고르면 그 선생님의 시간표를 같은 방법으로 본다.
 * 받아 둔 주(이번 주, 주말에는 다음 주)의 내 시간표는 수업 알림과 같은 시간표이고, 나머지는 그 주 나이스 시간표로 만든다.
 */
export function MyTimetableView({ onBack, onOpenSettings }: MyTimetableViewProps) {
  const user = useAuthStore((s) => s.user);
  const timetableData = useComciganStore((s) => s.timetableData);
  const schoolClassTimes = useComciganStore((s) => s.schoolClassTimes);
  const storeLoading = useComciganStore((s) => s.loading);
  const fetchTimetable = useComciganStore((s) => s.fetchTimetable);
  const assignments = useComciganLinksStore((s) => s.assignments);
  const bases = useComciganLinksStore((s) => s.bases);
  const linkTimes = useComciganLinksStore((s) => s.classTimes);
  const linksLoaded = useComciganLinksStore((s) => s.linksLoaded);
  const adminRole = user?.role === 'admin' || user?.role === 'super_admin';
  const mySchool = schoolOf(user?.school);
  const myName = teacherKey(user?.name || '');

  const [sideOpen, setSideOpen] = useState(() => {
    try { return localStorage.getItem(SIDE_KEY) !== 'closed'; } catch { return true; }
  });
  const [listSchool, setListSchool] = useState<School>(mySchool ?? 'taeseong_middle');
  const [query, setQuery] = useState('');
  /** 보고 있는 다른 선생님. null이면 내 시간표 */
  const [picked, setPicked] = useState<{ school: School; name: string } | null>(null);

  // 처음에는 받아 둔 주를 보여 준다. 정각 받기로 주가 바뀌면 함께 바뀐다
  const homeKey = format(timetableData ? timetableMonday(timetableData) : timetableWeekStart(), 'yyyy-MM-dd');
  const home = useMemo(() => {
    const [y, m, d] = homeKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [homeKey]);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const monday = useMemo(() => addWeeks(home, offset), [home, offset]);
  const mine = useWeekLessons(monday, !picked, reload);
  const theirs = useTeacherWeek(picked?.school ?? null, picked?.name ?? '', monday, !!picked, reload);
  const week = picked ? theirs : mine;
  const days = useMemo(() => WEEKDAYS.map((_, i) => addDays(monday, i)), [monday]);

  // 지금 교시 표시가 시간에 맞게 옮겨 가도록 1분마다 다시 그린다
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const people = useMemo<Person[]>(() => {
    const subjects = new Map<string, string[]>();
    for (const row of assignments[listSchool] ?? []) {
      const key = teacherKey(row.name);
      if (key) subjects.set(key, [...row.items, ...(row.slots ?? [])].map((item) => item.subject));
    }
    // 컴시간 파일에만 있는 선생님도 넣는다. 과목은 기초 시간표 쪽이 한 주 수업 수를 그대로 담아 더 정확하다
    const fromBase = new Map<string, string[]>();
    for (const lesson of bases[listSchool]?.lessons ?? []) {
      const key = teacherKey(lesson.name);
      if (key) fromBase.set(key, [...(fromBase.get(key) ?? []), lesson.subject]);
    }
    for (const [key, list] of fromBase) subjects.set(key, list);
    return [...subjects.entries()]
      .filter(([name]) => !(listSchool === mySchool && name === myName))
      .map(([name, list]) => ({ name, subject: mostCommon(list) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [assignments, bases, listSchool, mySchool, myName]);
  const shownPeople = useMemo(() => {
    const q = query.trim();
    return q ? people.filter((p) => p.name.includes(q) || p.subject.includes(q)) : people;
  }, [people, query]);

  const classTimes = picked
    ? linkTimes[picked.school] ?? []
    : schoolClassTimes.length > 0 ? schoolClassTimes : timetableData?.classTimes ?? [];
  const dropped = useMemo(() => week.changes.filter((c): c is BaseChange & { before: NonNullable<BaseChange['before']> } => !!c.before), [week.changes]);
  const lessonsAt = useMemo(() => {
    const map = new Map<string, TeacherPeriod[]>();
    for (const p of week.lessons) map.set(slotOf(p.weekday, p.period), [...(map.get(slotOf(p.weekday, p.period)) ?? []), p]);
    return map;
  }, [week.lessons]);
  const droppedAt = useMemo(() => {
    const map = new Map<string, typeof dropped>();
    for (const c of dropped) map.set(slotOf(c.weekday, c.period), [...(map.get(slotOf(c.weekday, c.period)) ?? []), c]);
    return map;
  }, [dropped]);
  /** 학급마다 색 번호. 같은 반 수업은 같은 색이다 */
  const hueOf = useMemo(() => {
    const classes = [...new Set(week.lessons.map((p) => p.grade * 100 + p.classNum))].sort((a, b) => a - b);
    return new Map(classes.map((c, i) => [c, i % 8]));
  }, [week.lessons]);
  const periodCount = Math.max(
    classTimes.length,
    ...week.lessons.map((p) => p.period),
    ...dropped.map((c) => c.period),
    0,
  );
  const changedSlots = new Set(week.changes.map((c) => slotOf(c.weekday, c.period))).size;
  const nowPeriod = currentPeriod(classTimes, new Date());
  const offLabel = (weekday: number, date: Date): string | null => {
    const holiday = getHoliday(date);
    if (holiday) return holiday;
    const off = week.offDays.find((d) => d.weekday === weekday);
    return off ? off.label || '수업 없음' : null;
  };
  /** 앞 교시와 사이가 길게 벌어진 교시. 그 위가 점심이다 */
  const afterLunch = (period: number): boolean => {
    const prev = minutesOf(classTimes[period - 2]);
    const start = minutesOf(classTimes[period - 1]);
    return prev !== null && start !== null && start - prev >= LUNCH_GAP_MINUTES;
  };

  const busy = week.status === 'loading' || (week.fromStore && storeLoading);
  function refresh() {
    if (week.fromStore) fetchTimetable();
    else setReload((v) => v + 1);
  }
  function toggleSide() {
    setSideOpen((open) => {
      try { localStorage.setItem(SIDE_KEY, open ? 'closed' : 'open'); } catch { /* 기억하지 못해도 된다 */ }
      return !open;
    });
  }

  const who = picked ? `${picked.name} 선생님` : `${user?.name || '선생님'} 선생님`;
  const settingsButton = !picked && onOpenSettings && (
    <button type="button" onClick={onOpenSettings} className="tt-small">설정 &gt; 내 시간표 열기</button>
  );

  let body: React.ReactNode;
  if (week.status === 'noschool') {
    body = (
      <div className="tt-center">
        <p className="tt-empty">계정에 학교가 없어 시간표를 만들 수 없습니다.</p>
        <p className="tt-note">관리자에게 학교를 정해 달라고 해 주세요. 왼쪽에서 다른 선생님의 시간표는 볼 수 있습니다.</p>
      </div>
    );
  } else if (week.status === 'unlinked') {
    body = (
      <div className="tt-center">
        <p className="tt-empty">담당 학급 표에서 {who}을 찾지 못했습니다.</p>
        <p className="tt-note">
          {adminRole
            ? '관리자 > 기초 시간표 탭에서 컴시간 파일을 올리면 모든 선생님이 이름으로 연결됩니다.'
            : '관리자가 기초 시간표를 올리면 이름으로 자동 연결됩니다.'}
          {!picked && ' 먼저 쓰시려면 설정 > 내 시간표에 담당 과목과 학급을 넣어 주세요.'}
        </p>
        {settingsButton}
      </div>
    );
  } else if (week.status === 'loading') {
    body = <div className="tt-center"><div className="spinner" /><p className="tt-note">시간표를 받는 중입니다</p></div>;
  } else if (week.status === 'error') {
    body = (
      <div className="tt-center">
        <p className="tt-empty">{week.error || '나이스에서 시간표를 받지 못했습니다'}</p>
        <div className="tt-actions">
          <button type="button" onClick={refresh} className="tt-small">다시 시도</button>
          <ComciganCallButton />
        </div>
      </div>
    );
  } else if (week.noSchoolData) {
    body = (
      <div className="tt-center">
        <p className="tt-empty">이 주는 나이스에 학교 시간표가 없습니다.</p>
        <p className="tt-note">방학이거나 학교가 아직 시간표를 넣지 않은 주입니다.</p>
      </div>
    );
  } else if (week.lessons.length === 0 && dropped.length === 0) {
    body = (
      <div className="tt-center">
        <p className="tt-empty">이 주에는 {picked ? `${who}의` : '내'} 수업이 없습니다.</p>
      </div>
    );
  } else {
    body = (
      <div className="tt-scroll">
        <table className="tt-table" aria-label={`${weekRange(monday)} ${picked ? who : '내'} 시간표`}>
          <colgroup>
            <col className="tt-colPeriod" />
            {days.map((day) => <col key={day.toISOString()} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="tt-corner" scope="col" aria-label="교시" />
              {days.map((day, i) => {
                const off = offLabel(i + 1, day);
                return (
                  <th
                    key={day.toISOString()}
                    scope="col"
                    className={cls('tt-day', isToday(day) && 'is-today', off && 'is-off')}
                  >
                    <span className="tt-dayInner">
                      <b className="tt-dow">{WEEKDAYS[i]}</b>
                      <span className="tt-date">{format(day, 'M/d')}</span>
                      {off && <span className="tt-offName" title={off}>{off}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: periodCount }, (_, i) => i + 1).map((period) => (
              <tr key={period} className={cls(afterLunch(period) && 'is-afterLunch')}>
                <th scope="row" className="tt-period">
                  <b>{period}</b>
                  {startTimeOf(classTimes[period - 1]) && <small>{startTimeOf(classTimes[period - 1])}</small>}
                </th>
                {days.map((day, i) => {
                  const weekday = i + 1;
                  const off = !!offLabel(weekday, day);
                  const today = isToday(day);
                  const here = off ? [] : lessonsAt.get(slotOf(weekday, period)) ?? [];
                  const gone = droppedAt.get(slotOf(weekday, period)) ?? [];
                  return (
                    <td
                      key={day.toISOString()}
                      data-slot={slotOf(weekday, period)}
                      className={cls(
                        'tt-cell',
                        today && 'is-today',
                        off && 'is-off',
                        today && period === nowPeriod && 'is-now',
                        here.length === 0 && gone.length === 0 && 'is-free',
                      )}
                    >
                      {here.map((p) => (
                        <div
                          key={`${p.grade}-${p.classNum}-${p.subject}`}
                          className={cls('tt-lesson', p.moved && 'is-moved')}
                          data-hue={hueOf.get(p.grade * 100 + p.classNum) ?? 0}
                          title={`${p.subject} ${p.grade}-${p.classNum}${p.moved ? ' · 교체로 들어온 수업' : ''}`}
                        >
                          <b className="tt-class">{p.grade}-{p.classNum}</b>
                          <span className="tt-subject">{p.subject}</span>
                          {p.moved && <em className="tt-tag">교체</em>}
                        </div>
                      ))}
                      {gone.map((c) => {
                        const note = baseChangeNote(c);
                        return (
                          <div
                            key={`gone-${c.before.grade}-${c.before.classNum}-${c.before.subject}`}
                            className="tt-gone"
                            title={`${c.before.subject} ${c.before.grade}-${c.before.classNum} · 이 주에 빠짐${note ? ` (${note})` : ''}`}
                          >
                            <s>{c.before.grade}-{c.before.classNum} {c.before.subject}</s>
                            {note && <small>{note}</small>}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const ready = week.status === 'ready' && !week.noSchoolData;
  return (
    <div className="md-root tt-root" data-side={sideOpen ? 'open' : 'closed'}>
      <aside className="tt-side" aria-label="선생님 고르기">
        <div className="tt-seg" role="group" aria-label="학교">
          {LINK_SCHOOLS.map((school) => (
            <button
              key={school}
              type="button"
              data-school={school}
              aria-pressed={listSchool === school}
              onClick={() => setListSchool(school)}
            >
              {SHORT_LABEL[school]}
            </button>
          ))}
        </div>
        <button type="button" className="tt-me" aria-pressed={!picked} onClick={() => setPicked(null)}>
          <Emo e="⭐" /> 내 시간표
        </button>
        <input
          className="tt-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·과목"
          aria-label={`${SHORT_LABEL[listSchool]} 선생님 찾기`}
        />
        <ul className="tt-list">
          {shownPeople.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                className="tt-person"
                aria-pressed={picked?.school === listSchool && picked.name === p.name}
                onClick={() => setPicked({ school: listSchool, name: p.name })}
                title={`${p.name} 선생님${p.subject ? ` · ${p.subject}` : ''}`}
              >
                <b>{p.name}</b>
                {p.subject && <small>{p.subject}</small>}
              </button>
            </li>
          ))}
          {shownPeople.length === 0 && (
            <li className="tt-listEmpty">
              {!linksLoaded
                ? '불러오는 중'
                : people.length === 0
                  ? '아직 시간표 자료가 없습니다'
                  : '찾는 선생님이 없습니다'}
            </li>
          )}
        </ul>
        {people.length > 0 && <p className="tt-count">{SHORT_LABEL[listSchool]} {people.length}명</p>}
      </aside>

      <section className="tt-main">
        <div className="tt-head">
          <button type="button" onClick={onBack} className="tt-btn is-back" aria-label="달력으로 돌아가기"><ArrowLeft size={14} /></button>
          <button
            type="button"
            onClick={toggleSide}
            className="tt-btn"
            aria-pressed={sideOpen}
            title={sideOpen ? '선생님 목록 접기' : '선생님 목록 펴기'}
            aria-label={sideOpen ? '선생님 목록 접기' : '선생님 목록 펴기'}
          >
            <PanelLeft size={15} />
          </button>
          <h3 className="tt-title">
            {picked ? (
              <>
                <span>{picked.name} 선생님</span>
                <small data-school={picked.school}>{SHORT_LABEL[picked.school]}</small>
              </>
            ) : <span>내 시간표</span>}
          </h3>
          <button
            type="button"
            onClick={refresh}
            disabled={busy || week.status === 'noschool' || week.status === 'unlinked'}
            className="tt-btn"
            title="나이스 시간표 다시 받기"
            aria-label="나이스 시간표 다시 받기"
          >
            <RefreshCw size={14} style={busy ? { opacity: 0.4 } : undefined} />
          </button>
        </div>

        <div className="tt-weekbar">
          <button type="button" onClick={() => setOffset((v) => v - 1)} className="tt-btn" aria-label="앞 주">
            <ChevronLeft size={16} />
          </button>
          <div className="tt-week" aria-live="polite">
            <strong>{weekRange(monday)}</strong>
            <span>{relativeWeek(monday)}</span>
          </div>
          <button type="button" onClick={() => setOffset((v) => v + 1)} className="tt-btn" aria-label="다음 주">
            <ChevronRight size={16} />
          </button>
          {offset !== 0 && (
            <button type="button" onClick={() => setOffset(0)} className="tt-small">{relativeWeek(home)}</button>
          )}
          {ready && (
            <p className="tt-sum">
              주 {week.lessons.length}교시
              {week.basis === 'base' && changedSlots > 0 && ` · 바뀐 수업 ${changedSlots}칸`}
            </p>
          )}
        </div>
        {ready && week.error && <p className="tt-warn">{week.error}. 전에 받은 시간표를 보여 줍니다.</p>}

        <div className="tt-stage">
          <div className="tt-board">{body}</div>
        </div>

        {ready && (week.lessons.length > 0 || dropped.length > 0) && (
          <p className="tt-foot">
            {week.basis === 'base'
              ? '학교 기초 시간표를 그 주 나이스 시간표와 대조했습니다.'
              : picked || timetableData?.source || !week.fromStore
                ? '담당 학급 표를 그 주 나이스 시간표와 맞췄습니다.'
                : '전에 받은 시간표입니다.'}
            {dropped.length > 0 && ' 줄 그은 수업은 그 주에 빠진 수업입니다.'}
            {week.fromStore
              ? ` 나이스 시간표를 ${NEIS_SYNC_LABEL} 다시 받습니다.`
              : ' 학교가 나이스 시간표를 바꾸면 달라질 수 있습니다.'}
            {week.fetchedAt && ` 갱신 ${format(new Date(week.fetchedAt), 'M/d HH:mm')}`}
          </p>
        )}
      </section>
    </div>
  );
}

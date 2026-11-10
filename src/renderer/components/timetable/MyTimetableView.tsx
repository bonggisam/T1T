import React, { useMemo, useState } from 'react';
import { addDays, addWeeks, differenceInCalendarWeeks, format, isToday } from 'date-fns';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { TeacherPeriod } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { useComciganStore } from '../../store/comciganStore';
import { useWeekLessons } from '../../hooks/useWeekLessons';
import type { BaseChange } from '../../utils/baseTimetable';
import { baseChangeNote, timetableMonday } from '../../utils/classPeriods';
import { getHoliday } from '../../utils/holidays';
import { NEIS_SYNC_LABEL, timetableWeekStart } from '../../utils/neisTimetable';
import { ComciganCallButton } from '../common/ComciganCall';

const WEEKDAYS = ['월', '화', '수', '목', '금'];

interface MyTimetableViewProps {
  onBack: () => void;
  /** 설정 > 내 시간표를 연다. 담당 학급을 직접 넣을 때 */
  onOpenSettings?: () => void;
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

const slotOf = (weekday: number, period: number) => `${weekday}-${period}`;

/**
 * 내 시간표. 내 수업만 요일과 교시로 한 주씩 본다. 앞뒤 주로 넘길 수 있다.
 * 받아 둔 주(이번 주, 주말에는 다음 주)는 수업 알림과 같은 시간표이고, 다른 주는 그 주 나이스 시간표로 만든다.
 */
export function MyTimetableView({ onBack, onOpenSettings }: MyTimetableViewProps) {
  const user = useAuthStore((s) => s.user);
  const timetableData = useComciganStore((s) => s.timetableData);
  const schoolClassTimes = useComciganStore((s) => s.schoolClassTimes);
  const storeLoading = useComciganStore((s) => s.loading);
  const fetchTimetable = useComciganStore((s) => s.fetchTimetable);
  const adminRole = user?.role === 'admin' || user?.role === 'super_admin';

  // 처음에는 받아 둔 주를 보여 준다. 정각 받기로 주가 바뀌면 함께 바뀐다
  const homeKey = format(timetableData ? timetableMonday(timetableData) : timetableWeekStart(), 'yyyy-MM-dd');
  const home = useMemo(() => {
    const [y, m, d] = homeKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [homeKey]);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const monday = useMemo(() => addWeeks(home, offset), [home, offset]);
  const week = useWeekLessons(monday, true, reload);
  const days = useMemo(() => WEEKDAYS.map((_, i) => addDays(monday, i)), [monday]);

  const classTimes = schoolClassTimes.length > 0 ? schoolClassTimes : timetableData?.classTimes ?? [];
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
  const periodCount = Math.max(
    classTimes.length,
    ...week.lessons.map((p) => p.period),
    ...dropped.map((c) => c.period),
    0,
  );
  const changedSlots = new Set(week.changes.map((c) => slotOf(c.weekday, c.period))).size;
  const offLabel = (weekday: number, date: Date): string | null => {
    const holiday = getHoliday(date);
    if (holiday) return holiday;
    const off = week.offDays.find((d) => d.weekday === weekday);
    return off ? off.label || '수업 없음' : null;
  };

  const busy = week.status === 'loading' || (week.fromStore && storeLoading);
  function refresh() {
    if (week.fromStore) fetchTimetable();
    else setReload((v) => v + 1);
  }

  const settingsButton = onOpenSettings && (
    <button type="button" onClick={onOpenSettings} style={styles.smallBtn}>설정 &gt; 내 시간표 열기</button>
  );

  let body: React.ReactNode;
  if (week.status === 'noschool') {
    body = (
      <div style={styles.center}>
        <p style={styles.empty}>계정에 학교가 없어 시간표를 만들 수 없습니다.</p>
        <p style={styles.note}>관리자에게 학교를 정해 달라고 해 주세요.</p>
      </div>
    );
  } else if (week.status === 'unlinked') {
    body = (
      <div style={styles.center}>
        <p style={styles.empty}>담당 학급 표에서 {user?.name || '선생님'} 선생님을 찾지 못했습니다.</p>
        <p style={styles.note}>
          {adminRole
            ? '관리자 > 기초 시간표 탭에서 컴시간 파일을 올리면 모든 선생님이 이름으로 연결됩니다.'
            : '관리자가 기초 시간표를 올리면 이름으로 자동 연결됩니다.'}
          {' '}먼저 쓰시려면 설정 &gt; 내 시간표에 담당 과목과 학급을 넣어 주세요.
        </p>
        {settingsButton}
      </div>
    );
  } else if (week.status === 'loading') {
    body = <div style={styles.center}><div className="spinner" /><p style={styles.note}>시간표를 받는 중입니다</p></div>;
  } else if (week.status === 'error') {
    body = (
      <div style={styles.center}>
        <p style={styles.empty}>{week.error || '나이스에서 시간표를 받지 못했습니다'}</p>
        <div style={styles.actions}>
          <button type="button" onClick={refresh} style={styles.smallBtn}>다시 시도</button>
          <ComciganCallButton />
        </div>
      </div>
    );
  } else if (week.noSchoolData) {
    body = (
      <div style={styles.center}>
        <p style={styles.empty}>이 주는 나이스에 학교 시간표가 없습니다.</p>
        <p style={styles.note}>방학이거나 학교가 아직 시간표를 넣지 않은 주입니다.</p>
      </div>
    );
  } else if (week.lessons.length === 0 && dropped.length === 0) {
    body = (
      <div style={styles.center}>
        <p style={styles.empty}>이 주에는 내 수업이 없습니다.</p>
      </div>
    );
  } else {
    body = (
      <div style={styles.scroll}>
        <table style={styles.table} aria-label={`${weekRange(monday)} 내 시간표`}>
          <colgroup>
            <col style={{ width: 42 }} />
            {days.map((day) => <col key={day.toISOString()} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={styles.corner} scope="col" aria-label="교시" />
              {days.map((day, i) => {
                const off = offLabel(i + 1, day);
                const today = isToday(day);
                return (
                  <th key={day.toISOString()} scope="col" style={{ ...styles.dayHead, ...(today ? styles.todayHead : {}) }}>
                    <span style={{ ...styles.dow, ...(off ? { color: 'var(--weekend-text)' } : {}) }}>{WEEKDAYS[i]}</span>
                    <span style={styles.date}>{format(day, 'M/d')}</span>
                    {off && <span style={styles.offName} title={off}>{off}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: periodCount }, (_, i) => i + 1).map((period) => (
              <tr key={period}>
                <th scope="row" style={styles.periodHead}>
                  <span>{period}</span>
                  {startTimeOf(classTimes[period - 1]) && <small style={styles.periodTime}>{startTimeOf(classTimes[period - 1])}</small>}
                </th>
                {days.map((day, i) => {
                  const weekday = i + 1;
                  const off = !!offLabel(weekday, day);
                  const here = off ? [] : lessonsAt.get(slotOf(weekday, period)) ?? [];
                  const gone = droppedAt.get(slotOf(weekday, period)) ?? [];
                  return (
                    <td
                      key={day.toISOString()}
                      data-slot={slotOf(weekday, period)}
                      style={{ ...styles.cell, ...(isToday(day) ? styles.todayCell : {}), ...(off ? styles.offCell : {}) }}
                    >
                      {here.map((p) => (
                        <div
                          key={`${p.grade}-${p.classNum}-${p.subject}`}
                          style={{ ...styles.lesson, ...(p.moved ? styles.lessonMoved : {}) }}
                          title={`${p.subject} ${p.grade}-${p.classNum}${p.moved ? ' · 교체로 들어온 수업' : ''}`}
                        >
                          <span style={styles.lessonClass}>{p.grade}-{p.classNum}</span>
                          <span style={styles.lessonSubject}>{p.subject}</span>
                          {p.moved && <span style={styles.tag}>교체</span>}
                        </div>
                      ))}
                      {gone.map((c) => {
                        const note = baseChangeNote(c);
                        return (
                          <div
                            key={`gone-${c.before.grade}-${c.before.classNum}-${c.before.subject}`}
                            style={styles.gone}
                            title={`${c.before.subject} ${c.before.grade}-${c.before.classNum} · 이 주에 빠짐${note ? ` (${note})` : ''}`}
                          >
                            <span style={styles.goneText}>{c.before.grade}-{c.before.classNum} {c.before.subject}</span>
                            {note && <span style={styles.goneNote}>{note}</span>}
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
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} aria-label="달력으로 돌아가기"><ArrowLeft size={14} /></button>
        <h3 style={styles.heading}>내 시간표</h3>
        <button
          onClick={refresh}
          disabled={busy || week.status === 'noschool' || week.status === 'unlinked'}
          style={styles.iconBtn}
          title="나이스 시간표 다시 받기"
          aria-label="나이스 시간표 다시 받기"
        >
          <RefreshCw size={14} style={busy ? { opacity: 0.4 } : undefined} />
        </button>
      </div>

      <div style={styles.weekNav}>
        <button type="button" onClick={() => setOffset((v) => v - 1)} style={styles.iconBtn} aria-label="앞 주">
          <ChevronLeft size={16} />
        </button>
        <div style={styles.weekTitle} aria-live="polite">
          <strong style={styles.weekLabel}>{weekRange(monday)}</strong>
          <span style={styles.relative}>{relativeWeek(monday)}</span>
        </div>
        <button type="button" onClick={() => setOffset((v) => v + 1)} style={styles.iconBtn} aria-label="다음 주">
          <ChevronRight size={16} />
        </button>
        {offset !== 0 && (
          <button type="button" onClick={() => setOffset(0)} style={styles.smallBtn}>{relativeWeek(home)}</button>
        )}
      </div>

      {ready && (
        <p style={styles.summary}>
          주 {week.lessons.length}교시
          {week.basis === 'base' && changedSlots > 0 && ` · 기초 시간표와 다른 수업 ${changedSlots}칸`}
        </p>
      )}
      {ready && week.error && <p style={styles.warn}>{week.error}. 전에 받은 시간표를 보여 줍니다.</p>}

      {body}

      {ready && (week.lessons.length > 0 || dropped.length > 0) && (
        <p style={styles.footnote}>
          {week.basis === 'base'
            ? '학교 기초 시간표를 그 주 나이스 시간표와 대조했습니다.'
            : timetableData?.source || !week.fromStore
              ? '담당 학급 표를 그 주 나이스 시간표와 맞췄습니다.'
              : '전에 받은 시간표입니다.'}
          {dropped.length > 0 && ' 줄 그은 수업은 그 주에 빠진 수업입니다.'}
          {week.fromStore
            ? ` 나이스 시간표를 ${NEIS_SYNC_LABEL} 다시 받습니다.`
            : ' 학교가 나이스 시간표를 바꾸면 달라질 수 있습니다.'}
          {week.fetchedAt && ` 갱신 ${format(new Date(week.fetchedAt), 'M/d HH:mm')}`}
        </p>
      )}
    </div>
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
    margin: 0,
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
  smallBtn: {
    padding: '3px 8px',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  weekNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px 2px',
    flexShrink: 0,
  },
  weekTitle: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: '0 6px',
    minWidth: 0,
  },
  weekLabel: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  relative: {
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--accent)',
    whiteSpace: 'nowrap',
  },
  summary: {
    margin: 0,
    padding: '0 12px 4px',
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  warn: {
    margin: 0,
    padding: '0 12px 4px',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--warning)',
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: '0 8px',
  },
  table: {
    width: '100%',
    tableLayout: 'fixed',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  corner: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: 'color-mix(in srgb, var(--bg-modal) 92%, transparent)',
  },
  dayHead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    padding: '3px 2px',
    background: 'color-mix(in srgb, var(--bg-modal) 92%, transparent)',
    textAlign: 'center',
    verticalAlign: 'top',
    fontWeight: 400,
  },
  todayHead: {
    // 머리는 표 위에 떠 있으므로 아래 칸이 비치지 않게 바탕을 깐다
    background: 'linear-gradient(var(--today-bg), var(--today-bg)), color-mix(in srgb, var(--bg-modal) 92%, transparent)',
  },
  dow: {
    display: 'block',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  date: {
    display: 'block',
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  offName: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--fs-caption)',
    fontWeight: 600,
    color: 'var(--weekend-text)',
  },
  periodHead: {
    padding: '2px 0',
    borderTop: '1px solid var(--grid-line)',
    textAlign: 'center',
    verticalAlign: 'middle',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    lineHeight: 1.15,
    color: 'var(--text-secondary)',
  },
  periodTime: {
    display: 'block',
    fontSize: 'var(--fs-caption)',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  cell: {
    height: 40,
    padding: 2,
    borderTop: '1px solid var(--grid-line)',
    boxShadow: 'inset 1px 0 0 var(--border-subtle)',
    verticalAlign: 'top',
  },
  todayCell: {
    background: 'var(--today-bg)',
  },
  offCell: {
    background: 'color-mix(in srgb, var(--weekend-text) 7%, transparent)',
  },
  lesson: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    padding: '2px 2px',
    marginBottom: 2,
    borderRadius: 5,
    background: 'color-mix(in oklab, var(--accent) 14%, transparent)',
    textAlign: 'center',
    lineHeight: 1.2,
    overflow: 'hidden',
  },
  lessonMoved: {
    background: 'color-mix(in oklab, var(--warning) 22%, transparent)',
  },
  lessonClass: {
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  lessonSubject: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    maxWidth: '100%',
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-secondary)',
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  tag: {
    fontSize: 'var(--fs-tiny)',
    fontWeight: 700,
    color: 'var(--warning)',
  },
  gone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1px 2px',
    marginBottom: 2,
    borderRadius: 5,
    border: '1px dashed var(--border-color)',
    textAlign: 'center',
    lineHeight: 1.2,
    overflow: 'hidden',
  },
  goneText: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-muted)',
    textDecoration: 'line-through',
  },
  goneNote: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--fs-tiny)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  footnote: {
    margin: 0,
    padding: '6px 12px 8px',
    fontSize: 'var(--fs-caption)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
    wordBreak: 'keep-all',
    flexShrink: 0,
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
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  empty: {
    margin: 0,
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    wordBreak: 'keep-all',
  },
  note: {
    margin: 0,
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
    wordBreak: 'keep-all',
  },
};

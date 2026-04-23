import React, { useState, useMemo, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import type { PersonalEvent, CalendarEvent, User } from '@shared/types';
import { getCreatorTag, PERSONAL_SUFFIX, formatEventTooltip, formatPersonalTooltip, canManageEvent } from '../../utils/calendarHelpers';
import { SchoolBadge } from '../common/SchoolBadge';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface TodayViewProps {
  onAddPersonalEvent?: () => void;
  onPersonalClick?: (pe: PersonalEvent) => void;
}

/**
 * 오늘부터 N일간의 일정을 리스트로 표시.
 * - 기본: 오늘 하루 (N=1)
 * - + 버튼: 표시 범위 +1일 (최대 30일)
 * - − 버튼: 표시 범위 −1일 (최소 1일)
 */
export function TodayView({ onAddPersonalEvent, onPersonalClick }: TodayViewProps = {}) {
  const { setSelectedEvent, setShowEventDetail, setShowEventModal } = useCalendarStore();
  const { user } = useAuthStore();
  const events = useVisibleEvents();
  const { allPersonalEvents } = usePersonalEventStore();
  const personalEvents = allPersonalEvents();

  const [days, setDays] = useState(1);

  // 날짜 배열 (오늘 ~ 오늘+days-1)
  const dateRange = useMemo(() => {
    const arr: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [days]);

  const rangeStart = dateRange[0];
  const rangeEnd = new Date(dateRange[dateRange.length - 1]);
  rangeEnd.setHours(23, 59, 59, 999);

  function eventsOnDate(date: Date) {
    const t = new Date(date); t.setHours(12, 0, 0, 0);
    const shared = events.filter((e) => {
      const s = new Date(e.startDate); s.setHours(0, 0, 0, 0);
      const en = new Date(e.endDate); en.setHours(23, 59, 59, 999);
      return t >= s && t <= en;
    }).sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
    const personal = personalEvents.filter((pe) => {
      const s = new Date(pe.startDate); s.setHours(0, 0, 0, 0);
      const en = new Date(pe.endDate); en.setHours(23, 59, 59, 999);
      return t >= s && t <= en;
    }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return { shared, personal };
  }

  // 날짜별 일정 목록 사전 계산 (JSX에서 재사용 → totalCount 계산과 합침)
  const dayEventsMap = useMemo(() => {
    const map = new Map<string, { shared: CalendarEvent[]; personal: PersonalEvent[] }>();
    for (const d of dateRange) {
      map.set(d.toISOString(), eventsOnDate(d));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, events, personalEvents]);

  const totalCount = useMemo(() => {
    let n = 0;
    for (const v of dayEventsMap.values()) n += v.shared.length + v.personal.length;
    return n;
  }, [dayEventsMap]);

  const rangeLabel = days === 1
    ? format(rangeStart, 'M월 d일 (EEE)', { locale: ko })
    : `${format(rangeStart, 'M/d')} – ${format(dateRange[dateRange.length - 1], 'M/d')}`;

  return (
    <div style={styles.container}>
      {/* 범위 조절 바 */}
      <div style={styles.navBar}>
        <button
          onClick={() => setDays((n) => Math.max(1, n - 1))}
          style={{ ...styles.navBtn, opacity: days <= 1 ? 0.4 : 1 }}
          disabled={days <= 1}
          title="표시 일수 −1"
          aria-label="표시 일수 줄이기"
        >
          −
        </button>
        <div style={styles.dateBlock}>
          <div style={styles.dateMain}>
            {days === 1 ? '오늘' : `오늘부터 ${days}일`}
          </div>
          <div style={styles.dateSub}>
            {rangeLabel} · 일정 {totalCount}건
          </div>
        </div>
        <button
          onClick={() => setDays((n) => Math.min(30, n + 1))}
          style={{ ...styles.navBtn, opacity: days >= 30 ? 0.4 : 1 }}
          disabled={days >= 30}
          title="표시 일수 +1 (최대 30일)"
          aria-label="표시 일수 늘리기"
        >
          +
        </button>
      </div>

      {/* days === 1: 24시간 타임라인 */}
      {days === 1 ? (
        <DayTimeline
          date={rangeStart}
          events={dayEventsMap.get(rangeStart.toISOString())?.shared || []}
          personalEvents={dayEventsMap.get(rangeStart.toISOString())?.personal || []}
          user={user}
          onEventClick={(e) => { setSelectedEvent(e); setShowEventDetail(true); }}
          onPersonalClick={(pe) => onPersonalClick?.(pe)}
          onAddShared={() => setShowEventModal(true)}
          onAddPersonal={onAddPersonalEvent}
        />
      ) : (
      <div style={styles.list}>
        {totalCount === 0 && (
          <div style={styles.empty}>
            <span style={{ fontSize: 36 }}>📭</span>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              이 기간에는 일정이 없습니다
            </div>
            {user && (
              <div style={styles.emptyActions}>
                <button onClick={() => setShowEventModal(true)} style={styles.addBtn}>+ 공유 일정</button>
                {onAddPersonalEvent && (
                  <button onClick={onAddPersonalEvent} style={styles.addBtnSecondary}>+ 개인 일정</button>
                )}
              </div>
            )}
          </div>
        )}

        {dateRange.map((d) => {
          const { shared, personal } = dayEventsMap.get(d.toISOString()) || { shared: [], personal: [] };
          const count = shared.length + personal.length;
          if (days > 1 && count === 0) {
            // 다일 뷰에서 빈 날도 헤더는 표시
            return (
              <div key={d.toISOString()} style={styles.dateGroup}>
                <DateHeader date={d} count={0} />
                <div style={styles.emptyRow}>일정 없음</div>
              </div>
            );
          }
          if (count === 0) return null;
          return (
            <div key={d.toISOString()} style={styles.dateGroup}>
              {days > 1 && <DateHeader date={d} count={count} />}
              {shared.map((event) => (
                <SharedRow
                  key={event.id}
                  event={event}
                  user={user}
                  onClick={() => { setSelectedEvent(event); setShowEventDetail(true); }}
                />
              ))}
              {personal.map((pe) => (
                <PersonalRow
                  key={pe.id}
                  pe={pe}
                  onClick={() => onPersonalClick?.(pe)}
                />
              ))}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

/**
 * 24시간 타임라인 — 하루 일정을 시간별 블록으로 표시.
 * 각 이벤트는 시작~종료 시간에 비례한 높이로 렌더링.
 * 종일 일정은 상단에 배지로 표시.
 */
function DayTimeline({
  date, events, personalEvents, user,
  onEventClick, onPersonalClick, onAddShared, onAddPersonal,
}: {
  date: Date;
  events: CalendarEvent[];
  personalEvents: PersonalEvent[];
  user: User | null;
  onEventClick: (e: CalendarEvent) => void;
  onPersonalClick: (pe: PersonalEvent) => void;
  onAddShared: () => void;
  onAddPersonal?: () => void;
}) {
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay);
  const allDayPersonal = personalEvents.filter((pe) => pe.allDay);
  const timedPersonal = personalEvents.filter((pe) => !pe.allDay);

  const isToday = isSameDay(date, new Date());
  const [nowMinute, setNowMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    if (!isToday) return;
    const timer = setInterval(() => {
      const now = new Date();
      setNowMinute(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, [isToday]);

  // 각 이벤트를 픽셀 위치/높이로 계산 (1시간 = 48px)
  const HOUR_HEIGHT = 48;

  function getBlockStyle(start: Date, end: Date): React.CSSProperties {
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = Math.max(startMin + 15, end.getHours() * 60 + end.getMinutes());
    const top = (startMin / 60) * HOUR_HEIGHT;
    const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
    return { top, height: Math.max(20, height) };
  }

  return (
    <div style={timelineStyles.container}>
      {/* 종일 이벤트 영역 */}
      {(allDayEvents.length > 0 || allDayPersonal.length > 0) && (
        <div style={timelineStyles.allDayBar}>
          <span style={timelineStyles.allDayLabel}>종일</span>
          <div style={timelineStyles.allDayChips}>
            {allDayEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => onEventClick(e)}
                style={{ ...timelineStyles.allDayChip, background: e.adminColor }}
                title={formatEventTooltip(e, canManageEvent(e, user))}
              >
                {getCreatorTag(e) && <SchoolBadge school={e.creatorSchool || e.school} />}
                {e.title}
              </button>
            ))}
            {allDayPersonal.map((pe) => (
              <button
                key={pe.id}
                onClick={() => onPersonalClick(pe)}
                style={{ ...timelineStyles.allDayChip, background: pe.color, opacity: 0.9 }}
                title={formatPersonalTooltip(pe, pe.source === 'local')}
              >
                {pe.title} {PERSONAL_SUFFIX}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 24시간 그리드 */}
      <div style={timelineStyles.gridScroll}>
        <div style={{ position: 'relative', height: HOUR_HEIGHT * 24 }}>
          {/* 시간 격자 */}
          {HOURS.map((h) => (
            <div
              key={h}
              style={{
                position: 'absolute',
                top: h * HOUR_HEIGHT,
                left: 0, right: 0, height: HOUR_HEIGHT,
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
              }}
            >
              <div style={timelineStyles.hourLabel}>
                {h.toString().padStart(2, '0')}:00
              </div>
              <div style={{ flex: 1 }} />
            </div>
          ))}

          {/* 현재 시간선 */}
          {isToday && (
            <div style={{
              position: 'absolute',
              left: 52, right: 4,
              top: (nowMinute / 60) * HOUR_HEIGHT,
              height: 2,
              background: '#E74C3C',
              zIndex: 5,
              boxShadow: '0 0 4px rgba(231,76,60,0.6)',
              pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute',
                left: -5, top: -4,
                width: 10, height: 10,
                borderRadius: '50%',
                background: '#E74C3C',
              }} />
              <div style={{
                position: 'absolute',
                right: 0, top: -16,
                fontSize: 10, fontWeight: 700,
                color: '#E74C3C',
                padding: '0 4px',
                background: 'var(--bg-primary, #fff)',
                borderRadius: 3,
              }}>
                {Math.floor(nowMinute / 60).toString().padStart(2, '0')}:{(nowMinute % 60).toString().padStart(2, '0')}
              </div>
            </div>
          )}

          {/* 시간 블록 이벤트 */}
          <div style={{ position: 'absolute', left: 52, right: 4, top: 0, bottom: 0 }}>
            {timedEvents.map((e) => {
              const start = new Date(e.startDate);
              const end = new Date(e.endDate);
              const block = getBlockStyle(start, end);
              return (
                <button
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  style={{
                    ...timelineStyles.eventBlock,
                    ...block,
                    background: e.adminColor,
                  }}
                  title={formatEventTooltip(e, canManageEvent(e, user))}
                >
                  <div style={timelineStyles.eventTitle}>
                    {getCreatorTag(e) && <SchoolBadge school={e.creatorSchool || e.school} />}
                    {e.title}
                  </div>
                  <div style={timelineStyles.eventTime}>
                    {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
                    {e.adminName && ` · ${e.adminName}`}
                  </div>
                </button>
              );
            })}
            {timedPersonal.map((pe) => {
              const start = new Date(pe.startDate);
              const end = new Date(pe.endDate);
              const block = getBlockStyle(start, end);
              return (
                <button
                  key={pe.id}
                  onClick={() => onPersonalClick(pe)}
                  style={{
                    ...timelineStyles.eventBlock,
                    ...block,
                    background: pe.color,
                    opacity: 0.88,
                    borderLeft: '3px solid rgba(255,255,255,0.5)',
                  }}
                  title={formatPersonalTooltip(pe, pe.source === 'local')}
                >
                  <div style={timelineStyles.eventTitle}>
                    {pe.title} {PERSONAL_SUFFIX}
                  </div>
                  <div style={timelineStyles.eventTime}>
                    {format(start, 'HH:mm')} – {format(end, 'HH:mm')} · 개인
                  </div>
                </button>
              );
            })}
          </div>

          {/* 빈 상태 */}
          {events.length === 0 && personalEvents.length === 0 && user && (
            <div style={{
              position: 'absolute',
              top: 12 * HOUR_HEIGHT - 40,
              left: 60, right: 10,
              textAlign: 'center',
              zIndex: 2,
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                📭 오늘 일정 없음
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button onClick={onAddShared} style={timelineStyles.addBtn}>+ 공유 일정</button>
                {onAddPersonal && (
                  <button onClick={onAddPersonal} style={timelineStyles.addBtnSecondary}>+ 개인 일정</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const timelineStyles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  allDayBar: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  allDayLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-muted)',
    padding: '3px 6px',
    flexShrink: 0,
  },
  allDayChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
    flex: 1,
  },
  allDayChip: {
    border: 'none',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    textShadow: '0 0 2px rgba(0,0,0,0.3)',
  },
  gridScroll: {
    flex: 1,
    overflow: 'auto',
  },
  hourLabel: {
    width: 48,
    flexShrink: 0,
    fontSize: 10,
    color: 'var(--text-muted)',
    padding: '2px 4px 0 0',
    textAlign: 'right' as const,
  },
  eventBlock: {
    position: 'absolute' as const,
    left: 2, right: 2,
    padding: '3px 6px',
    borderRadius: 5,
    border: 'none',
    cursor: 'pointer',
    color: '#fff',
    textAlign: 'left' as const,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  eventTitle: {
    fontSize: 11,
    fontWeight: 700,
    textShadow: '0 0 2px rgba(0,0,0,0.3)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  eventTime: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: 500,
  },
  addBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  addBtnSecondary: {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--success, #10B981)',
    background: 'transparent',
    color: 'var(--success, #10B981)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

function DateHeader({ date, count }: { date: Date; count: number }) {
  const today = isSameDay(date, new Date());
  return (
    <div style={styles.dateHeader}>
      <span style={{
        ...styles.dateHeaderMain,
        color: today ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {format(date, 'M/d (EEE)', { locale: ko })}
        {today && <span style={styles.todayBadge}>오늘</span>}
      </span>
      <span style={styles.dateHeaderCount}>{count}건</span>
    </div>
  );
}

function SharedRow({ event, user, onClick }: { event: CalendarEvent; user: User | null; onClick: () => void }): React.ReactElement {
  const isOwner = canManageEvent(event, user);
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const timeText = event.allDay ? '종일' : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
  const creatorSchool = event.creatorSchool || event.school;
  return (
    <button
      onClick={onClick}
      style={{ ...styles.row, borderLeft: `4px solid ${event.adminColor}` }}
      title={formatEventTooltip(event, isOwner)}
    >
      <span style={styles.time}>{timeText}</span>
      <span style={styles.title}>
        <SchoolBadge school={creatorSchool} />
        {event.title}
      </span>
      {event.adminName && <span style={styles.author}>· {event.adminName}</span>}
    </button>
  );
}

function PersonalRow({ pe, onClick }: { pe: PersonalEvent; onClick: () => void }) {
  const start = new Date(pe.startDate);
  const end = new Date(pe.endDate);
  const timeText = pe.allDay ? '종일' : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
  const canDrag = pe.source === 'local';
  return (
    <button
      onClick={onClick}
      style={{ ...styles.row, borderLeft: `4px solid ${pe.color}`, opacity: 0.92 }}
      title={formatPersonalTooltip(pe, canDrag)}
    >
      <span style={styles.time}>{timeText}</span>
      <span style={styles.title}>
        {pe.title} <span style={styles.personalTag}>{PERSONAL_SUFFIX}</span>
      </span>
      <span style={styles.author}>· 개인</span>
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  navBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 8px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: 20,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  dateBlock: {
    flex: 1,
    textAlign: 'center' as const,
  },
  dateMain: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  dateSub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: 500,
    color: 'var(--text-muted)',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  dateGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  dateHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    marginBottom: 2,
  },
  dateHeaderMain: {
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  todayBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#fff',
  },
  dateHeaderCount: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: 'var(--bg-secondary)',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background 0.15s',
    width: '100%',
  },
  time: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    minWidth: 92,
    fontVariantNumeric: 'tabular-nums' as any,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tag: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 5px',
    marginRight: 6,
    borderRadius: 4,
    background: 'var(--accent)',
    color: '#fff',
  },
  personalTag: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: 4,
    background: 'var(--success, #10B981)',
    color: '#fff',
    marginLeft: 4,
  },
  author: {
    fontSize: 11,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  empty: {
    padding: '40px 16px',
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
  },
  emptyRow: {
    padding: '6px 12px',
    fontSize: 11,
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
  },
  emptyActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
  },
  addBtn: {
    padding: '6px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  addBtnSecondary: {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid var(--success, #10B981)',
    background: 'transparent',
    color: 'var(--success, #10B981)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

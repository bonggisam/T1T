import React, { useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const CATEGORY_LABELS: Record<string, string> = {
  event: '행사',
  meeting: '회의',
  deadline: '마감일',
  notice: '공지',
  other: '기타',
};

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

interface PrintViewProps {
  onClose: () => void;
}

export function PrintView({ onClose }: PrintViewProps) {
  const { events, currentMonth } = useCalendarStore();
  const { personalEvents, externalEvents } = usePersonalEventStore();
  const printRef = useRef<HTMLDivElement>(null);

  const allPersonal = [...personalEvents, ...externalEvents];

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // 주 단위로 분리
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  function getEventsForDay(day: Date): CalendarEvent[] {
    return events.filter((e) => {
      const start = e.startDate instanceof Date ? e.startDate : new Date(e.startDate);
      const end = e.endDate instanceof Date ? e.endDate : new Date(e.endDate);
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      return start <= dayEnd && end >= dayStart;
    });
  }

  function getPersonalForDay(day: Date): PersonalEvent[] {
    return allPersonal.filter((e) => {
      const start = e.startDate instanceof Date ? e.startDate : new Date(e.startDate);
      const end = e.endDate instanceof Date ? e.endDate : new Date(e.endDate);
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      return start <= dayEnd && end >= dayStart;
    });
  }

  // 이번 달 전체 일정 목록 (인쇄 하단에 상세 표시)
  const monthEvents = events.filter((e) => {
    const start = e.startDate instanceof Date ? e.startDate : new Date(e.startDate);
    return start >= monthStart && start <= monthEnd;
  }).sort((a, b) => {
    const ta = a.startDate instanceof Date ? a.startDate.getTime() : new Date(a.startDate).getTime();
    const tb = b.startDate instanceof Date ? b.startDate.getTime() : new Date(b.startDate).getTime();
    return ta - tb;
  });

  function handlePrint() {
    window.print();
  }

  return (
    <div style={styles.overlay}>
      {/* 인쇄 안 되는 컨트롤 바 */}
      <div style={styles.toolbar} className="no-print">
        <span style={styles.toolbarTitle}>인쇄 미리보기</span>
        <div style={styles.toolbarActions}>
          <button onClick={handlePrint} style={styles.printBtn}>🖨️ 인쇄</button>
          <button onClick={onClose} style={styles.closeBtn}>닫기</button>
        </div>
      </div>

      {/* 인쇄 영역 */}
      <div ref={printRef} className="print-area" style={styles.printArea}>
        {/* 헤더 */}
        <div style={styles.printHeader}>
          <h1 style={styles.printTitle}>
            {format(currentMonth, 'yyyy년 M월', { locale: ko })} 일정표
          </h1>
          <p style={styles.printSubtitle}>
            ToneT | 출력일: {format(new Date(), 'yyyy.MM.dd', { locale: ko })}
          </p>
        </div>

        {/* 캘린더 그리드 */}
        <table style={styles.table}>
          <thead>
            <tr>
              {DAY_NAMES.map((name, i) => (
                <th
                  key={name}
                  style={{
                    ...styles.th,
                    color: i === 0 ? '#E74C3C' : i === 6 ? '#3498DB' : '#333',
                  }}
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  const inMonth = isSameMonth(day, currentMonth);
                  const today = isToday(day);
                  const dayEvents = getEventsForDay(day);
                  const dayPersonal = getPersonalForDay(day);

                  return (
                    <td
                      key={di}
                      style={{
                        ...styles.td,
                        opacity: inMonth ? 1 : 0.3,
                        background: today ? '#EBF5FB' : 'transparent',
                      }}
                    >
                      <div style={{
                        ...styles.dayNumber,
                        color: di === 0 ? '#E74C3C' : di === 6 ? '#3498DB' : '#333',
                        fontWeight: today ? 800 : 500,
                      }}>
                        {format(day, 'd')}
                      </div>
                      {dayEvents.slice(0, 4).map((e) => (
                        <div key={e.id} style={styles.eventDot}>
                          <span style={{ ...styles.dot, background: e.adminColor }} />
                          <span style={styles.eventTitle}>{e.title}</span>
                        </div>
                      ))}
                      {dayPersonal.slice(0, 2).map((e) => (
                        <div key={e.id} style={styles.eventDot}>
                          <span style={{ ...styles.dot, background: e.color }} />
                          <span style={{ ...styles.eventTitle, fontStyle: 'italic' }}>{e.title}</span>
                        </div>
                      ))}
                      {(dayEvents.length > 4 || dayPersonal.length > 2) && (
                        <div style={styles.moreText}>
                          +{dayEvents.length - 4 + Math.max(0, dayPersonal.length - 2)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* 상세 일정 목록 */}
        {monthEvents.length > 0 && (
          <div style={styles.detailSection}>
            <h2 style={styles.detailTitle}>상세 일정 목록</h2>
            <table style={styles.detailTable}>
              <thead>
                <tr>
                  <th style={styles.detailTh}>날짜</th>
                  <th style={styles.detailTh}>분류</th>
                  <th style={styles.detailTh}>제목</th>
                  <th style={styles.detailTh}>시간</th>
                  <th style={styles.detailTh}>등록자</th>
                </tr>
              </thead>
              <tbody>
                {monthEvents.map((e) => {
                  const start = e.startDate instanceof Date ? e.startDate : new Date(e.startDate);
                  const end = e.endDate instanceof Date ? e.endDate : new Date(e.endDate);
                  return (
                    <tr key={e.id}>
                      <td style={styles.detailTd}>{format(start, 'M/d(EEE)', { locale: ko })}</td>
                      <td style={styles.detailTd}>{CATEGORY_LABELS[e.category] || e.category}</td>
                      <td style={{ ...styles.detailTd, fontWeight: 600 }}>{e.title}</td>
                      <td style={styles.detailTd}>
                        {e.allDay ? '종일' : `${format(start, 'HH:mm')}~${format(end, 'HH:mm')}`}
                      </td>
                      <td style={styles.detailTd}>{e.adminName || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: '#fff',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderBottom: '1px solid #ddd',
    background: '#f8f8f8',
    flexShrink: 0,
  },
  toolbarTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#333',
  },
  toolbarActions: {
    display: 'flex',
    gap: 8,
  },
  printBtn: {
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: '#4A90E2',
    color: '#fff',
    cursor: 'pointer',
  },
  closeBtn: {
    padding: '6px 16px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 6,
    background: '#fff',
    color: '#666',
    cursor: 'pointer',
  },
  printArea: {
    flex: 1,
    padding: '20px 24px',
    background: '#fff',
    color: '#000',
  },
  printHeader: {
    textAlign: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '2px solid #333',
  },
  printTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#111',
    margin: 0,
  },
  printSubtitle: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  },
  th: {
    padding: '6px 4px',
    fontSize: 11,
    fontWeight: 700,
    borderBottom: '2px solid #333',
    textAlign: 'center',
  },
  td: {
    border: '1px solid #ddd',
    padding: '4px',
    verticalAlign: 'top',
    height: 70,
    fontSize: 9,
  },
  dayNumber: {
    fontSize: 12,
    marginBottom: 2,
  },
  eventDot: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    marginBottom: 1,
    lineHeight: 1.2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    flexShrink: 0,
  },
  eventTitle: {
    fontSize: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  moreText: {
    fontSize: 7,
    color: '#999',
    marginTop: 1,
  },
  detailSection: {
    marginTop: 20,
    pageBreakBefore: 'auto',
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#111',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: '1px solid #333',
  },
  detailTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 10,
  },
  detailTh: {
    padding: '4px 6px',
    fontWeight: 700,
    borderBottom: '1px solid #999',
    textAlign: 'left',
    color: '#333',
  },
  detailTd: {
    padding: '3px 6px',
    borderBottom: '1px solid #eee',
    color: '#333',
  },
};

import React from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useDutyStore } from '../../store/dutyStore';
import { useDisableClickThrough } from '../../hooks/useDisableClickThrough';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { dutyPeriodLabel } from '../../utils/dutyEntries';
import { Ic } from '../common/Ic';

/** 달력에서 내 시험감독 차례를 눌렀을 때. 표에서 온 값이라 여기서 고치지 않고 표로 안내한다. */
export function DutyEntryDetail({ onOpenTable }: { onOpenTable: () => void }) {
  const event = useCalendarStore((s) => s.selectedEvent);
  const setShowEventDetail = useCalendarStore((s) => s.setShowEventDetail);
  const setSelectedEvent = useCalendarStore((s) => s.setSelectedEvent);
  const setFocusTable = useDutyStore((s) => s.setFocusTable);

  function close() {
    setShowEventDetail(false);
    setSelectedEvent(null);
  }

  useEscapeKey(close);
  useDisableClickThrough();

  if (!event?.duty) return null;
  const { duty } = event;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const period = dutyPeriodLabel(duty);
  const time = event.allDay ? '' : `${format(start, 'HH:mm')}~${format(end, 'HH:mm')}`;

  return (
    <div style={styles.overlay} onClick={close} role="dialog" aria-modal="true" aria-label="내 시험감독 차례">
      <div className="glass-solid animate-slide-up" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>{duty.kind || '시험감독'}</h3>
          <button onClick={close} style={styles.closeBtn} aria-label="닫기"><Ic name="x" gap={false} /></button>
        </div>
        <p style={styles.line}><Ic name="calendar" />{format(start, 'M월 d일 (EEEE)', { locale: ko })}</p>
        {(period || time) && <p style={styles.line}><Ic name="clock" />{[period, time].filter(Boolean).join(' ')}</p>}
        {!period && !time && <p style={styles.line}><Ic name="clock" />하루 종일</p>}
        {duty.place && <p style={styles.line}><Ic name="pin" />{duty.place}</p>}
        <p style={styles.source}>{duty.tableTitle} · 작성 {event.adminName}</p>
        <div style={styles.actions}>
          <button
            type="button"
            style={styles.primary}
            onClick={() => {
              setFocusTable(duty.tableId);
              close();
              onOpenTable();
            }}
          >
            표 보기
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
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 14,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
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
  line: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-primary)',
  },
  source: {
    marginTop: 2,
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  primary: {
    padding: '5px 14px',
    border: 'none',
    borderRadius: 7,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

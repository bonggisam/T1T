import React from 'react';
import { ClipboardCheck, Lock } from 'lucide-react';
import type { CalendarEvent, PersonalEvent } from '@shared/types';
import { canManageEvent, formatEventTooltip, formatPersonalTooltip, getSchoolTag } from '../../utils/calendarHelpers';
import { assistClass, personalChipVars, sharedChipVars } from '../../utils/eventColors';
import { useAuthStore } from '../../store/authStore';

interface ChipCommon {
  /** 시작 시각을 제목 앞에 적는다 */
  showTime?: boolean;
  continuesLeft?: boolean;
  continuesRight?: boolean;
  style?: React.CSSProperties;
  dragging?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

function timeLabel(start: Date, allDay: boolean, showTime?: boolean): string | null {
  if (!showTime || allDay) return null;
  return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
}

function classes(props: ChipCommon): string {
  return `ev${props.continuesLeft ? ' cl' : ''}${props.continuesRight ? ' cr' : ''}${props.dragging ? ' dragging' : ''}`;
}

/** 공유 일정 칩: 연한 바탕, 왼쪽 띠, 학교 글자 */
export function SharedChip({ event, ...props }: ChipCommon & { event: CalendarEvent }) {
  const user = useAuthStore((s) => s.user);
  const canMove = canManageEvent(event, user);
  const time = timeLabel(new Date(event.startDate), event.allDay, props.showTime);
  return (
    <button
      type="button"
      className={`${classes(props)}${assistClass(event)}`}
      style={{ ...sharedChipVars(event), cursor: canMove ? 'grab' : 'pointer', ...props.style }}
      title={formatEventTooltip(event, canMove)}
      onMouseDown={props.onMouseDown}
      onClick={props.onClick}
    >
      {event.duty
        ? <ClipboardCheck size="0.95em" strokeWidth={2.4} aria-label="내 감독·당직 차례" style={{ flexShrink: 0 }} />
        : <span className="ltr">{getSchoolTag(event.school)}</span>}
      {time && <span className="tm">{time}</span>}
      <span className="tt">{event.title}</span>
    </button>
  );
}

/** 개인 일정 칩: 교사가 고른 색, 자물쇠 */
export function PersonalChip({ event, ...props }: ChipCommon & { event: PersonalEvent }) {
  const user = useAuthStore((s) => s.user);
  const canMove = event.source === 'local';
  const time = timeLabel(new Date(event.startDate), event.allDay, props.showTime);
  return (
    <button
      type="button"
      className={classes(props)}
      style={{ ...personalChipVars(event, user?.profileColor), cursor: canMove ? 'grab' : 'pointer', ...props.style }}
      title={formatPersonalTooltip(event, canMove)}
      onMouseDown={props.onMouseDown}
      onClick={props.onClick}
    >
      <Lock size="0.85em" strokeWidth={2.4} aria-label="개인 일정" style={{ flexShrink: 0 }} />
      {time && <span className="tm">{time}</span>}
      <span className="tt">{event.title}</span>
    </button>
  );
}

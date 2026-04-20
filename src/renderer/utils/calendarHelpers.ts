import { format } from 'date-fns';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

export const CATEGORY_LABELS: Record<string, string> = {
  event: '행사',
  meeting: '회의',
  deadline: '마감일',
  notice: '공지',
  other: '기타',
};

export function formatEventTooltip(event: CalendarEvent, isOwner: boolean): string {
  const lines: string[] = [event.title];
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (event.allDay) {
    lines.push(`종일 | ${format(start, 'M/d')} ~ ${format(end, 'M/d')}`);
  } else {
    lines.push(`${format(start, 'M/d HH:mm')} ~ ${format(end, 'M/d HH:mm')}`);
  }
  if (event.category) lines.push(`[${CATEGORY_LABELS[event.category] || event.category}]`);
  if (event.adminName) lines.push(`작성: ${event.adminName}`);
  if (event.description) lines.push(`\n${event.description}`);
  if (isOwner) lines.push('\n🖱 드래그로 이동 | 하단 드래그로 시간 조절');
  return lines.join('\n');
}

export function formatPersonalTooltip(pe: PersonalEvent, canDrag: boolean): string {
  const lines: string[] = [`${pe.title} (개인)`];
  const start = new Date(pe.startDate);
  const end = new Date(pe.endDate);
  lines.push(`${format(start, 'M/d HH:mm')} ~ ${format(end, 'M/d HH:mm')}`);
  if (pe.description) lines.push(`\n${pe.description}`);
  if (canDrag) lines.push('\n🖱 드래그로 이동 | 하단 드래그로 시간 조절');
  return lines.join('\n');
}

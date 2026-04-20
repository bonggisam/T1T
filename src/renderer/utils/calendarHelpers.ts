import { format } from 'date-fns';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

/**
 * 이벤트(시작~종료 범위)가 주어진 날짜에 걸쳐있는지 확인.
 * 모든 뷰에서 공통으로 사용.
 */
export function isEventOnDate(event: { startDate: Date | string; endDate: Date | string }, date: Date): boolean {
  const start = event.startDate instanceof Date ? event.startDate : new Date(event.startDate);
  const end = event.endDate instanceof Date ? event.endDate : new Date(event.endDate);
  const target = new Date(date);
  // 날짜 범위 비교 (시간 무시)
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(23, 59, 59, 999);
  const d = new Date(target); d.setHours(12, 0, 0, 0);
  return d >= s && d <= e;
}

/**
 * Date | string 을 안전하게 Date로 변환.
 */
export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Firestore Timestamp | Date | string 을 Date로 변환.
 * fallback null 허용.
 */
export function firestoreToDate(value: any, fallback: Date | null = null): Date | null {
  if (!value) return fallback;
  // Firestore Timestamp: toDate() 메서드 보유
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

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

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

/**
 * 일정의 school 값에 따라 '[중]', '[고]', '[공통]' 같은 접두 태그 반환.
 * 'all' (전체 공유)은 공통, undefined/invalid는 빈 문자열.
 */
export function getSchoolTag(school?: string | null): string {
  if (school === 'taeseong_middle') return '[중]';
  if (school === 'taeseong_high') return '[고]';
  if (school === 'all') return '[공통]';
  return '';
}

/**
 * 이벤트 제목 앞에 학교 태그 붙이기 (문자열 반환).
 * JSX에서는 {getSchoolTag(e.school)} {e.title} 패턴 사용 권장 — 조건부 렌더링 유리.
 * 이 함수는 알림 메시지/툴팁/export 등 string 컨텍스트에서 유용.
 */
export function formatTitleWithSchool(title: string, school?: string | null): string {
  const tag = getSchoolTag(school);
  return tag ? `${tag} ${title}` : title;
}

/**
 * 일정을 수정/삭제할 수 있는 권한 체크.
 * - 작성자 본인
 * - admin / super_admin은 모든 일정 관리 가능
 */
export function canManageEvent(
  event: { createdBy: string },
  user?: { id: string; role?: string } | null,
): boolean {
  if (!user) return false;
  if (user.id === event.createdBy) return true;
  return user.role === 'admin' || user.role === 'super_admin';
}

export function formatEventTooltip(event: CalendarEvent, isOwner: boolean): string {
  const tag = getSchoolTag(event.school);
  const lines: string[] = [tag ? `${tag} ${event.title}` : event.title];
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

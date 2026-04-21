import { format } from 'date-fns';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

/**
 * 타임존 정책: 모든 날짜는 사용자의 로컬 타임존 기준으로 표시.
 * Firestore Timestamp는 내부적으로 UTC 저장되지만, toDate()는 로컬 Date 반환.
 * new Date(string/number)도 로컬 타임존 해석.
 * 다국가 환경에서는 Intl.DateTimeFormat 적용 고려 필요 (현재 범위 아님).
 */

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
 * 일정 **작성자**의 학교에 따라 'M', 'H' 접두 태그 반환.
 * - creatorSchool 'taeseong_middle' → 'M'
 * - creatorSchool 'taeseong_high' → 'H'
 * - 기타 (super_admin 등) → ''
 *
 * 하위 호환: 기존 event.school 기반 호출도 동작 (이전 데이터용).
 */
export function getSchoolTag(school?: string | null): string {
  if (school === 'taeseong_middle') return 'M';
  if (school === 'taeseong_high') return 'H';
  return ''; // 'all' 또는 미지정은 태그 없음
}

/** 개인 일정 접미 태그 */
export const PERSONAL_SUFFIX = 'P';

/**
 * 공유 일정 작성자 태그 추출.
 * creatorSchool이 있으면 그것 우선, 없으면 event.school fallback (이전 데이터).
 */
export function getCreatorTag(event: { creatorSchool?: string; school?: string }): string {
  return getSchoolTag(event.creatorSchool || event.school);
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
  const tag = getCreatorTag(event);
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
  const lines: string[] = [`${pe.title} ${PERSONAL_SUFFIX} (개인)`];
  const start = new Date(pe.startDate);
  const end = new Date(pe.endDate);
  lines.push(`${format(start, 'M/d HH:mm')} ~ ${format(end, 'M/d HH:mm')}`);
  if (pe.description) lines.push(`\n${pe.description}`);
  if (canDrag) lines.push('\n🖱 드래그로 이동 | 하단 드래그로 시간 조절');
  return lines.join('\n');
}

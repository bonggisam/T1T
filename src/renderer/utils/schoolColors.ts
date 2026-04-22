import type { School } from '@shared/types';

/**
 * 학교별 대표 색상 팔레트.
 * - 중학교: 초록 계열 (성장·젊음)
 * - 고등학교: 보라 계열 (지성·성숙)
 * - 공통(all): 파랑 계열 (통합)
 *
 * 이벤트 색상 자동 제안, 학교 태그 강조 표시 등에 사용.
 */
export const SCHOOL_COLORS: Record<School | 'all', { primary: string; light: string; text: string; label: string }> = {
  taeseong_middle: {
    primary: '#10B981', // emerald-500
    light: '#D1FAE5',
    text: '#065F46',
    label: '태성중',
  },
  taeseong_high: {
    primary: '#8B5CF6', // violet-500
    light: '#EDE9FE',
    text: '#5B21B6',
    label: '태성고',
  },
  all: {
    primary: '#3B82F6', // blue-500
    light: '#DBEAFE',
    text: '#1E40AF',
    label: '공통',
  },
};

/**
 * 학교별 기본 adminColor 제안.
 * SignupForm / EventModal에서 색상 기본값으로 사용 가능.
 */
export function getDefaultColorForSchool(school?: School | 'all' | null): string {
  if (!school) return SCHOOL_COLORS.all.primary;
  return SCHOOL_COLORS[school]?.primary || SCHOOL_COLORS.all.primary;
}

/**
 * 공통 행사 프리셋 — 두 학교 공동으로 자주 쓰이는 일정 템플릿.
 * EventModal의 빠른 선택 드롭다운에 사용.
 */
export const COMMON_EVENT_TEMPLATES: {
  key: string;
  title: string;
  category: 'event' | 'meeting' | 'deadline' | 'notice' | 'other';
  school: 'all';
  description: string;
}[] = [
  { key: 'joint_meeting', title: '중·고 공동 회의', category: 'meeting', school: 'all', description: '태성중·고 공동 회의' },
  { key: 'joint_event', title: '중·고 공동 행사', category: 'event', school: 'all', description: '' },
  { key: 'exam_period', title: '시험 기간', category: 'deadline', school: 'all', description: '' },
  { key: 'holiday', title: '학교 휴업일', category: 'notice', school: 'all', description: '' },
  { key: 'faculty_meeting', title: '교직원 회의', category: 'meeting', school: 'all', description: '' },
  { key: 'orientation', title: '입학·졸업식', category: 'event', school: 'all', description: '' },
];

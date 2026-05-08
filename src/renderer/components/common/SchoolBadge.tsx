import React from 'react';
import { SCHOOL_COLORS } from '../../utils/schoolColors';

/**
 * 일정의 공유 대상(school scope) 배지.
 * - 'taeseong_middle' → 중 (초록)
 * - 'taeseong_high' → 고 (보라)
 * - 'all' → 공 (파랑)  공통 일정
 *
 * 작성자(creatorSchool)가 아니라 일정 자체의 scope를 표시.
 */
export function SchoolBadge({ school, size = 'sm' }: { school?: string; size?: 'xs' | 'sm' | 'md' }) {
  if (school !== 'taeseong_middle' && school !== 'taeseong_high' && school !== 'all') return null;
  const palette = SCHOOL_COLORS[school];
  const sizeStyles = size === 'xs'
    ? { fontSize: 8, padding: '0 3px' }
    : size === 'md'
      ? { fontSize: 10, padding: '1px 6px' }
      : { fontSize: 9, padding: '1px 5px' };
  const label = school === 'taeseong_middle' ? '중'
    : school === 'taeseong_high' ? '고'
    : '공';
  return (
    <span style={{
      display: 'inline-block',
      ...sizeStyles,
      fontWeight: 800,
      marginRight: 4,
      borderRadius: 3,
      background: palette.primary,
      color: '#fff',
      lineHeight: 1.4,
      verticalAlign: 'middle',
    }}>
      {label}
    </span>
  );
}

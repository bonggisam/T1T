import React from 'react';
import { SCHOOL_COLORS } from '../../utils/schoolColors';

/**
 * 학교 구분 배지 — 중(M 초록) / 고(H 보라) 색상 구분.
 * 공유 일정 목록/캘린더 뷰 전반에서 일관된 학교 태그 표시에 사용.
 */
export function SchoolBadge({ school, size = 'sm' }: { school?: string; size?: 'xs' | 'sm' | 'md' }) {
  if (school !== 'taeseong_middle' && school !== 'taeseong_high') return null;
  const palette = SCHOOL_COLORS[school];
  const sizeStyles = size === 'xs'
    ? { fontSize: 8, padding: '0 3px' }
    : size === 'md'
      ? { fontSize: 10, padding: '1px 6px' }
      : { fontSize: 9, padding: '1px 5px' };
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
      {school === 'taeseong_middle' ? '중' : '고'}
    </span>
  );
}

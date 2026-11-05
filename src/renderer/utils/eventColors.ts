import type React from 'react';
import type { CalendarEvent, PersonalEvent } from '@shared/types';
import { getPersonalEventDisplayColor } from './calendarHelpers';

type ChipVars = React.CSSProperties & Record<`--${string}`, string>;

const FAMILY: Record<string, string> = {
  taeseong_middle: 'mid',
  taeseong_high: 'high',
  all: 'all',
};

/** 공유 일정 칩 색. 기본은 학교별 색이다. */
export function sharedChipVars(event: Pick<CalendarEvent, 'school'>): ChipVars {
  const family = FAMILY[event.school] ?? 'all';
  return { '--c-base': `var(--fam-${family})`, '--c-ink': `var(--fam-${family}-ink)` };
}

/** 개인 일정 칩 색. 교사가 고른 색을 지키고, 글자는 배경과 대비가 나도록 본문색과 섞는다. */
export function personalChipVars(pe: PersonalEvent, profileColor?: string): ChipVars {
  const color = getPersonalEventDisplayColor(pe, profileColor);
  return { '--c-base': color, '--c-ink': `color-mix(in oklab, ${color} 55%, var(--text-primary))` };
}

/** 칩이 아닌 곳(일 화면 시간표 블록 등)에 같은 모양을 인라인으로 입힌다 */
export function tintStyle(vars: ChipVars): React.CSSProperties {
  return {
    ...vars,
    background: 'color-mix(in oklab, var(--c-base) var(--chip-tint), transparent)',
    color: 'var(--c-ink)',
    boxShadow: 'inset 3px 0 0 var(--c-base)',
  };
}

import type React from 'react';
import type { CalendarEvent, PersonalEvent } from '@shared/types';
import { useAppearanceStore } from '../store/appearanceStore';
import { getPersonalEventDisplayColor } from './calendarHelpers';

type ChipVars = React.CSSProperties & Record<`--${string}`, string>;

const SCHOOL_FAMILY: Record<string, string> = {
  taeseong_middle: 'mid',
  taeseong_high: 'high',
  all: 'all',
};

function familyVars(family: string): ChipVars {
  return {
    '--c-base': `var(--fam-${family})`,
    '--c-ink': `var(--fam-${family}-ink)`,
    '--c-solid': `var(--fam-${family}-solid)`,
    '--c-on': `var(--fam-${family}-on)`,
  };
}

/** 사용자가 고른 색에서 만든다. 글자는 배경과 대비가 나도록 본문색과 섞는다. */
function customVars(color: string): ChipVars {
  return {
    '--c-base': color,
    '--c-ink': `color-mix(in oklab, ${color} 55%, var(--text-primary))`,
    '--c-solid': `color-mix(in oklab, ${color} 82%, #000)`,
    '--c-on': '#fff',
  };
}

/** 공유 일정 칩 색. 설정의 일정 색 기준(학교, 분류, 작성자)을 따른다. */
export function sharedChipVars(event: Pick<CalendarEvent, 'school' | 'category' | 'adminColor' | 'duty'>): ChipVars {
  // 내 감독·당직 차례는 색 기준과 상관없이 같은 색이다
  if (event.duty) return familyVars('duty');
  const { colorBy, colorAssist } = useAppearanceStore.getState();
  if (colorBy === 'author' && event.adminColor) return customVars(event.adminColor);
  if (colorBy === 'category') return familyVars(event.category);
  const family = SCHOOL_FAMILY[event.school] ?? 'all';
  // 색 구분 돕기: 초록과 보라, 파랑이 가까워 보이는 경우를 위해 색을 벌린다
  return familyVars(colorAssist && family !== 'mid' ? `${family}-a` : family);
}

/** 개인 일정 칩 색. 교사가 고른 색을 지킨다. */
export function personalChipVars(pe: PersonalEvent, profileColor?: string): ChipVars {
  return customVars(getPersonalEventDisplayColor(pe, profileColor));
}

/** 색 구분 돕기: 색만으로 구분하지 않도록 무늬를 더한다 */
export function assistClass(event: Pick<CalendarEvent, 'school' | 'duty'>): string {
  const { colorBy, colorAssist } = useAppearanceStore.getState();
  if (!colorAssist || colorBy !== 'school' || event.duty) return '';
  if (event.school === 'taeseong_high') return ' pat-high';
  if (event.school === 'all') return ' pat-all';
  return '';
}

/** 칩이 아닌 곳(일 화면 시간표 블록 등)에 같은 모양을 인라인으로 입힌다 */
export function tintStyle(vars: ChipVars): React.CSSProperties {
  return {
    ...vars,
    background: 'color-mix(in oklab, var(--c-base) var(--chip-tint), rgb(var(--plate-rgb)))',
    color: 'var(--c-ink)',
    boxShadow: 'inset 3px 0 0 var(--c-base)',
  };
}

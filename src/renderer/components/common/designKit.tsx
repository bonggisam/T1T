import React from 'react';

/** 급식판과 학사일정이 함께 쓰는 작은 도구 */

export function cls(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** 이모지 한 글자. 화면 읽기 프로그램은 옆 글자만 읽게 한다 */
export function Emo({ e, className }: { e: string; className?: string }) {
  return <span className={cls('md-emoji', className)} aria-hidden="true">{e}</span>;
}

/** 불러오는 중, 오류, 빈 화면 */
export function DesignState({ emoji, text, error }: { emoji: string; text: string; error?: boolean }) {
  return (
    <div className={cls('md-state', error && 'is-error')} role={error ? 'alert' : undefined}>
      <Emo e={emoji} className="md-stateEmoji" />
      <span>{text}</span>
    </div>
  );
}

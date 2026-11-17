import React from 'react';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { School } from '@shared/types';
import { TOOL_TABS, type ToolTab } from './ToolMenu';
import './toolView.css';

/*
 * 메뉴 화면이 함께 쓰는 부품. 머리줄 아이콘은 도구 모음의 아이콘을 그대로 써서 두 곳이 늘 같다.
 * 이모지 보기를 켜면(기본) 아이콘 자리에 메뉴 이모지가 나온다. 꾸밈은 toolView.css에 있다.
 */

/** 메뉴 이모지. Windows 10에서도 보이는 것만 쓴다 (유니코드 11 이하, 이어 붙인 이모지 없음) */
export const TOOL_EMOJI: Record<ToolTab, string> = {
  todos: '✅',
  timetable: '⏰',
  reserv: '🏢',
  meeting: '🤝',
  duty: '📋',
  meal: '🍱',
  schedule: '🗓️',
  keyphone: '☎️',
  library: '📚',
  tpass: '🚪',
  outing: '🚶',
};

/** 이모지 한 글자. 이모지 보기를 끄면 숨는다. 화면 읽기 프로그램은 옆 글자만 읽는다 */
export function Emoji({ e, className }: { e: string | undefined; className?: string }) {
  if (!e) return null;
  return <span className={cls('tv-emoji', className)} aria-hidden="true">{e}</span>;
}

export function cls(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** 머리줄: 왼쪽 뒤로 단추, 도구 모음과 같은 아이콘과 이름, 오른쪽에 학교 고르기와 단추 */
export function ToolHeader({ tab, title, sub, onBack, children }: {
  tab: ToolTab;
  /** 없으면 도구 모음 이름을 쓴다 */
  title?: React.ReactNode;
  sub?: React.ReactNode;
  onBack: () => void;
  children?: React.ReactNode;
}) {
  const info = TOOL_TABS.find((t) => t.tab === tab);
  const Icon = info?.Icon;
  const emoji = TOOL_EMOJI[tab];
  return (
    <div className="tv-head">
      <button type="button" className="tv-iconbtn" onClick={onBack} title="캘린더로 돌아가기" aria-label="캘린더로 돌아가기">
        <ArrowLeft size={16} />
      </button>
      <h2 className="tv-title">
        {Icon && <Icon size={16} strokeWidth={2.2} aria-hidden="true" className={cls('tv-ico', emoji && 'has-emoji')} />}
        <Emoji e={emoji} />
        <span>{title ?? info?.label}</span>
        {sub && <small className="tv-titleSub">{sub}</small>}
      </h2>
      <span className="tv-spacer" />
      {children}
    </div>
  );
}

const SCHOOL_SHORT: Record<'taeseong_middle' | 'taeseong_high', string> = {
  taeseong_middle: '태성중',
  taeseong_high: '태성고',
};

/** 학교 고르기. 모든 메뉴가 같은 두 칸 단추를 쓴다 */
export function SchoolSeg({ value, onChange, counts, wide }: {
  value: School;
  onChange: (school: 'taeseong_middle' | 'taeseong_high') => void;
  counts?: Partial<Record<School, number>>;
  /** 칸을 꽉 채운다 (옆 목록 위) */
  wide?: boolean;
}) {
  return (
    <div className={cls('tv-seg', wide && 'is-wide')} role="group" aria-label="학교">
      {(['taeseong_middle', 'taeseong_high'] as const).map((school) => (
        <button key={school} type="button" aria-pressed={value === school} onClick={() => onChange(school)}>
          {SCHOOL_SHORT[school]}
          {counts?.[school] !== undefined && <span className="tv-segCount">{counts[school]}</span>}
        </button>
      ))}
    </div>
  );
}

/** 새로고침 단추. 받는 동안 아이콘이 돈다 */
export function RefreshButton({ onClick, busy, disabled, label = '새로고침' }: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button type="button" className="tv-iconbtn" onClick={onClick} disabled={busy || disabled} title={label} aria-label={label}>
      <RefreshCw size={14} className={busy ? 'tv-spin' : undefined} />
    </button>
  );
}

/** 주·달 이동 줄: 앞뒤 단추, 기간, 오늘로 돌아가는 단추, 오른쪽 요약 */
export function PeriodNav({ title, sub, onPrev, onNext, prevLabel, nextLabel, reset, end }: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  reset?: { label: string; onClick: () => void } | null;
  end?: React.ReactNode;
}) {
  return (
    <div className="tv-bar">
      <button type="button" className="tv-iconbtn" onClick={onPrev} title={prevLabel} aria-label={prevLabel}>
        <ChevronLeft size={16} />
      </button>
      <div className="tv-period" aria-live="polite">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
      <button type="button" className="tv-iconbtn" onClick={onNext} title={nextLabel} aria-label={nextLabel}>
        <ChevronRight size={16} />
      </button>
      {reset && <button type="button" className="tv-btn" onClick={reset.onClick}>{reset.label}</button>}
      {end && <span className="tv-barEnd">{end}</span>}
    </div>
  );
}

/** 불러오는 중, 빈 화면, 오류 */
export function ToolState({ kind, text, sub, emoji, children }: {
  kind: 'loading' | 'empty' | 'error';
  text: React.ReactNode;
  sub?: React.ReactNode;
  /** 이모지 보기를 켰을 때 아이콘 대신 보여 준다 */
  emoji?: string;
  children?: React.ReactNode;
}) {
  const Icon = kind === 'loading' ? Loader2 : kind === 'error' ? AlertCircle : Inbox;
  return (
    <div className={cls('tv-state', kind === 'error' && 'is-error')} role={kind === 'error' ? 'alert' : undefined}>
      <Icon size={22} className={cls(kind === 'loading' && 'tv-spin', 'tv-ico', emoji && 'has-emoji')} aria-hidden="true" />
      <Emoji e={emoji} className="tv-stateEmoji" />
      <span>{text}</span>
      {sub && <span className="tv-stateSub">{sub}</span>}
      {children}
    </div>
  );
}

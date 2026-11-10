import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';
import { Ic } from '../common/Ic';
import { cls, Emo, DesignState } from '../common/designKit';
import { mergeRuns, planMonth, monthWeeks, rangeLabel, seasonEmoji, type SchItem, type SchSource } from '../../utils/scheduleEmoji';
import '../common/designs.css';
import './ScheduleView.css';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

interface ScheduleViewProps {
  onBack: () => void;
}

/**
 * 학사일정 — 학교 홈페이지에서 한 해 일정을 받아, 고른 학교와 달을 칠판에 주마다 한 줄씩 적어 보여 준다.
 * 일정마다 그림(이모지)을 붙이고, 날짜는 종류별 분필 색, 이번 주는 점선 동그라미다.
 */
export function ScheduleView({ onBack }: ScheduleViewProps) {
  const { user } = useAuthStore();
  const defaultSchool: School = (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high')
    ? user.school : 'taeseong_middle';
  const [selectedSchool, setSelectedSchool] = useState<School>(defaultSchool);
  const [events, setEvents] = useState<SchSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });

  async function load() {
    // 학교를 빨리 바꾸면 늦게 온 앞 요청이 지금 화면을 덮는다
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI?.schoolFetchSchedule(selectedSchool);
      if (request !== requestRef.current) return;
      if (!res) throw new Error('응답 없음');
      setEvents(res.events);
    } catch (err: any) {
      if (request !== requestRef.current) return;
      console.error('[Schedule] fetch failed:', err);
      setError(err?.message || '학사일정을 가져올 수 없습니다');
      setEvents([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchool]);

  const all = useMemo(() => mergeRuns(events), [events]);
  const plan = useMemo(() => planMonth(all, ym.y, ym.m), [all, ym]);
  const today = format(now, 'yyyy-MM-dd');
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth() + 1;

  function shift(delta: number) {
    setYm(({ y, m }) => {
      const idx = y * 12 + (m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });
  }

  // 주마다 한 줄: 그 주에 시작하는 일정 (지난달부터 이어진 일정은 첫 주)
  const rows = useMemo(() => {
    const firstOfMonth = format(new Date(ym.y, ym.m - 1, 1), 'yyyy-MM-dd');
    const regular = plan.items.filter((it) => !it.weekly);
    return monthWeeks(ym.y, ym.m).map((week, i) => {
      const days = week.filter((d) => d.getMonth() + 1 === ym.m);
      const from = format(days[0], 'yyyy-MM-dd');
      const to = format(days[days.length - 1], 'yyyy-MM-dd');
      const items = regular.filter((it) => (it.start >= from && it.start <= to) || (i === 0 && it.start < firstOfMonth));
      const isNow = today >= format(week[0], 'yyyy-MM-dd') && today <= format(week[6], 'yyyy-MM-dd');
      const range = days.length === 1
        ? `${days[0].getDate()}일`
        : `${days[0].getDate()}–${days[days.length - 1].getDate()}일`;
      return { label: `${i + 1}주`, range, items, isNow };
    });
  }, [ym, plan.items, today]);
  const weekly = plan.items.filter((it) => it.weekly);

  const dayText = (it: SchItem) => {
    const label = rangeLabel(it, ym.y, ym.m);
    if (it.start !== it.end) return label;
    return `${label}(${DOW[new Date(`${it.start}T00:00:00`).getDay()]})`;
  };

  return (
    <div className="md-root sch-root">
      <div className="sch-frame">
        <div className="sch-board">
          <div className="sch-head">
            <button className="sch-back" onClick={onBack} title="캘린더로 돌아가기">‹ 캘린더</button>
            <div className="sch-seg" role="group" aria-label="학교">
              <button aria-pressed={selectedSchool === 'taeseong_middle'} onClick={() => setSelectedSchool('taeseong_middle')}>태성중</button>
              <button aria-pressed={selectedSchool === 'taeseong_high'} onClick={() => setSelectedSchool('taeseong_high')}>태성고</button>
            </div>
            <button className="sch-icon" onClick={load} disabled={loading} title="새로고침" aria-label="새로고침">
              <Ic name="refresh" gap={false} />
            </button>
          </div>

          <div className="sch-titleRow">
            <button className="sch-arrow" onClick={() => shift(-1)} title="지난 달" aria-label="지난 달">‹</button>
            <div className="sch-title">
              <b><Emo e={seasonEmoji(ym.m)} /> {ym.m}월 학사일정</b>
              <small>{ym.y}년{!loading && !error && ` · 일정 ${plan.items.length}개`}</small>
              {!isThisMonth && <> <button className="sch-now" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() + 1 })}>이번 달로</button></>}
            </div>
            <button className="sch-arrow" onClick={() => shift(1)} title="다음 달" aria-label="다음 달">›</button>
          </div>
          <div className="sch-dots" role="group" aria-label="달 고르기">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button key={m} className={cls(m === ym.m && 'is-sel')} aria-pressed={m === ym.m} onClick={() => setYm({ y: ym.y, m })} title={`${m}월`}>{m}</button>
            ))}
          </div>

          <div className="sch-weeks">
            {loading && <DesignState emoji="📅" text="학사일정을 불러오는 중…" />}
            {!loading && error && <DesignState emoji="😥" text={error} error />}
            {!loading && !error && plan.items.length === 0 && <DesignState emoji="🗓️" text="이 달에는 올라온 일정이 없어요" />}
            {!loading && !error && plan.items.length > 0 && rows.map((r) => (
              <div key={r.label} className={cls('sch-week', r.isNow && 'is-now')}>
                {r.isNow && <span className="sch-tag">이번 주</span>}
                <div className="sch-wk"><b>{r.label}</b><span>{r.range}</span></div>
                <div className="sch-evs">
                  {r.items.length === 0 && <span className="sch-none">조용한 한 주</span>}
                  {r.items.map((it) => (
                    <div key={it.key} className={cls('sch-ev', `cat-${it.cat}`)} title={it.title}>
                      <span className="sch-d">{dayText(it)}</span>
                      <Emo e={it.emoji} />
                      <span className="sch-t">{it.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!loading && !error && weekly.length > 0 && (
            <div className="sch-foot">
              {weekly.map((it) => (
                <span key={it.key}><Emo e={it.emoji} /> 매주 {DOW[new Date(`${it.start}T00:00:00`).getDay()]}요일 {it.title} · {rangeLabel(it, ym.y, ym.m)}</span>
              ))}
            </div>
          )}
        </div>
        <div className="sch-ledge" aria-hidden="true"><i /><i /><i /><i /></div>
      </div>
    </div>
  );
}

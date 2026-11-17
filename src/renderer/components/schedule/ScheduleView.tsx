import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';
import { cls, Emoji, PeriodNav, RefreshButton, SchoolSeg, ToolHeader, ToolState } from '../common/ToolView';
import { mergeRuns, planMonth, monthWeeks, rangeLabel, seasonEmoji, type SchCat, type SchItem, type SchSource } from '../../utils/scheduleEmoji';
import './ScheduleView.css';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

interface ScheduleViewProps {
  onBack: () => void;
}

/** 쉬는 날. 달력의 공휴일처럼 빨간 글자로 적는다 */
const REST: ReadonlySet<SchCat> = new Set<SchCat>(['holiday', 'off', 'vacation']);

/** 학사일정 — 학교 홈페이지에서 한 해 일정을 받아, 고른 달을 주마다 같은 모양의 카드로 보여 준다 */
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

  const ready = !loading && !error && plan.items.length > 0;
  return (
    <div className="tv-root sch-root">
      <ToolHeader tab="schedule" onBack={onBack}>
        <SchoolSeg value={selectedSchool} onChange={setSelectedSchool} />
        <RefreshButton onClick={load} busy={loading} />
      </ToolHeader>

      <PeriodNav
        title={<><Emoji e={seasonEmoji(ym.m)} /> {ym.y}년 {ym.m}월</>}
        sub={!loading && !error ? `일정 ${plan.items.length}개` : undefined}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        prevLabel="지난 달"
        nextLabel="다음 달"
        reset={isThisMonth ? null : { label: '이번 달', onClick: () => setYm({ y: now.getFullYear(), m: now.getMonth() + 1 }) }}
      />

      <div className="tv-body">
        {loading && <ToolState kind="loading" emoji="📅" text="학사일정을 불러오는 중…" />}
        {!loading && error && <ToolState kind="error" emoji="😥" text={error} />}
        {!loading && !error && plan.items.length === 0 && <ToolState kind="empty" emoji="🗓️" text="이 달에는 올라온 일정이 없습니다" />}
        {ready && (
          <div className="sch-weeks">
            {rows.map((r) => (
              <section key={r.label} className={cls('tv-card', 'sch-week', r.isNow && 'is-today')}>
                <header className="tv-cardHead">
                  <span className="tv-cardTitle">{r.label}</span>
                  <span className="tv-cardMeta">{r.range}</span>
                  {r.isNow && <span className="tv-badge">이번 주</span>}
                </header>
                {r.items.length === 0 ? (
                  <p className="sch-none">일정 없음</p>
                ) : (
                  <ul className="sch-list">
                    {r.items.map((it) => (
                      <li key={it.key} className={cls('sch-ev', REST.has(it.cat) && 'is-rest')} title={it.title}>
                        <span className="sch-d">{dayText(it)}</span>
                        <Emoji e={it.emoji} className="sch-emo" />
                        <span className="sch-t">{it.title}</span>
                        {it.cat === 'exam' && <em className="tv-badge">시험</em>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {!loading && !error && weekly.length > 0 && (
        <div className="tv-foot">
          {weekly.map((it) => (
            <div key={it.key}><Emoji e={it.emoji} /> 매주 {DOW[new Date(`${it.start}T00:00:00`).getDay()]}요일 {it.title} · {rangeLabel(it, ym.y, ym.m)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

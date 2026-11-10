import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO, addDays, isValid, startOfWeek } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';
import { Ic } from '../common/Ic';
import { cls, Emo, DesignState } from '../common/designKit';
import { parseMenu, mainDish, parseKcal, type MealItem } from '../../utils/mealEmoji';
import '../common/designs.css';
import './MealView.css';

interface MealData {
  weekStart: string;
  weekEnd: string;
  days: Array<{ date: string; weekday: string; menu: string[]; calorie: string }>;
}

interface MealDay {
  date: string; // YYYY-MM-DD
  weekday: string; // 일~토
  month: number;
  day: number;
  items: MealItem[];
  kcal: number | null;
  main?: MealItem;
  isToday: boolean;
}

const ORDINAL = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'];
const TONE: Record<string, string> = { 월: 'mon', 화: 'tue', 수: 'wed', 목: 'thu', 금: 'fri', 토: 'sat', 일: 'sun' };
/** 칼로리 막대의 가득 찬 기준 */
const KCAL_FULL = 1300;

function safeDate(s: string | undefined): Date | null {
  if (!s) return null;
  try {
    const d = parseISO(s);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** 메뉴 한 줄: 그림, 이름, 곁들임·괄호 설명·고르는 맛, 특식 표시 */
function MenuLine({ item, isMain }: { item: MealItem; isMain: boolean }) {
  return (
    <li className={cls(item.special && 'is-special', isMain && 'is-main')}>
      <Emo e={item.emoji} />
      <span>
        {item.name}
        {item.extra && <small> + {item.extra}</small>}
        {item.note && <small> ({item.note})</small>}
        {item.options
          ? <small> ({item.options.join('/')} 중 선택)</small>
          : item.optional && <small> (선택)</small>}
        {item.special && <em>특식</em>}
      </span>
    </li>
  );
}

interface MealViewProps {
  onBack: () => void;
}

/**
 * 급식 메뉴 — 학교 홈페이지에서 한 주 식단을 받아 요일마다 색이 다른 카드로 보여 준다.
 * 메뉴마다 그림(이모지)을 붙이고, 오늘은 TODAY 스티커, 마지막 카드에 이번 주 특식과 후식을 모은다.
 */
export function MealView({ onBack }: MealViewProps) {
  const { user } = useAuthStore();
  const defaultSchool: School = (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high')
    ? user.school : 'taeseong_middle';
  const [selectedSchool, setSelectedSchool] = useState<School>(defaultSchool);
  const [weekDate, setWeekDate] = useState<Date>(new Date());
  const [data, setData] = useState<MealData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function load() {
    // 학교나 주를 빨리 바꾸면 늦게 온 앞 요청이 지금 화면을 덮는다
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const ymd = format(weekDate, 'yyyyMMdd');
      const res = await window.electronAPI?.schoolFetchMeal(selectedSchool, ymd);
      if (request !== requestRef.current) return;
      if (!res) throw new Error('응답 없음');
      setData(res);
    } catch (err: any) {
      if (request !== requestRef.current) return;
      console.error('[Meal] fetch failed:', err);
      setError(err?.message || '급식 정보를 가져올 수 없습니다');
      setData(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchool, weekDate]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // 평일은 메뉴가 없어도 넣고(급식 없음), 주말은 메뉴가 있을 때만
  const days = useMemo<MealDay[]>(() => {
    if (!data?.days) return [];
    return data.days
      .filter((d) => (d.weekday !== '토' && d.weekday !== '일') || (d.menu && d.menu.length > 0))
      .map((d) => {
        const items = parseMenu(d.menu || []);
        const dt = safeDate(d.date);
        return {
          date: d.date,
          weekday: d.weekday,
          month: dt ? dt.getMonth() + 1 : 0,
          day: dt ? dt.getDate() : 0,
          items,
          kcal: parseKcal(d.calorie),
          main: mainDish(items),
          isToday: d.date === todayStr,
        };
      });
  }, [data, todayStr]);

  const first = safeDate(days[0]?.date) ?? startOfWeek(weekDate, { weekStartsOn: 1 });
  const last = safeDate(days[days.length - 1]?.date) ?? addDays(first, 4);
  const weekTitle = `${first.getMonth() + 1}월 ${ORDINAL[Math.ceil(first.getDate() / 7) - 1] ?? ''} 주`;
  const weekRange = first.getMonth() === last.getMonth()
    ? `${first.getMonth() + 1}월 ${first.getDate()}일 ~ ${last.getDate()}일`
    : `${first.getMonth() + 1}월 ${first.getDate()}일 ~ ${last.getMonth() + 1}월 ${last.getDate()}일`;
  const isThisWeek = !!data && data.weekStart <= todayStr && todayStr <= data.weekEnd;

  const withMenu = days.filter((d) => d.items.length > 0);
  const specials = withMenu.flatMap((d) => d.items.filter((i) => i.special).map((i) => ({ d, i })));
  const desserts = withMenu.flatMap((d) => d.items.filter((i) => i.kind === 'dessert').map((i) => ({ d, i })));
  const top = withMenu.reduce<MealDay | null>((m, d) => (d.kcal && (!m || (m.kcal ?? 0) < d.kcal) ? d : m), null);

  return (
    <div className="md-root meal-root">
      <div className="meal-head">
        <button className="meal-back" onClick={onBack} title="캘린더로 돌아가기" aria-label="캘린더로 돌아가기">‹</button>
        <div className="meal-title">급식 <Emo e="🍽️" /></div>
        <div className="meal-seg" role="group" aria-label="학교">
          <button aria-pressed={selectedSchool === 'taeseong_middle'} onClick={() => setSelectedSchool('taeseong_middle')}>태성중</button>
          <button aria-pressed={selectedSchool === 'taeseong_high'} onClick={() => setSelectedSchool('taeseong_high')}>태성고</button>
        </div>
        <button className="meal-icon" onClick={load} disabled={loading} title="새로고침" aria-label="새로고침">
          <Ic name="refresh" gap={false} />
        </button>
      </div>

      <div className="meal-weekbar">
        <button className="meal-nav" onClick={() => setWeekDate((d) => addDays(d, -7))} title="지난 주" aria-label="지난 주">‹</button>
        <div className="meal-week"><b>{weekTitle}</b><small>{weekRange}</small></div>
        <button className="meal-nav" onClick={() => setWeekDate((d) => addDays(d, 7))} title="다음 주" aria-label="다음 주">›</button>
        {!isThisWeek && <button className="meal-now" onClick={() => setWeekDate(new Date())}>이번 주</button>}
      </div>

      <div className="meal-grid">
        {loading && <DesignState emoji="🍳" text="급식을 불러오는 중…" />}
        {!loading && error && <DesignState emoji="😥" text={error} error />}
        {!loading && !error && withMenu.length === 0 && <DesignState emoji="🍽️" text="이번 주 급식 정보가 없어요" />}
        {!loading && !error && withMenu.length > 0 && (
          <>
            {days.map((d) => (
              <article
                key={d.date}
                className={cls('meal-card', `tone-${TONE[d.weekday] ?? 'sun'}`, d.isToday && 'is-today', d.items.length === 0 && 'is-off')}
                aria-label={`${d.month}월 ${d.day}일 ${d.weekday}요일 급식`}
              >
                {d.isToday && <span className="meal-sticker">TODAY</span>}
                <header className="meal-cardHead">
                  <div>
                    <div className="meal-wd">{d.weekday}</div>
                    <div className="meal-date">{d.month}/{d.day}</div>
                  </div>
                  <span className="meal-hero" title={d.main?.name}><Emo e={d.main?.emoji ?? '🍽️'} /></span>
                </header>
                {d.items.length === 0 ? (
                  <p className="meal-none">급식 없음</p>
                ) : (
                  <ul className="meal-list">
                    {d.items.map((it, i) => <MenuLine key={i} item={it} isMain={it === d.main} />)}
                  </ul>
                )}
                {d.kcal && (
                  <footer className="meal-foot">
                    <span className="meal-bar"><i style={{ width: `${Math.min(100, Math.round((d.kcal / KCAL_FULL) * 100))}%` }} /></span>
                    <span>{d.kcal.toLocaleString()}kcal</span>
                  </footer>
                )}
              </article>
            ))}
            <article className="meal-card meal-high" aria-label="이번 주 하이라이트">
              <header className="meal-highHead"><Emo e="✨" /> 이번 주 하이라이트</header>
              {specials.length > 0 && (
                <div className="meal-hl">
                  <span className="meal-hlTitle">⭐ 특식</span>
                  {specials.map(({ d, i }, k) => <span key={k} className="meal-hlItem"><Emo e={i.emoji} />{i.name}<small>{d.weekday}</small></span>)}
                </div>
              )}
              {desserts.length > 0 && (
                <div className="meal-hl">
                  <span className="meal-hlTitle">🍰 후식</span>
                  {desserts.map(({ d, i }, k) => <span key={k} className="meal-hlItem"><Emo e={i.emoji} />{i.name}<small>{d.weekday}</small></span>)}
                </div>
              )}
              {top && (
                <div className="meal-hl">
                  <span className="meal-hlTitle">🔥 든든한 날</span>
                  <span className="meal-hlItem">{top.weekday}요일 · {top.kcal?.toLocaleString()}kcal</span>
                </div>
              )}
            </article>
          </>
        )}
      </div>
    </div>
  );
}

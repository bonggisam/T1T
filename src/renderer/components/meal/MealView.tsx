import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, parseISO, addDays, isValid, startOfWeek } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import type { School } from '@shared/types';
import { cls, Emoji, PeriodNav, RefreshButton, SchoolSeg, ToolHeader, ToolState } from '../common/ToolView';
import { parseMenu, mainDish, parseKcal, type MealItem } from '../../utils/mealEmoji';
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

function safeDate(s: string | undefined): Date | null {
  if (!s) return null;
  try {
    const d = parseISO(s);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

/** 메뉴 한 줄: 이름, 곁들임·괄호 설명·고르는 맛, 특식 표시. 주메뉴는 굵게 */
function MenuLine({ item, isMain }: { item: MealItem; isMain: boolean }) {
  return (
    <li className={cls(isMain && 'is-main')}>
      <Emoji e={item.emoji} className="meal-emo" />
      <span>{item.name}</span>
      {item.extra && <small>+ {item.extra}</small>}
      {item.note && <small>({item.note})</small>}
      {item.options
        ? <small>({item.options.join('/')} 중 선택)</small>
        : item.optional && <small>(선택)</small>}
      {item.special && <em className="tv-badge">특식</em>}
    </li>
  );
}

interface MealViewProps {
  onBack: () => void;
}

/** 급식 메뉴 — 학교 홈페이지에서 한 주 식단을 받아 요일마다 같은 모양의 카드로 보여 준다 */
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

  return (
    <div className="tv-root meal-root">
      <ToolHeader tab="meal" onBack={onBack}>
        <SchoolSeg value={selectedSchool} onChange={setSelectedSchool} />
        <RefreshButton onClick={load} busy={loading} />
      </ToolHeader>

      <PeriodNav
        title={weekTitle}
        sub={weekRange}
        onPrev={() => setWeekDate((d) => addDays(d, -7))}
        onNext={() => setWeekDate((d) => addDays(d, 7))}
        prevLabel="지난 주"
        nextLabel="다음 주"
        reset={isThisWeek ? null : { label: '이번 주', onClick: () => setWeekDate(new Date()) }}
      />

      <div className="tv-body">
        {loading && <ToolState kind="loading" emoji="🍳" text="급식을 불러오는 중…" />}
        {!loading && error && <ToolState kind="error" emoji="😥" text={error} />}
        {!loading && !error && withMenu.length === 0 && <ToolState kind="empty" emoji="🍽️" text="이번 주 급식 정보가 없습니다" />}
        {!loading && !error && withMenu.length > 0 && (
          <div className="meal-grid">
            {days.map((d) => (
              <article
                key={d.date}
                className={cls('tv-card', 'meal-day', d.isToday && 'is-today', d.items.length === 0 && 'is-off')}
                aria-label={`${d.month}월 ${d.day}일 ${d.weekday}요일 급식`}
              >
                <header className="tv-cardHead">
                  <span className="tv-cardTitle">{d.weekday}요일</span>
                  <span className="tv-cardMeta">{d.month}/{d.day}</span>
                  {d.isToday && <span className="tv-badge">오늘</span>}
                  <Emoji e={d.main?.emoji} className="meal-hero" />
                </header>
                {d.items.length === 0 ? (
                  <p className="meal-none">급식 없음</p>
                ) : (
                  <ul className="meal-list">
                    {d.items.map((it, i) => <MenuLine key={i} item={it} isMain={it === d.main} />)}
                  </ul>
                )}
                {d.kcal && <footer className="meal-kcal">{d.kcal.toLocaleString()} kcal</footer>}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

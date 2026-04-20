import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuthStore } from '../../store/authStore';

/**
 * NEIS Open API — 교육정보개방포털의 급식 데이터
 * 학교별 교육청 코드 + 학교 코드를 localStorage에 저장 (설정에서 변경 가능).
 */
interface NeisConfig { education: string; school: string; }

function getNeisConfig(schoolKey: string): NeisConfig | null {
  try {
    const raw = localStorage.getItem(`tonet-neis-${schoolKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setNeisConfig(schoolKey: string, cfg: NeisConfig): void {
  try { localStorage.setItem(`tonet-neis-${schoolKey}`, JSON.stringify(cfg)); } catch {}
}

interface MealInfo {
  date: string; // YYYYMMDD
  menu: string;
  calorie: string;
}

interface MealViewProps {
  onBack: () => void;
}

export function MealView({ onBack }: MealViewProps) {
  const { user } = useAuthStore();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [meals, setMeals] = useState<MealInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [eduCode, setEduCode] = useState('');
  const [schoolCode, setSchoolCode] = useState('');

  const schoolConfig = user?.school ? getNeisConfig(user.school) : null;

  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  useEffect(() => {
    if (!schoolConfig) return;
    fetchMeals();
  }, [weekStart, user?.school]);

  async function fetchMeals() {
    if (!schoolConfig) return;
    setLoading(true);
    setError(null);
    try {
      const from = format(weekStart, 'yyyyMMdd');
      const to = format(addDays(weekStart, 4), 'yyyyMMdd');
      const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&pIndex=1&pSize=100&ATPT_OFCDC_SC_CODE=${schoolConfig.education}&SD_SCHUL_CODE=${schoolConfig.school}&MLSV_FROM_YMD=${from}&MLSV_TO_YMD=${to}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`NEIS HTTP ${res.status}`);
      const json = await res.json();
      // NEIS API: 데이터 없으면 RESULT.CODE !== 'INFO-000'
      if (json?.RESULT && json.RESULT.CODE !== 'INFO-000') {
        setMeals([]);
        return;
      }
      const rows = json?.mealServiceDietInfo?.[1]?.row || [];
      setMeals(rows.map((r: any) => ({
        date: r.MLSV_YMD,
        menu: (r.DDISH_NM || '').replace(/<br\/?>/g, '\n').replace(/\s*\([^)]*\)/g, '').trim(),
        calorie: r.CAL_INFO || '',
      })));
    } catch (err: any) {
      console.error('[Meal] fetch failed:', err);
      setError('급식 정보를 불러올 수 없습니다. (학교 코드 확인 필요)');
      setMeals([]);
    }
    setLoading(false);
  }

  function getMealForDay(day: Date): MealInfo | undefined {
    const dateStr = format(day, 'yyyyMMdd');
    return meals.find((m) => m.date === dateStr);
  }

  function changeWeek(delta: number) {
    setWeekStart(addDays(weekStart, delta * 7));
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>🍱 급식 메뉴</h3>
        <button onClick={onBack} style={styles.closeBtn}>✕</button>
      </div>

      {/* 네비게이션 */}
      <div style={styles.nav}>
        <button onClick={() => changeWeek(-1)} style={styles.navBtn}>← 이전주</button>
        <span style={styles.weekLabel}>
          {format(weekStart, 'M/d', { locale: ko })} ~ {format(addDays(weekStart, 4), 'M/d', { locale: ko })}
        </span>
        <button onClick={() => changeWeek(1)} style={styles.navBtn}>다음주 →</button>
      </div>

      {!schoolConfig && (
        <div style={styles.setup}>
          <p style={styles.setupDesc}>
            ⚙️ NEIS 학교 코드 설정이 필요합니다.
            <br />
            <a href="https://open.neis.go.kr/portal/guide/actKnowHow.do" target="_blank" rel="noreferrer" style={styles.link}>
              학교 코드 조회 →
            </a>
          </p>
          <input
            type="text" placeholder="교육청 코드 (예: K10)"
            value={eduCode} onChange={(e) => setEduCode(e.target.value)}
            style={styles.setupInput}
          />
          <input
            type="text" placeholder="학교 코드 (7자리 숫자)"
            value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)}
            style={styles.setupInput}
          />
          <button
            onClick={() => {
              if (!eduCode.trim() || !schoolCode.trim() || !user) return;
              setNeisConfig(user.school, { education: eduCode.trim(), school: schoolCode.trim() });
              window.location.reload();
            }}
            style={styles.setupBtn}
            disabled={!eduCode.trim() || !schoolCode.trim()}
          >저장</button>
        </div>
      )}
      {error && <div style={styles.error}>{error}</div>}

      {/* 주간 급식표 */}
      <div style={styles.mealList}>
        {loading && (
          <div style={styles.loading}>
            <div className="spinner" />
            <p>급식 정보 불러오는 중...</p>
          </div>
        )}
        {!loading && weekDays.map((day) => {
          const meal = getMealForDay(day);
          const today = isSameDay(day, new Date());
          return (
            <div key={day.toISOString()} style={{ ...styles.dayCard, ...(today ? styles.dayCardToday : {}) }}>
              <div style={styles.dayHeader}>
                <span style={styles.dayDate}>{format(day, 'M/d (EEE)', { locale: ko })}</span>
                {today && <span style={styles.todayBadge}>오늘</span>}
              </div>
              {meal ? (
                <>
                  <pre style={styles.menu}>{meal.menu}</pre>
                  {meal.calorie && <span style={styles.calorie}>🔥 {meal.calorie}</span>}
                </>
              ) : (
                <p style={styles.noMeal}>급식 정보 없음</p>
              )}
            </div>
          );
        })}
      </div>

      <p style={styles.footer}>💡 실제 데이터는 NEIS 학교 코드 설정 후 표시됩니다.</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: '0 12px 12px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)' },
  nav: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', marginBottom: 8, gap: 8,
  },
  navBtn: {
    padding: '4px 10px', fontSize: 11, fontWeight: 500,
    border: 'none', borderRadius: 6,
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  weekLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' },
  error: {
    padding: 10, marginBottom: 8,
    background: 'rgba(239,68,68,0.1)', color: '#EF4444',
    borderRadius: 8, fontSize: 12, textAlign: 'center',
  },
  mealList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 },
  loading: { textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 },
  dayCard: {
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
  },
  dayCardToday: {
    background: 'rgba(74,144,226,0.08)',
    border: '1px solid var(--accent)',
  },
  dayHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginBottom: 4,
  },
  dayDate: { fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' },
  todayBadge: {
    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
    background: 'var(--accent)', color: '#fff',
  },
  menu: {
    fontSize: 11, lineHeight: 1.6, color: 'var(--text-primary)',
    fontFamily: 'inherit', margin: 0, whiteSpace: 'pre-wrap',
  },
  calorie: { fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'block' },
  noMeal: { fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' },
  footer: { fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 },
  setup: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: 12, marginBottom: 8, borderRadius: 8,
    background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
  },
  setupDesc: { fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 },
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 10 },
  setupInput: {
    padding: '6px 10px', fontSize: 11,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'var(--bg-primary, #fff)', color: 'var(--text-primary)', outline: 'none',
  },
  setupBtn: {
    padding: '6px', fontSize: 11, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: '#fff', cursor: 'pointer',
  },
};

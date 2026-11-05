import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Plus, X, RefreshCw } from 'lucide-react';
import type { WeatherData } from '@shared/types';
import { useWidgetStore } from '../../store/widgetStore';
import { useComciganStore } from '../../store/comciganStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import {
  describeWeather, gradePm10, gradePm25, worseGrade,
  readWeatherCache, isWeatherCacheFresh, loadWeather, WEATHER_REFRESH_MS, SCHOOL_LOCATION,
} from '../../utils/weather';
import { getTimedPeriods, getCurrentAndNext, formatClassLabel, formatMinutes, isTimetableStale } from '../../utils/classPeriods';
import { useComciganOutageStore } from '../../store/comciganOutageStore';
import { ComciganCallButton } from '../common/ComciganCall';
import { collectDDays, formatDDay } from '../../utils/dday';
import { usePersonalHidden } from '../../store/privacyStore';
import { Ic } from '../common/Ic';

const MAX_DDAY_CHIPS = 6;
const NO_CUSTOM_DDAYS: never[] = [];

/**
 * 오늘 화면 상단 위젯 — 날씨·미세먼지 / 지금·다음 수업 / D-Day.
 * 표시 여부는 설정 → 오늘 화면 위젯에서 변경.
 */
export function TodayWidgets() {
  const { showWeather, showNextClass, showDDay } = useWidgetStore();
  const hasTimetable = useComciganStore((s) => !!s.config && !!s.timetableData);
  const showClassCard = showNextClass && hasTimetable;
  const canFetchWeather = !!window.electronAPI?.weatherFetch;

  if (!(showWeather && canFetchWeather) && !showClassCard && !showDDay) return null;

  return (
    <div style={styles.container}>
      {((showWeather && canFetchWeather) || showClassCard) && (
        <div style={styles.cardRow}>
          {showWeather && canFetchWeather && <WeatherCard />}
          {showClassCard && <NextClassCard />}
        </div>
      )}
      {showDDay && <DDayStrip />}
    </div>
  );
}

function WeatherCard() {
  const [data, setData] = useState<WeatherData | null>(() => readWeatherCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await loadWeather();
      if (next) { setData(next); setError(false); }
    } catch (err) {
      console.warn('[Weather] fetch failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isWeatherCacheFresh(data)) refresh();
    const timer = setInterval(refresh, WEATHER_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <div style={styles.card}>
        <div style={styles.cardLabel}>날씨</div>
        <div style={styles.muted}>{loading ? '불러오는 중…' : error ? '날씨를 가져오지 못했어요' : '—'}</div>
      </div>
    );
  }

  const { icon, label } = describeWeather(data.weatherCode);
  const pm10 = gradePm10(data.pm10);
  const pm25 = gradePm25(data.pm25);
  const air = worseGrade(pm10, pm25);
  const round = (v: number | null) => (v === null ? '–' : Math.round(v));
  const tooltip = [
    `${SCHOOL_LOCATION.label} · ${format(new Date(data.fetchedAt), 'HH:mm')} 기준`,
    data.pm10 !== null ? `미세먼지(PM10) ${Math.round(data.pm10)}㎍/㎥ ${pm10?.label}` : null,
    data.pm25 !== null ? `초미세먼지(PM2.5) ${Math.round(data.pm25)}㎍/㎥ ${pm25?.label}` : null,
    '미세먼지는 Open-Meteo(CAMS) 모델 추정치로, 에어코리아 측정값과 다를 수 있어요.',
  ].filter(Boolean).join('\n');

  return (
    <div style={styles.card} title={tooltip}>
      <div style={styles.cardHead}>
        <span style={styles.cardLabel}>날씨 · {SCHOOL_LOCATION.label}</span>
        <button onClick={refresh} style={styles.iconBtn} title="새로고침" aria-label="날씨 새로고침" disabled={loading}>
          <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>
      <div style={styles.weatherMain}>
        <span style={{ fontSize: 'var(--fs-display)', lineHeight: 1 }}><Ic name={icon} gap={false} /></span>
        <span style={styles.bigText}>{round(data.temperature)}°</span>
        <span style={styles.muted}>{label}</span>
      </div>
      <div style={styles.subRow}>
        <span>{round(data.tempMin)}° / {round(data.tempMax)}°</span>
        {data.precipProbability !== null && <span><Ic name="umbrella" />{data.precipProbability}%</span>}
        {air && (
          <span style={{ ...styles.airBadge, background: air.color }}>
            미세 {air.label}
          </span>
        )}
      </div>
    </div>
  );
}

function NextClassCard() {
  const timetableData = useComciganStore((s) => s.timetableData);
  const refreshing = useComciganStore((s) => s.loading);
  const fetchTimetable = useComciganStore((s) => s.fetchTimetable);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const periods = useMemo(() => getTimedPeriods(timetableData, now), [timetableData, now]);
  const { current, next, remaining } = getCurrentAndNext(periods, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 언제 받은 시간표인지 보여 준다. 오래되었으면 변경을 놓치고 있을 수 있다.
  const checkedAt = timetableData ? new Date(timetableData.lastUpdated) : null;
  const checkedLabel = checkedAt && !Number.isNaN(checkedAt.getTime())
    ? format(checkedAt, checkedAt.toDateString() === now.toDateString() ? 'HH:mm' : 'M/d HH:mm')
    : '알 수 없음';
  const stale = !!timetableData && isTimetableStale(timetableData.lastUpdated, now);
  const outage = useComciganOutageStore((s) => s.outage);

  let body: React.ReactNode;
  if (periods.length === 0) {
    body = <div style={styles.muted}>오늘은 수업이 없어요</div>;
  } else if (!current && !next) {
    body = <div style={styles.muted}>오늘 수업 {periods.length}개 모두 끝났어요 </div>;
  } else {
    body = (
      <>
        {current && (
          <div style={styles.classLine}>
            <span style={{ ...styles.classTag, background: 'var(--accent)' }}>수업 중</span>
            <span style={styles.classText}>{formatClassLabel(current)}</span>
            <span style={styles.muted}>~{formatMinutes(current.endMin)}</span>
          </div>
        )}
        {next && (
          <div style={styles.classLine}>
            <span style={{ ...styles.classTag, background: 'var(--success)' }}>
              {next.startMin - nowMin}분 후
            </span>
            <span style={styles.classText}>{formatClassLabel(next)}</span>
            <span style={styles.muted}>{formatMinutes(next.startMin)}</span>
          </div>
        )}
        <div style={styles.subRow}>
          <span>오늘 수업 {periods.length}개 · 남은 수업 {remaining}개</span>
        </div>
      </>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <span style={styles.cardLabel}>내 수업 · {format(now, 'EEE요일', { locale: ko })}</span>
        <button
          onClick={() => { fetchTimetable(); }}
          style={styles.iconBtn}
          title="시간표 다시 확인"
          aria-label="시간표 다시 확인"
          disabled={refreshing}
        >
          <RefreshCw size={11} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>
      {body}
      <div style={{ ...styles.subRow, ...(stale ? styles.staleRow : {}) }}>
        {stale ? `시간표를 확인하지 못했습니다 · ${checkedLabel} 기준` : `${checkedLabel} 확인`}
        {outage && <ComciganCallButton style={{ marginLeft: 6 }} />}
      </div>
    </div>
  );
}

function DDayStrip() {
  const events = useVisibleEvents();
  const { customDDays, hiddenAutoDDays, addCustomDDay, removeCustomDDay, hideAutoDDay } = useWidgetStore();
  // 직접 넣은 D-Day는 개인 내용이다. 학사일정에서 온 자동 D-Day만 남긴다.
  const hidden = usePersonalHidden();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');

  const items = useMemo(
    () => collectDDays(events, hidden ? NO_CUSTOM_DDAYS : customDDays, hiddenAutoDDays).slice(0, MAX_DDAY_CHIPS),
    [events, hidden, customDDays, hiddenAutoDDays],
  );

  const submit = () => {
    if (!title.trim() || !date) return;
    addCustomDDay(title, date);
    setTitle(''); setDate(''); setAdding(false);
  };

  return (
    <div style={styles.ddayRow}>
      {items.length === 0 && (!adding || hidden) && (
        <span style={styles.muted}>다가오는 시험·방학 일정이 없어요</span>
      )}
      {items.map((d) => (
        <span
          key={d.key}
          style={{ ...styles.ddayChip, ...(d.days <= 7 ? styles.ddayChipSoon : {}) }}
          title={`${d.title} · ${format(d.date, 'M월 d일 (EEE)', { locale: ko })}${d.customId ? ' · 직접 추가' : ' · 학사일정'}`}
        >
          <strong>{formatDDay(d.days)}</strong>
          <span style={styles.ddayTitle}>{d.title}</span>
          <button
            onClick={() => (d.customId ? removeCustomDDay(d.customId) : hideAutoDDay(d.key))}
            style={styles.chipX}
            title={d.customId ? '삭제' : '숨기기'}
            aria-label={`${d.title} D-Day ${d.customId ? '삭제' : '숨기기'}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {hidden ? null : adding ? (
        <span style={styles.ddayForm}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="이름"
            maxLength={20}
            style={{ ...styles.ddayInput, width: 80 }}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={styles.ddayInput}
          />
          <button onClick={submit} style={styles.ddayAddBtn} disabled={!title.trim() || !date}>추가</button>
          <button onClick={() => setAdding(false)} style={styles.chipX} aria-label="취소"><X size={11} /></button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)} style={styles.ddayPlus} title="D-Day 직접 추가">
          <Plus size={11} /> D-Day
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  cardRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  card: {
    flex: '1 1 160px',
    minWidth: 0,
    padding: '7px 9px',
    borderRadius: 'var(--radius-md, 8px)',
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 'var(--fs-caption)',
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  iconBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 2,
    display: 'flex',
  },
  weatherMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  bigText: {
    fontSize: 'var(--fs-heading)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  muted: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  subRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-secondary)',
  },
  staleRow: {
    fontWeight: 600,
    color: 'var(--danger)',
  },
  airBadge: {
    color: 'var(--on-accent)',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 8,
  },
  classLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  classTag: {
    flexShrink: 0,
    fontSize: 'var(--fs-caption)',
    fontWeight: 700,
    color: 'var(--on-accent)',
    padding: '1px 6px',
    borderRadius: 8,
  },
  classText: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  ddayRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  ddayChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    fontSize: 'var(--fs-label)',
    padding: '2px 4px 2px 8px',
    borderRadius: 12,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  ddayChipSoon: {
    borderColor: 'var(--danger)',
    color: 'var(--danger)',
  },
  ddayTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 120,
  },
  chipX: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 2,
    display: 'flex',
    borderRadius: 6,
  },
  ddayPlus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    fontSize: 'var(--fs-label)',
    padding: '2px 8px',
    borderRadius: 12,
    border: '1px dashed var(--border-color)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  ddayForm: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  ddayInput: {
    fontSize: 'var(--fs-label)',
    padding: '2px 6px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  },
  ddayAddBtn: {
    fontSize: 'var(--fs-label)',
    padding: '2px 8px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
};

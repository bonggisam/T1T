import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { RepeatConfig } from '@shared/types';
import { defaultUntil, expandOccurrences, MAX_OCCURRENCES, nthOfMonth } from '../../utils/repeat';

interface RepeatPickerProps {
  start: Date | null;
  end: Date | null;
  value: RepeatConfig | null;
  onChange: (value: RepeatConfig | null) => void;
}

type Choice = 'none' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'monthlyNth';

const WEEKDAY_ORDER: Array<[number, string]> = [[1, '월'], [2, '화'], [3, '수'], [4, '목'], [5, '금'], [6, '토'], [0, '일']];
const NTH_LABELS = ['', '첫째', '둘째', '셋째', '넷째', '다섯째'];
const PREVIEW_DATES = 3;

function choiceOf(value: RepeatConfig | null): Choice {
  if (!value) return 'none';
  if (value.type === 'weekly') return value.interval === 2 ? 'biweekly' : 'weekly';
  return value.type;
}

/** 저장 전에 회차를 확인해 "이 설정으로 저장할 수 없는 이유"를 돌려준다. 없으면 null */
export function repeatProblem(start: Date, end: Date, value: RepeatConfig | null): string | null {
  if (!value) return null;
  if (value.type === 'weekly' && !(value.daysOfWeek?.length)) return '반복할 요일을 골라 주세요';
  const { occurrences, truncated } = expandOccurrences(start, end, value);
  if (truncated) return `반복은 ${MAX_OCCURRENCES}회까지 만들 수 있습니다. 종료일을 앞당겨 주세요`;
  if (occurrences.length === 0) return '이 설정에 맞는 날짜가 없습니다';
  return null;
}

export function RepeatPicker({ start, end, value, onChange }: RepeatPickerProps) {
  const choice = choiceOf(value);
  const valid = !!start && !!end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());

  function choose(next: Choice) {
    if (next === 'none' || !valid) {
      onChange(null);
      return;
    }
    const base = {
      until: value?.until ?? defaultUntil(start!),
      skipHolidays: value?.skipHolidays ?? true,
    };
    if (next === 'weekly' || next === 'biweekly') {
      onChange({
        ...base,
        type: 'weekly',
        interval: next === 'biweekly' ? 2 : 1,
        daysOfWeek: value?.type === 'weekly' && value.daysOfWeek?.length ? value.daysOfWeek : [start!.getDay()],
      });
    } else {
      onChange({ ...base, type: next, interval: 1 });
    }
  }

  function toggleDay(day: number) {
    if (!value) return;
    const days = value.daysOfWeek ?? [];
    onChange({ ...value, daysOfWeek: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  }

  const preview = useMemo(() => {
    if (!value || !valid) return null;
    return expandOccurrences(start!, end!, value);
  }, [value, valid, start?.getTime(), end?.getTime()]);

  const problem = value && valid ? repeatProblem(start!, end!, value) : null;

  // 그 날이 없는 달은 건너뛰므로 미리 알린다 (예: 매월 31일이면 11월이 빠진다)
  const skipNote = !value || !valid ? null
    : value.type === 'monthly' && start!.getDate() >= 29 ? `${start!.getDate()}일이 없는 달은 건너뜁니다.`
    : value.type === 'monthlyNth' && nthOfMonth(start!) >= 5 ? `${NTH_LABELS[nthOfMonth(start!)]} ${format(start!, 'EEEE', { locale: ko })}이 없는 달은 건너뜁니다.`
    : null;

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={styles.label}>반복</span>
        <select
          value={choice}
          onChange={(e) => choose(e.target.value as Choice)}
          style={styles.select}
          aria-label="반복"
          disabled={!valid}
        >
          <option value="none">안 함</option>
          <option value="weekdays">평일 매일</option>
          <option value="weekly">매주</option>
          <option value="biweekly">격주</option>
          {valid && <option value="monthly">매월 {start!.getDate()}일</option>}
          {valid && (
            <option value="monthlyNth">
              매월 {NTH_LABELS[nthOfMonth(start!)]} {format(start!, 'EEEE', { locale: ko })}
            </option>
          )}
        </select>
      </div>

      {value && (
        <>
          {value.type === 'weekly' && (
            <div style={styles.days} role="group" aria-label="반복할 요일">
              {WEEKDAY_ORDER.map(([day, label]) => {
                const active = value.daysOfWeek?.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={active}
                    style={{ ...styles.day, ...(active ? styles.dayActive : {}) }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <div style={styles.row}>
            <span style={styles.label}>종료일</span>
            <input
              type="date"
              value={value.until}
              onChange={(e) => { if (e.target.value) onChange({ ...value, until: e.target.value }); }}
              aria-label="반복 종료일"
              style={styles.dateInput}
            />
            <label style={styles.check}>
              <input
                type="checkbox"
                checked={value.skipHolidays}
                onChange={(e) => onChange({ ...value, skipHolidays: e.target.checked })}
              />
              공휴일 건너뛰기
            </label>
          </div>
          {problem ? (
            <div style={styles.problem}>{problem}</div>
          ) : preview && (
            <div style={styles.preview}>
              총 {preview.occurrences.length}회 ·{' '}
              {preview.occurrences.slice(0, PREVIEW_DATES).map((o) => format(o.start, 'M/d')).join(', ')}
              {preview.occurrences.length > PREVIEW_DATES && ` … ${format(preview.occurrences[preview.occurrences.length - 1].start, 'M/d')}`}
              {skipNote && <div>{skipNote}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  label: {
    flexShrink: 0,
    width: 40,
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  select: {
    flex: 1,
    minWidth: 0,
    padding: '5px 8px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  days: {
    display: 'flex',
    gap: 3,
    paddingLeft: 46,
  },
  day: {
    flex: 1,
    padding: '3px 0',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  dayActive: {
    background: 'var(--accent)',
    borderColor: 'transparent',
    color: 'var(--on-accent)',
  },
  dateInput: {
    flex: '1 1 110px',
    minWidth: 0,
    padding: '4px 6px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    colorScheme: 'light dark',
  },
  check: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  preview: {
    paddingLeft: 46,
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  problem: {
    paddingLeft: 46,
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    color: 'var(--danger)',
  },
};

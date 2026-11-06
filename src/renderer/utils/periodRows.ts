import { classDurationMin } from './classPeriods';

/**
 * 오늘·주 화면을 교시 기준으로 그릴 때 쓰는 줄. 시정표에서 만든다.
 * 일정은 시작 시각이 들어가는 교시 줄에 놓는다 (쉬는 시간에 시작하면 앞 교시 줄).
 */
export interface PeriodRow {
  kind: 'period' | 'lunch';
  period: number;
  label: string;
  /** 표시할 시작 시각 */
  time: string;
  startMin: number;
  /** 수업이 끝나는 시각 */
  endMin: number;
  /** 다음 줄이 시작하는 시각. 일정을 줄에 나눌 때 쓴다 */
  untilMin: number;
}

/** 시정표에서 점심시간으로 볼 빈 시간 (분) */
const LUNCH_GAP_MIN = 30;
const END_OF_DAY = 24 * 60;

function parseStarts(classTimes: string[]): Array<{ period: number; startMin: number; time: string }> {
  const out: Array<{ period: number; startMin: number; time: string }> = [];
  classTimes.forEach((entry, index) => {
    const m = entry.match(/(\d{1,2}):(\d{2})/);
    if (m) {
      out.push({
        period: index + 1,
        startMin: Number(m[1]) * 60 + Number(m[2]),
        time: `${m[1].padStart(2, '0')}:${m[2]}`,
      });
    }
  });
  return out;
}

function formatMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 시정표가 없거나 너무 짧으면 null. 그때는 시간 눈금 화면을 쓴다. */
export function buildPeriodRows(classTimes: string[] | undefined): PeriodRow[] | null {
  const starts = parseStarts(classTimes ?? []);
  if (starts.length < 4) return null;
  const duration = classDurationMin(classTimes);
  const rows: PeriodRow[] = [];
  starts.forEach((start, i) => {
    const next = starts[i + 1];
    const endMin = start.startMin + duration;
    const hasLunchAfter = !!next && next.startMin - endMin >= LUNCH_GAP_MIN;
    rows.push({
      kind: 'period',
      period: start.period,
      label: `${start.period}교시`,
      time: start.time,
      startMin: start.startMin,
      endMin,
      untilMin: hasLunchAfter ? endMin : next?.startMin ?? endMin,
    });
    if (hasLunchAfter) {
      rows.push({
        kind: 'lunch',
        period: start.period,
        label: '점심',
        time: formatMin(endMin),
        startMin: endMin,
        endMin: next.startMin,
        untilMin: next.startMin,
      });
    }
  });
  return rows;
}

/** 일정 시작 시각(분)이 어느 줄에 들어가는지. -1=첫 교시 전, rows.length=마지막 교시 뒤 */
export function rowIndexForMinute(rows: PeriodRow[], minute: number): number {
  if (minute < rows[0].startMin) return -1;
  const last = rows[rows.length - 1];
  // 마지막 교시가 끝난 뒤는 방과후다. 끝나기 전까지는 마지막 교시 줄이다.
  if (minute >= last.endMin) return rows.length;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (minute >= rows[i].startMin) return i;
  }
  return -1;
}

export { END_OF_DAY };

/**
 * 월 화면 한 주의 일정 배치. 여러 날 일정이 칸마다 끊기지 않고 이어진 막대가 되도록 레인을 나눈다.
 */

export interface WeekItem<T> {
  item: T;
  /** 이 주 안에서 시작 칸과 차지하는 칸 수 */
  col: number;
  span: number;
  /** 지난주나 다음 주로 이어지는 일정이면 그쪽 모서리를 닫지 않는다 */
  continuesLeft: boolean;
  continuesRight: boolean;
  /** 같은 길이끼리의 순서. 이른 일정이 위로 간다 (종일은 -1) */
  sortKey: number;
}

export interface PlacedItem<T> extends WeekItem<T> {
  lane: number;
}

export interface WeekLayout<T> {
  placed: PlacedItem<T>[];
  /** 칸마다 자리가 없어 못 넣은 개수 */
  overflow: number[];
}

/** 일정의 시작·끝 날짜를 이 주의 칸으로 옮긴다. 이 주에 없으면 null */
export function toWeekItem<T>(
  item: T,
  start: Date,
  end: Date,
  weekDays: Date[],
  sortKey: number,
): WeekItem<T> | null {
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const dayTimes = weekDays.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
  const first = dayTimes[0];
  const last = dayTimes[dayTimes.length - 1];
  if (endDay < first || startDay > last) return null;
  const col = dayTimes.findIndex((t) => t >= startDay);
  let lastCol = dayTimes.length - 1;
  while (lastCol > col && dayTimes[lastCol] > endDay) lastCol--;
  return {
    item,
    col,
    span: lastCol - col + 1,
    continuesLeft: startDay < first,
    continuesRight: endDay > last,
    sortKey,
  };
}

/** 긴 일정부터 위 레인에 놓는다. 그래야 여러 날 막대가 주 안에서 끊기지 않고 곧게 이어진다. */
export function layoutWeek<T>(items: WeekItem<T>[], columns: number, maxLanes: number): WeekLayout<T> {
  const sorted = [...items].sort((a, b) => (b.span - a.span) || (a.sortKey - b.sortKey) || (a.col - b.col));
  const lanes: boolean[][] = [];
  const placed: PlacedItem<T>[] = [];
  const overflow = new Array<number>(columns).fill(0);

  for (const entry of sorted) {
    let lane = 0;
    for (; lane < maxLanes; lane++) {
      lanes[lane] = lanes[lane] ?? [];
      let free = true;
      for (let c = entry.col; c < entry.col + entry.span; c++) {
        if (lanes[lane][c]) { free = false; break; }
      }
      if (free) break;
    }
    if (lane >= maxLanes) {
      for (let c = entry.col; c < entry.col + entry.span; c++) overflow[c] += 1;
      continue;
    }
    for (let c = entry.col; c < entry.col + entry.span; c++) lanes[lane][c] = true;
    placed.push({ ...entry, lane });
  }
  return { placed, overflow };
}

/**
 * 칸 높이에 맞춰 배치한다. 넘치는 일정이 있으면 "+N" 줄을 넣을 자리를 한 레인 비운다.
 */
export function layoutWeekToFit<T>(items: WeekItem<T>[], columns: number, lanesThatFit: number): WeekLayout<T> & { lanes: number } {
  const full = layoutWeek(items, columns, lanesThatFit);
  if (full.overflow.every((n) => n === 0) || lanesThatFit <= 1) return { ...full, lanes: lanesThatFit };
  const lanes = lanesThatFit - 1;
  return { ...layoutWeek(items, columns, lanes), lanes };
}

/** 시간이 겹치는 일정을 나란히 놓을 줄을 정한다. 겹치면 뒤의 일정이 앞의 일정을 가려 누를 수 없다 */
export interface LaneItem {
  id: string;
  startMin: number;
  endMin: number;
}

export interface LanePlace {
  lane: number;
  lanes: number;
}

export function layoutLanes(items: LaneItem[]): Map<string, LanePlace> {
  const places = new Map<string, LanePlace>();
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  let group: Array<{ item: LaneItem; lane: number }> = [];
  let groupEnd = -Infinity;

  const flush = () => {
    const lanes = group.reduce((max, g) => Math.max(max, g.lane + 1), 1);
    group.forEach((g) => places.set(g.item.id, { lane: g.lane, lanes }));
    group = [];
  };

  for (const item of sorted) {
    if (item.startMin >= groupEnd) {
      flush();
      groupEnd = -Infinity;
    }
    // 앞줄부터 비어 있는 줄을 찾는다
    let lane = 0;
    while (group.some((g) => g.lane === lane && g.item.endMin > item.startMin)) lane += 1;
    group.push({ item, lane });
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  flush();
  return places;
}

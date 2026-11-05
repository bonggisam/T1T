/**
 * 컴시간이 막혔는지 판단한다.
 *
 * 시간표가 오래되었다고 바로 막힌 것은 아니다. 막 켰거나 절전에서 돌아온 PC는 갱신할 시간이 필요하다.
 * 오래된 상태가 이어질 때만 막힌 것으로 보고, 그때 운영자에게 알릴 수 있게 한다.
 */

/** 오래된 시간표가 이만큼 이어지면 막힌 것으로 본다. 앱은 5분마다 다시 받는다. */
export const OUTAGE_GRACE_MS = 10 * 60 * 1000;
/** 확인 간격이 이보다 벌어졌으면 PC가 잠들었다 깬 것이다. 기다리는 시간을 처음부터 잰다. */
const SLEEP_GAP_MS = 5 * 60 * 1000;

export interface OutageTracker {
  staleSince: number | null;
  lastTick: number | null;
  outage: boolean;
}

export const INITIAL_OUTAGE: OutageTracker = { staleSince: null, lastTick: null, outage: false };

export function trackOutage(prev: OutageTracker, stale: boolean, now: number): OutageTracker {
  if (!stale) return { staleSince: null, lastTick: now, outage: false };
  const slept = prev.lastTick !== null && now - prev.lastTick > SLEEP_GAP_MS;
  const staleSince = prev.staleSince === null || slept ? now : prev.staleSince;
  return { staleSince, lastTick: now, outage: now - staleSince >= OUTAGE_GRACE_MS };
}

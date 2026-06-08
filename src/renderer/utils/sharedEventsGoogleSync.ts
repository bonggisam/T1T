/**
 * 공유 학교 일정 + 학사일정 → 사용자 개인 Google Calendar로 푸시 동기화.
 *
 * 동작:
 *   - 각 사용자의 앱이 자신의 Google Calendar에 push
 *   - 본인 학교 또는 'all' 일정만 푸시 (다른 학교는 제외)
 *   - 푸시한 매핑은 localStorage에 사용자별 저장 (eventId → googleId + updatedAt)
 *   - 이벤트 변경 시 update, 삭제 시 delete까지 자동 처리
 *
 * 절대 영향 없음:
 *   - personal_events (개인 일정)는 이 모듈이 건드리지 않음
 *   - 개인 일정의 Firestore 권한은 그대로 (userId만 read/write)
 *   - 즉, 개인 일정은 절대 다른 사용자에게 공유되지 않음
 */

import type { CalendarEvent, School, PersonalEvent } from '@shared/types';
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  isGoogleConnected,
} from './calendarSync';

interface PushedEntry {
  googleId: string;
  /** 마지막으로 push한 Firestore event의 updatedAt (milliseconds) */
  syncedAt: number;
}

type PushedMap = Record<string, PushedEntry>;

function mapKey(userId: string): string {
  return `t1t-shared-pushed-${userId}`;
}

function loadMap(userId: string): PushedMap {
  try {
    const raw = localStorage.getItem(mapKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as PushedMap;
    return {};
  } catch {
    return {};
  }
}

/**
 * 우리가 push한 Google event id 집합 — 개인 뷰에서 중복 표시 방지용.
 * personalEventStore.syncExternalCalendars가 호출해 Google pull 결과에서 필터링.
 */
export function loadSharedPushedGoogleIds(userId: string): Set<string> {
  const map = loadMap(userId);
  return new Set(Object.values(map).map((e) => e.googleId));
}

/** T1T 우리 push 이벤트 prefix 패턴 — 옛/새 형식 모두 매칭 */
export const T1T_PUSHED_TITLE_RE = /^\[(공유|학사|(중|고|전체)·(공유|학사))\]\s/;

/**
 * Google Calendar에서 고아 T1T 이벤트 정리.
 * 우리 prefix는 있지만 현재 사용자 매핑에는 없는 이벤트 = 옛 random-ID push 잔재 or
 * localStorage wipe 후 매핑 잃은 이벤트.
 * → 모바일/웹 Google 캘린더에서 중복 표시되는 원인.
 *
 * googleEvents는 이미 pull한 결과 (추가 API 호출 없음). DELETE만 호출.
 *
 * 안전 가드 (사용자가 만든 [공유] 같은 이벤트를 잘못 지우지 않도록):
 *   1) T1T prefix `[중·공유]` 등 매칭
 *   2) 매핑에 없음
 *   3) 둘 중 하나 확인:
 *      a) externalId가 'tev'로 시작 (deriveGoogleEventId가 만든 deterministic ID)
 *      b) description에 'T1T 학사일정' 또는 'T1T 공유 일정' 마커 포함
 *      → 우리가 push한 것임을 강하게 보장
 */
export async function cleanupOrphanedT1TGoogleEvents(
  userId: string,
  googleEvents: PersonalEvent[],
): Promise<number> {
  const pushedIds = loadSharedPushedGoogleIds(userId);
  const orphans = googleEvents.filter((e) => {
    // 1) T1T prefix 매칭
    if (!T1T_PUSHED_TITLE_RE.test(e.title)) return false;
    // 2) 매핑에 있으면 정상 push 결과
    if (e.externalId && pushedIds.has(e.externalId)) return false;
    // 3) 우리가 만든 것임을 추가 확인 (사용자 자작 [공유] 이벤트 보호)
    const isOurDeterministicId = typeof e.externalId === 'string' && e.externalId.startsWith('tev');
    const hasOurMarker = /T1T (학사일정|공유 일정)/.test(e.description || '');
    if (!isOurDeterministicId && !hasOurMarker) return false;
    return true;
  });
  let deleted = 0;
  for (const orphan of orphans) {
    if (!orphan.externalId) continue;
    try {
      await deleteGoogleEvent(orphan.externalId);
      deleted++;
    } catch (err) {
      console.warn(`[SharedGoogleSync] orphan delete failed for ${orphan.externalId}:`, err);
    }
  }
  if (deleted > 0) {
    console.log(`[SharedGoogleSync] Cleaned ${deleted} orphaned T1T events from Google Calendar.`);
  }
  return deleted;
}

function saveMap(userId: string, map: PushedMap): void {
  try {
    localStorage.setItem(mapKey(userId), JSON.stringify(map));
  } catch (e) {
    console.warn('[SharedGoogleSync] save mapping failed:', e);
  }
}

/** 사용자에게 관련 있는 이벤트인지 — 본인 학교 + 'all' 만 */
function isRelevantToUser(event: CalendarEvent, userSchool: School): boolean {
  return event.school === userSchool || event.school === 'all';
}

/** Google Calendar 이벤트 제목 만들기 — 학교(중/고/전체) + 종류(공유/학사) 표시 */
function buildGoogleTitle(event: CalendarEvent): string {
  const isSchoolSchedule = (event as any).schoolScheduleImport === true;
  const kind = isSchoolSchedule ? '학사' : '공유';
  const schoolLabel =
    event.school === 'taeseong_middle' ? '중' :
    event.school === 'taeseong_high' ? '고' : '전체';
  return `[${schoolLabel}·${kind}] ${event.title}`;
}

/**
 * Firestore eventId → 결정론적 Google Calendar event ID 도출.
 * 같은 Firestore eventId는 항상 같은 Google ID 생성 → 다중 디바이스/재설치에도 중복 방지.
 * Google 규칙: 소문자 a-v + 0-9, 길이 5-1024 (w,x,y,z는 허용 안 됨 → 매핑)
 */
function deriveGoogleEventId(firestoreId: string): string {
  const lowered = firestoreId.toLowerCase();
  let result = '';
  for (const ch of lowered) {
    if ((ch >= 'a' && ch <= 'v') || (ch >= '0' && ch <= '9')) {
      result += ch;
    } else if (ch === 'w') result += '0';
    else if (ch === 'x') result += '1';
    else if (ch === 'y') result += '2';
    else if (ch === 'z') result += '3';
    // 그 외 문자는 제거 (대시, 언더스코어 등)
  }
  // 'tev' 접두어 — 사용자 다른 이벤트 ID와 충돌 안 함 + 최소 길이 5 보장
  return ('tev' + result).slice(0, 256);
}

function buildGoogleDescription(event: CalendarEvent): string {
  const lines: string[] = [];
  if (event.description) lines.push(event.description);
  lines.push('---');
  lines.push(`T1T ${(event as any).schoolScheduleImport ? '학사일정' : '공유 일정'}`);
  if (event.adminName) lines.push(`등록: ${event.adminName}`);
  if (event.category && event.category !== 'event') {
    const catLabel: Record<string, string> = {
      meeting: '회의', deadline: '마감', notice: '공지', other: '기타',
    };
    lines.push(`종류: ${catLabel[event.category] || event.category}`);
  }
  if (event.school && event.school !== 'all') {
    lines.push(`학교: ${event.school === 'taeseong_middle' ? '태성중' : '태성고'}`);
  } else if (event.school === 'all') {
    lines.push('학교: 전체');
  }
  return lines.join('\n');
}

/** 진행 중 sync 락 — 동시 호출 방지 (race로 중복 push 방지) */
let syncing = false;

const MIGRATION_KEY = 't1t-shared-pushed-migration';
const MIGRATION_VERSION = 'v2-deterministic-id-school-label';

/**
 * 마이그레이션:
 * - v2.5.34~v2.5.36 사용자: random ID로 push된 Google 이벤트 존재 → 삭제
 * - v2.5.37+: 결정론적 ID로 재push → 중복 없음 + 중/고 표시 적용
 */
async function migrateIfNeeded(userId: string): Promise<void> {
  const done = localStorage.getItem(MIGRATION_KEY);
  if (done === MIGRATION_VERSION) return;
  const map = loadMap(userId);
  if (Object.keys(map).length === 0) {
    // 새 사용자 — 마이그레이션 불필요, 마크만
    localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
    return;
  }
  console.log('[SharedGoogleSync] Running migration: deleting old random-ID Google events…');
  let deleted = 0;
  for (const [eventId, entry] of Object.entries(map)) {
    // 결정론적 ID와 다르면 = random ID로 push된 옛 데이터 → Google에서 삭제
    const expected = deriveGoogleEventId(eventId);
    if (entry.googleId !== expected) {
      try {
        await deleteGoogleEvent(entry.googleId);
        deleted++;
      } catch (err) {
        console.warn(`[SharedGoogleSync] migration delete failed for ${eventId}:`, err);
      }
    }
  }
  // 매핑 모두 초기화 → 다음 sync에서 결정론적 ID로 재push (중/고 표시 포함)
  saveMap(userId, {});
  localStorage.setItem(MIGRATION_KEY, MIGRATION_VERSION);
  console.log(`[SharedGoogleSync] Migration done: ${deleted} old events deleted from Google. Will re-push with deterministic IDs.`);
}

/**
 * 공유 이벤트 배열을 사용자의 Google Calendar에 반영.
 * @param userId 현재 로그인한 사용자 ID
 * @param userSchool 사용자 학교 (관련 이벤트 필터링용)
 * @param events 현재 Firestore에서 받은 모든 공유 이벤트 (학사일정 포함)
 */
export async function syncSharedEventsToGoogle(
  userId: string,
  userSchool: School,
  events: CalendarEvent[],
): Promise<{ created: number; updated: number; deleted: number; skipped: number; errors: number }> {
  const result = { created: 0, updated: 0, deleted: 0, skipped: 0, errors: 0 };
  if (!isGoogleConnected()) { return result; }
  if (syncing) { return result; }
  syncing = true;

  try {
    // v2.5.36 이전 random ID 옛 데이터 정리 (1회만 실행됨)
    await migrateIfNeeded(userId);

    const map = loadMap(userId);
    const relevant = events.filter((e) => isRelevantToUser(e, userSchool));
    const relevantIds = new Set(relevant.map((e) => e.id));

    // 1. 삭제 — 매핑에는 있지만 현재 events 배열에 없음 → Google에서도 삭제
    for (const [eventId, entry] of Object.entries(map)) {
      if (!relevantIds.has(eventId)) {
        try {
          await deleteGoogleEvent(entry.googleId);
          delete map[eventId];
          result.deleted++;
        } catch (err) {
          console.warn(`[SharedGoogleSync] delete failed for ${eventId}:`, err);
          // 매핑에서 제거하지 않음 — 다음 시도에 재시도
          result.errors++;
        }
      }
    }

    // 2. 생성/업데이트
    for (const ev of relevant) {
      const existing = map[ev.id];
      const eventUpdatedAt = (ev as any).updatedAt?.getTime?.() || ev.startDate.getTime();

      if (!existing) {
        // 신규 push — 결정론적 ID로 다중 디바이스/재설치에도 중복 방지
        const customEventId = deriveGoogleEventId(ev.id);
        try {
          const googleId = await createGoogleEvent({
            title: buildGoogleTitle(ev),
            description: buildGoogleDescription(ev),
            startDate: ev.startDate,
            endDate: ev.endDate,
            allDay: ev.allDay,
            customEventId,
          });
          if (googleId) {
            map[ev.id] = { googleId, syncedAt: eventUpdatedAt };
            result.created++;
          } else {
            result.errors++;
          }
        } catch (err) {
          console.warn(`[SharedGoogleSync] create failed for ${ev.id}:`, err);
          result.errors++;
        }
      } else if (existing.syncedAt < eventUpdatedAt) {
        // 업데이트 (Firestore가 더 최신)
        try {
          const ok = await updateGoogleEvent(existing.googleId, {
            title: buildGoogleTitle(ev),
            description: buildGoogleDescription(ev),
            startDate: ev.startDate,
            endDate: ev.endDate,
            allDay: ev.allDay,
          });
          if (ok) {
            map[ev.id] = { googleId: existing.googleId, syncedAt: eventUpdatedAt };
            result.updated++;
          } else {
            result.errors++;
          }
        } catch (err) {
          console.warn(`[SharedGoogleSync] update failed for ${ev.id}:`, err);
          result.errors++;
        }
      } else {
        result.skipped++;
      }
    }

    saveMap(userId, map);
    // push 완료 후 pull 강제 트리거 → 우리가 방금 push한 이벤트가 personal 뷰에 노출되지 않도록 sync state 즉시 갱신.
    // 직접 import 시 순환 의존이 생기므로 동적 import 사용.
    if (result.created + result.updated + result.deleted > 0) {
      import('../store/personalEventStore').then(({ usePersonalEventStore }) => {
        usePersonalEventStore.getState().syncExternalCalendars().catch(() => {});
      }).catch(() => {});
    }
    return result;
  } finally {
    syncing = false;
  }
}

/**
 * Google Calendar 연동 해제 시 모든 push 매핑 + Google 측 이벤트 정리.
 * (옵션 — 사용자가 명시적으로 호출하지 않으면 기존 이벤트는 Google에 남음)
 */
export async function clearSharedGooglePushes(userId: string): Promise<number> {
  if (!isGoogleConnected()) return 0;
  const map = loadMap(userId);
  let deleted = 0;
  for (const entry of Object.values(map)) {
    try {
      await deleteGoogleEvent(entry.googleId);
      deleted++;
    } catch {}
  }
  try {
    localStorage.removeItem(mapKey(userId));
  } catch {}
  return deleted;
}

/**
 * External calendar sync — Google Calendar via Electron OAuth
 */

import type { PersonalEvent } from '@shared/types';

// ============================================================
// allDay 날짜 유틸 — 타임존 안전
// ============================================================

/**
 * Date → 로컬 타임존 기준 YYYY-MM-DD (Google allDay 이벤트용).
 *
 * 주의: 절대 toISOString().slice(0,10) 쓰지 말 것!
 *   - toISOString()은 UTC 기준 — KST(UTC+9) 자정은 전날 15:00 UTC
 *   - → slice(0,10)이 전날 날짜를 반환 (금→목 시프트)
 */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "YYYY-MM-DD" → 로컬 타임존 자정 Date.
 *
 * 주의: 절대 new Date("YYYY-MM-DD") 직접 쓰지 말 것!
 *   - ISO 날짜-only 문자열은 UTC 자정으로 파싱됨
 *   - KST에서는 그날 09:00이 됨 (자정 아님)
 *   - "T00:00:00" 붙이면 로컬 자정으로 파싱됨
 */
function parseLocalYMD(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

// ============================================================
// Google Calendar
// ============================================================

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

let googleTokens: GoogleTokens | null = null;
// M1: refresh 중복 호출 방지용 in-flight promise
let refreshPromise: Promise<boolean> | null = null;
// 429/403 Rate Limit backoff — 이 시간까지는 Google 호출(fetch/create/reconcile) 건너뜀
let rateLimitedUntil = 0;
/** reconcile 등 호출자가 제한 중인지 확인해 사이클을 통째로 건너뛰도록 */
export function isGoogleRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}
function applyRateLimit(status: number, retryAfterHeader: string | null): void {
  const ra = parseInt(retryAfterHeader || '0', 10);
  const floorSec = status === 429 ? 60 : 120; // 403(quota/권한)은 조금 더 길게
  rateLimitedUntil = Date.now() + Math.max(isNaN(ra) ? 0 : ra, floorSec) * 1000;
  console.warn(`[Google Sync] ${status} — pausing Google calls for ${Math.round((rateLimitedUntil - Date.now()) / 1000)}s`);
}

// 현재 로그인 사용자 — Google 토큰을 사용자별 키로 분리 저장하기 위함
let currentUserId: string | null = null;
/** 옛 버전의 공용 토큰 키 — 누구 것인지 알 수 없어 복원하지 않고 제거만 한다 */
const LEGACY_TOKEN_KEY = 'cal_tokens_google';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5분 여유
const TOKEN_SAFETY_MARGIN_SEC = 30; // M7: expires_in에서 빼서 안전 마진 확보

/** 현재 사용자 IANA 타임존 (예: 'Asia/Seoul'). Google dateTime 이벤트에 명시 → 타임존 이동해도 시간 유지 */
function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

export function isGoogleConnected(): boolean {
  // refresh_token이 있으면 만료되어도 연결된 것으로 간주 (자동 갱신 가능)
  if (googleTokens === null) return false;
  if (googleTokens.refresh_token) return true;
  return googleTokens.expires_at > Date.now() + TOKEN_EXPIRY_BUFFER_MS;
}

/** Date.now() + expires_in을 안전 마진 적용해 변환 */
function computeExpiresAt(expiresInSec: number): number {
  const safeSec = Math.max(expiresInSec - TOKEN_SAFETY_MARGIN_SEC, 60);
  return Date.now() + safeSec * 1000;
}

/** access_token 만료 시 refresh_token으로 자동 갱신 (M1: 동시 호출 안전) */
async function ensureValidToken(): Promise<boolean> {
  if (!googleTokens) return false;
  // 아직 유효하면 통과
  if (googleTokens.expires_at > Date.now() + TOKEN_EXPIRY_BUFFER_MS) return true;
  // refresh_token이 없으면 갱신 불가 → 재인증 필요
  if (!googleTokens.refresh_token) {
    googleTokens = null;
    return false;
  }
  // 이미 갱신 중이면 그 결과를 공유 (race condition 방지)
  if (refreshPromise) return refreshPromise;

  const currentRefresh = googleTokens.refresh_token;
  refreshPromise = (async () => {
    try {
      const result = await window.electronAPI?.googleRefresh(currentRefresh);
      if (result && 'access_token' in result) {
        googleTokens = {
          access_token: result.access_token,
          refresh_token: currentRefresh, // 기존 refresh_token 유지
          expires_at: computeExpiresAt(result.expires_in),
        };
        saveTokensToStorage('google', googleTokens);
        console.log('[CalendarSync] Token refreshed');
        return true;
      }
      // 갱신 실패 사유 노출 (사용자에게 친절한 안내)
      const errMsg = (result && 'error' in result) ? result.error : '알 수 없음';
      console.warn('[CalendarSync] Refresh failed:', errMsg);
      googleTokens = null;
      removeTokensFromStorage('google');
      // 사용자에게 재인증 안내 토스트
      window.dispatchEvent(new CustomEvent('google:auth-expired', {
        detail: { reason: 'refresh-failed', error: errMsg },
      }));
      return false;
    } catch (e) {
      console.warn('[CalendarSync] Refresh exception:', e);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/**
 * Google OAuth via Electron main process BrowserWindow.
 * Opens a native window for login, captures token on redirect.
 */
export async function connectGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await window.electronAPI?.googleAuth();
    if (!result) return { success: false, error: '응답 없음' };
    if ('error' in result) {
      console.warn('[CalendarSync] Google auth returned error:', result.error);
      return { success: false, error: result.error };
    }
    // refresh_token이 응답에 없으면 기존 것 유지 (Google이 매번 발급하지 않을 수 있음)
    const existingRefresh = googleTokens?.refresh_token || loadTokensFromStorage('google')?.refresh_token;
    googleTokens = {
      access_token: result.access_token,
      refresh_token: result.refresh_token || existingRefresh,
      expires_at: computeExpiresAt(result.expires_in),
    };
    saveTokensToStorage('google', googleTokens);
    return { success: true };
  } catch (err: any) {
    console.error('[CalendarSync] Google auth exception:', err);
    return { success: false, error: err?.message || '연동 중 예외 발생' };
  }
}

export function disconnectGoogle(): void {
  googleTokens = null;
  removeTokensFromStorage('google');
}

export async function fetchGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<PersonalEvent[]> {
  if (!(await ensureValidToken())) return [];
  // Rate limit backoff 중이면 skip
  if (Date.now() < rateLimitedUntil) return [];

  // 토큰 race: fetch 직전 disconnect되면 access_token null
  const accessToken = googleTokens?.access_token;
  if (!accessToken) return [];

  try {
    const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${timeMin.toISOString()}&` +
      `timeMax=${timeMax.toISOString()}&` +
      `singleEvents=true&orderBy=startTime&maxResults=500`;

    // 페이지네이션 — 11개월 창 + singleEvents(반복 일정 개별 전개)라 500건을 쉽게 넘는다.
    // nextPageToken을 안 따라가면 일정이 조용히 누락되고, dedup/cleanup이 부분 데이터 위에서 판단하게 됨.
    // 중간 페이지가 실패하면 부분 결과를 쓰지 않고 이번 사이클 전체를 실패 처리([]) — 부분 데이터로
    // 고아 판정을 내리는 것이 누락보다 위험하기 때문.
    const MAX_PAGES = 6; // 최대 3,000건
    const allItems: any[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = pageToken ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}` : baseUrl;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          disconnectGoogle();
          // 토큰 만료 안내 이벤트 발송 (UI에서 listen 가능)
          window.dispatchEvent(new CustomEvent('google:auth-expired'));
        } else if (res.status === 429 || res.status === 403) {
          applyRateLimit(res.status, res.headers.get('Retry-After'));
        } else if (res.status >= 500) {
          // 5xx transient — disconnect 하지 않음. 다음 폴링에서 자동 재시도.
          console.warn(`[Google Sync] transient ${res.status} — will retry next poll`);
        } else {
          console.warn(`[Google Sync] fetch failed ${res.status}`);
        }
        return [];
      }

      let data: any;
      try {
        data = await res.json();
      } catch (err) {
        console.warn('[Google Sync] response JSON parse failed:', err);
        return [];
      }
      allItems.push(...(data.items || []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
      if (page === MAX_PAGES - 1) console.warn(`[Google Sync] more than ${MAX_PAGES * 500} events in window — truncated`);
    }
    return allItems.map((item: any) => {
      const isAllDay = !item.start?.dateTime && !!item.start?.date;
      let startDate: Date;
      let endDate: Date;
      if (isAllDay) {
        // Google allDay: start.date = inclusive, end.date = EXCLUSIVE (종료일+1)
        // → 로컬 자정으로 파싱 + endDate에서 1일 빼서 inclusive로 변환
        startDate = parseLocalYMD(item.start.date);
        endDate = parseLocalYMD(item.end.date);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(item.start?.dateTime || item.start?.date);
        endDate = new Date(item.end?.dateTime || item.end?.date);
      }
      return {
        id: `google_${item.id}`,
        title: item.summary || '(제목 없음)',
        description: item.description || '',
        startDate,
        endDate,
        allDay: isAllDay,
        source: 'google' as const,
        externalId: item.id,
        checklist: [],
        color: '#34A853',
      };
    });
  } catch (err) {
    console.error('Google Calendar fetch error:', err);
    return [];
  }
}

/**
 * Google Calendar에 일정 생성 (양방향 동기화용).
 * 성공 시 생성된 이벤트 ID 반환.
 */
export async function createGoogleEvent(input: {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  /** 결정론적 ID — 재설치/다중 디바이스에서 중복 push 방지. Google 규칙: 소문자 a-v + 0-9, 길이 5-1024 */
  customEventId?: string;
}): Promise<string | null> {
  if (!(await ensureValidToken())) return null;
  try {
    const body: any = {
      summary: input.title,
      description: input.description || '',
    };
    if (input.customEventId) {
      body.id = input.customEventId;
    }
    if (input.allDay) {
      // Google allDay: start.date = inclusive, end.date = EXCLUSIVE (종료일+1)
      // toISOString().slice(0,10)은 UTC라 KST에서 -1일 시프트 → toLocalYMD 사용
      const startYMD = toLocalYMD(input.startDate);
      const endInclusive = new Date(input.endDate);
      const endExclusive = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);
      body.start = { date: startYMD };
      body.end = { date: toLocalYMD(endExclusive) };
    } else {
      // timeZone 명시 — 사용자가 해외 출장 등으로 시스템 TZ 바뀌어도 이벤트 시각은 등록 당시 TZ 유지
      const tz = getUserTimeZone();
      body.start = { dateTime: input.startDate.toISOString(), timeZone: tz };
      body.end = { dateTime: input.endDate.toISOString(), timeZone: tz };
    }
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${googleTokens!.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // 409: 같은 customEventId의 이벤트가 이미 존재.
      // - 다른 디바이스에서 push한 경우: 그 ID 재사용
      // - 이전에 우리가 delete한 경우 (예: v2.5.42 버그): cancelled 상태일 수 있어 PATCH로 강제 복원
      if (res.status === 409 && input.customEventId) {
        try {
          const patchRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${input.customEventId}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${googleTokens!.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ ...body, status: 'confirmed' }),
            },
          );
          if (!patchRes.ok) {
            // PATCH가 실패했는데 ID를 성공으로 돌려주면 호출자가 "동기화 완료"로 믿고
            // Firestore에 죽은 externalId를 기록 → Google엔 없는데 앱은 성공, 이후 update/delete 전부 404.
            // 실패를 그대로 전파해 reconcile이 나중에 다시 시도하게 둔다.
            console.warn(`[CalendarSync] 409 PATCH restore failed (${patchRes.status}) for ${input.customEventId}`);
            return null;
          }
          console.log(`[CalendarSync] 409 → restored ${input.customEventId} via PATCH`);
        } catch (e) {
          console.warn('[CalendarSync] 409 PATCH restore failed:', e);
          return null;
        }
        return input.customEventId;
      }
      if (res.status === 401) {
        disconnectGoogle();
        window.dispatchEvent(new CustomEvent('google:auth-expired'));
      } else if (res.status === 429 || res.status === 403) {
        // fetch와 같은 백오프를 공유 — reconcile이 15초마다 제한 걸린 API를 계속 두드리지 않도록
        applyRateLimit(res.status, res.headers.get('Retry-After'));
      } else {
        console.warn('[CalendarSync] createGoogleEvent failed:', res.status);
      }
      return null;
    }
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.error('[CalendarSync] createGoogleEvent error:', err);
    return null;
  }
}

/**
 * Google Calendar 일정 수정.
 */
export async function updateGoogleEvent(externalId: string, input: {
  title?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  allDay?: boolean;
}): Promise<boolean> {
  if (!(await ensureValidToken())) return false;
  try {
    const body: any = {};
    if (input.title) body.summary = input.title;
    if (input.description !== undefined) body.description = input.description;
    if (input.startDate && input.endDate) {
      if (input.allDay) {
        // PUSH와 동일하게 로컬 YMD + exclusive end (종료일+1)
        const startYMD = toLocalYMD(input.startDate);
        const endInclusive = input.endDate;
        const endExclusive = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);
        body.start = { date: startYMD };
        body.end = { date: toLocalYMD(endExclusive) };
      } else {
        const tz = getUserTimeZone();
        body.start = { dateTime: input.startDate.toISOString(), timeZone: tz };
        body.end = { dateTime: input.endDate.toISOString(), timeZone: tz };
      }
    }
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${googleTokens!.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 401) {
        disconnectGoogle();
        window.dispatchEvent(new CustomEvent('google:auth-expired'));
      } else {
        console.warn(`[Google Sync] update failed ${res.status}`);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error('[CalendarSync] updateGoogleEvent error:', err);
    return false;
  }
}

/**
 * Google Calendar 일정 삭제.
 */
export async function deleteGoogleEvent(externalId: string): Promise<boolean> {
  if (!(await ensureValidToken())) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${googleTokens!.access_token}` },
    });
    // 404/410 = Google에 이미 없음(사용자가 Google 앱에서 직접 지운 경우 포함) → 성공으로 간주.
    // false로 돌리면 deletePersonalEvent가 로컬 삭제까지 취소해 그 일정을 영영 못 지우게 됨.
    if (res.ok || res.status === 404 || res.status === 410) return true;
    if (res.status === 401) {
      disconnectGoogle();
      window.dispatchEvent(new CustomEvent('google:auth-expired'));
    } else {
      console.warn(`[Google Sync] delete failed ${res.status}`);
    }
    return false;
  } catch (err) {
    console.error('[CalendarSync] deleteGoogleEvent error:', err);
    return false;
  }
}

// ============================================================
// Token storage (localStorage)
// ============================================================

/** 토큰 키 — 사용자별 분리. 로그인 전(currentUserId 없음)에는 저장/복원/삭제 모두 하지 않는다. */
function tokenKey(provider: string): string | null {
  return currentUserId ? `cal_tokens_${provider}_${currentUserId}` : null;
}

function saveTokensToStorage(provider: string, tokens: any): void {
  const key = tokenKey(provider);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(tokens));
  } catch (err) {
    console.warn(`[CalendarSync] Failed to save ${provider} tokens:`, err);
    // 사용자에게 알림 — 새로고침 후 재인증 필요할 수 있음
    import('../components/common/Toast').then(({ showToast }) => {
      showToast(`⚠️ ${provider} 토큰 저장 실패 — 앱 재시작 시 재인증이 필요할 수 있습니다`, 'error');
    });
  }
}

function loadTokensFromStorage(provider: string): any | null {
  const key = tokenKey(provider);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn(`[CalendarSync] Failed to load ${provider} tokens:`, err);
    return null;
  }
}

function removeTokensFromStorage(provider: string): void {
  const key = tokenKey(provider);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[CalendarSync] Failed to remove ${provider} tokens:`, err);
  }
}

/**
 * 로그인한 사용자의 저장 토큰 복원 (refresh_token이 있으면 만료되어도 복원).
 *
 * 토큰은 **사용자별 키**에 저장된다. 옛 버전의 공용 키(cal_tokens_google)는 누구 것인지 알 수 없으므로
 * 절대 채택하지 않고 삭제만 한다 — 공용 교무실 PC에서 다른 교사의 토큰을 물려받아
 * 개인 일정이 남의 Google 캘린더로 푸시되는 것을 막기 위함. (해당 사용자는 Google을 한 번 다시
 * 연동해야 하며, 토스트로 안내한다.)
 */
export function restoreCalendarConnections(userId: string): void {
  currentUserId = userId;
  googleTokens = null; // 이전 사용자의 메모리 토큰을 절대 이어받지 않음
  let hadLegacy = false;
  try {
    if (localStorage.getItem(LEGACY_TOKEN_KEY) !== null) {
      hadLegacy = true;
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {}
  const gTokens = loadTokensFromStorage('google');
  if (!gTokens) {
    if (hadLegacy) {
      window.dispatchEvent(new CustomEvent('google:auth-expired', { detail: { reason: 'security-migration' } }));
    }
    return;
  }
  if (gTokens.refresh_token) {
    // refresh_token이 있으면 만료 여부와 무관하게 복원 (자동 갱신 가능)
    googleTokens = gTokens;
  } else if (gTokens.expires_at > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
    googleTokens = gTokens;
  } else {
    // refresh_token도 없고 만료됨 → 정리
    removeTokensFromStorage('google');
  }
}

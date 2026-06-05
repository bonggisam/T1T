/**
 * External calendar sync — Google Calendar via Electron OAuth
 */

import type { PersonalEvent } from '@shared/types';

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

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5분 여유
const TOKEN_SAFETY_MARGIN_SEC = 30; // M7: expires_in에서 빼서 안전 마진 확보

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

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${timeMin.toISOString()}&` +
      `timeMax=${timeMax.toISOString()}&` +
      `singleEvents=true&orderBy=startTime&maxResults=500`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${googleTokens!.access_token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        disconnectGoogle();
        // 토큰 만료 안내 이벤트 발송 (UI에서 listen 가능)
        window.dispatchEvent(new CustomEvent('google:auth-expired'));
      } else {
        console.warn(`[Google Sync] fetch failed ${res.status}`);
      }
      return [];
    }

    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      id: `google_${item.id}`,
      title: item.summary || '(제목 없음)',
      description: item.description || '',
      startDate: new Date(item.start?.dateTime || item.start?.date),
      endDate: new Date(item.end?.dateTime || item.end?.date),
      allDay: !item.start?.dateTime && !!item.start?.date, // date만 있으면 종일
      source: 'google' as const,
      externalId: item.id,
      checklist: [],
      color: '#34A853',
    }));
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
}): Promise<string | null> {
  if (!(await ensureValidToken())) return null;
  try {
    const body: any = {
      summary: input.title,
      description: input.description || '',
    };
    if (input.allDay) {
      body.start = { date: input.startDate.toISOString().slice(0, 10) };
      body.end = { date: input.endDate.toISOString().slice(0, 10) };
    } else {
      body.start = { dateTime: input.startDate.toISOString() };
      body.end = { dateTime: input.endDate.toISOString() };
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
      if (res.status === 401) {
        disconnectGoogle();
        window.dispatchEvent(new CustomEvent('google:auth-expired'));
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
        body.start = { date: input.startDate.toISOString().slice(0, 10) };
        body.end = { date: input.endDate.toISOString().slice(0, 10) };
      } else {
        body.start = { dateTime: input.startDate.toISOString() };
        body.end = { dateTime: input.endDate.toISOString() };
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
    if (res.ok || res.status === 410) return true; // 410 = 이미 삭제됨
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

function saveTokensToStorage(provider: string, tokens: any): void {
  try {
    localStorage.setItem(`cal_tokens_${provider}`, JSON.stringify(tokens));
  } catch (err) {
    console.warn(`[CalendarSync] Failed to save ${provider} tokens:`, err);
    // 사용자에게 알림 — 새로고침 후 재인증 필요할 수 있음
    import('../components/common/Toast').then(({ showToast }) => {
      showToast(`⚠️ ${provider} 토큰 저장 실패 — 앱 재시작 시 재인증이 필요할 수 있습니다`, 'error');
    });
  }
}

function loadTokensFromStorage(provider: string): any | null {
  try {
    const raw = localStorage.getItem(`cal_tokens_${provider}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn(`[CalendarSync] Failed to load ${provider} tokens:`, err);
    return null;
  }
}

function removeTokensFromStorage(provider: string): void {
  try {
    localStorage.removeItem(`cal_tokens_${provider}`);
  } catch (err) {
    console.warn(`[CalendarSync] Failed to remove ${provider} tokens:`, err);
  }
}

/** Restore saved tokens on app load (refresh_token이 있으면 만료되어도 복원) */
export function restoreCalendarConnections(): void {
  const gTokens = loadTokensFromStorage('google');
  if (!gTokens) return;
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

/**
 * External calendar sync — Google Calendar via Electron OAuth
 */

import type { PersonalEvent } from '@shared/types';

// ============================================================
// Google Calendar
// ============================================================

interface GoogleTokens {
  access_token: string;
  expires_at: number;
}

let googleTokens: GoogleTokens | null = null;

export function isGoogleConnected(): boolean {
  return googleTokens !== null && googleTokens.expires_at > Date.now();
}

/**
 * Google OAuth via Electron main process BrowserWindow.
 * Opens a native window for login, captures token on redirect.
 */
export async function connectGoogle(): Promise<boolean> {
  try {
    const result = await window.electronAPI?.googleAuth();
    if (result && result.access_token) {
      googleTokens = {
        access_token: result.access_token,
        expires_at: Date.now() + result.expires_in * 1000,
      };
      saveTokensToStorage('google', googleTokens);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[CalendarSync] Google auth error:', err);
    return false;
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
  if (!googleTokens) return [];

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${timeMin.toISOString()}&` +
      `timeMax=${timeMax.toISOString()}&` +
      `singleEvents=true&orderBy=startTime&maxResults=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${googleTokens.access_token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        disconnectGoogle();
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
  if (!googleTokens) return null;
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
        Authorization: `Bearer ${googleTokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[CalendarSync] createGoogleEvent failed:', res.status);
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
  if (!googleTokens) return false;
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
        Authorization: `Bearer ${googleTokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    console.error('[CalendarSync] updateGoogleEvent error:', err);
    return false;
  }
}

/**
 * Google Calendar 일정 삭제.
 */
export async function deleteGoogleEvent(externalId: string): Promise<boolean> {
  if (!googleTokens) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${googleTokens.access_token}` },
    });
    return res.ok || res.status === 410; // 410 = 이미 삭제됨
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
  } catch {}
}

function loadTokensFromStorage(provider: string): any | null {
  try {
    const raw = localStorage.getItem(`cal_tokens_${provider}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function removeTokensFromStorage(provider: string): void {
  try {
    localStorage.removeItem(`cal_tokens_${provider}`);
  } catch {}
}

/** Restore saved tokens on app load */
export function restoreCalendarConnections(): void {
  const gTokens = loadTokensFromStorage('google');
  if (gTokens && gTokens.expires_at > Date.now()) {
    googleTokens = gTokens;
  }
}

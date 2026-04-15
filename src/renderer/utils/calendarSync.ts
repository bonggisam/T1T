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

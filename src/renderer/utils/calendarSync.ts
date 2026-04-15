/**
 * External calendar sync services.
 * Handles Google Calendar, Apple Calendar (CalDAV), Notion, and Outlook.
 *
 * Google Calendar uses OAuth 2.0 via popup flow.
 * Others follow similar patterns with their respective APIs.
 */

import type { PersonalEvent } from '@shared/types';

// ============================================================
// Google Calendar
// ============================================================

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

let googleTokens: GoogleTokens | null = null;

export function isGoogleConnected(): boolean {
  return googleTokens !== null && googleTokens.expires_at > Date.now();
}

/**
 * Initiate Google OAuth 2.0 login via popup.
 * In Electron, this opens a BrowserWindow; in browser, uses popup.
 */
export async function connectGoogle(): Promise<boolean> {
  return new Promise((resolve) => {
    const redirectUri = window.location.origin + '/auth/google/callback';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(GOOGLE_SCOPES)}&` +
      `prompt=consent`;

    const popup = window.open(authUrl, 'google-auth', 'width=500,height=600');

    const interval = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        const url = popup.location.href;
        if (url.includes('access_token=')) {
          const hash = new URL(url).hash.substring(1);
          const params = new URLSearchParams(hash);
          const token = params.get('access_token');
          const expiresIn = parseInt(params.get('expires_in') || '3600');

          if (token) {
            googleTokens = {
              access_token: token,
              expires_at: Date.now() + expiresIn * 1000,
            };
            saveTokensToStorage('google', googleTokens);
            popup.close();
            clearInterval(interval);
            resolve(true);
          }
        }
      } catch {
        // Cross-origin error — popup is still on Google's domain
      }
    }, 500);
  });
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
// Apple Calendar (CalDAV) — placeholder
// ============================================================

export async function connectApple(_username: string, _appPassword: string): Promise<boolean> {
  // CalDAV implementation requires server-side proxy for CORS
  // In Electron, this can be done directly via Node.js http module
  console.log('Apple Calendar: CalDAV integration requires Electron main process');
  return false;
}

export async function fetchAppleCalendarEvents(
  _timeMin: Date,
  _timeMax: Date,
): Promise<PersonalEvent[]> {
  return [];
}

// ============================================================
// Notion Calendar — placeholder
// ============================================================

export async function connectNotion(): Promise<boolean> {
  // Notion OAuth 2.0 flow, similar to Google
  console.log('Notion Calendar: OAuth integration placeholder');
  return false;
}

export async function fetchNotionCalendarEvents(
  _timeMin: Date,
  _timeMax: Date,
): Promise<PersonalEvent[]> {
  return [];
}

// ============================================================
// Outlook Calendar (Microsoft Graph) — placeholder
// ============================================================

export async function connectOutlook(): Promise<boolean> {
  // Microsoft OAuth 2.0 flow
  console.log('Outlook Calendar: OAuth integration placeholder');
  return false;
}

export async function fetchOutlookCalendarEvents(
  _timeMin: Date,
  _timeMax: Date,
): Promise<PersonalEvent[]> {
  return [];
}

// ============================================================
// Token storage helpers (using localStorage for now,
// electron-store + safeStorage in production)
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

// Restore tokens on load
export function restoreCalendarConnections(): void {
  const gTokens = loadTokensFromStorage('google');
  if (gTokens && gTokens.expires_at > Date.now()) {
    googleTokens = gTokens;
  }
}

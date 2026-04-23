/**
 * Slack Incoming Webhook 유틸리티.
 * 설정에서 사용자가 웹훅 URL을 저장하면, 일정 생성/수정 시 자동 전송.
 */

const STORAGE_KEY = 'tonet-slack-webhook';

export function getSlackWebhook(): string {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (e) { console.warn('[Slack] localStorage read failed:', e); return ''; }
}

export function setSlackWebhook(url: string): void {
  try { localStorage.setItem(STORAGE_KEY, url); } catch (e) { console.warn('[Slack] localStorage write failed:', e); }
}

export function clearSlackWebhook(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.warn('[Slack] localStorage remove failed:', e); }
}

/**
 * Slack으로 메시지 전송. URL이 설정되어 있으면 동작.
 */
export async function sendSlackNotification(text: string, opts?: { emoji?: string; username?: string }): Promise<boolean> {
  const url = getSlackWebhook();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        username: opts?.username || 'T1T',
        icon_emoji: opts?.emoji || ':calendar:',
      }),
    });
    if (!res.ok) {
      console.warn(`[Slack] Failed with HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    return res.ok;
  } catch (err) {
    console.warn('[Slack] Notification failed (network/CORS):', err);
    return false;
  }
}

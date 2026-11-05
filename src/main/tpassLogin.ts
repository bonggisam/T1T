import { session, type WebContents } from 'electron';

/**
 * 외출시스템(TPass) 비밀번호 단계를 건너뛴다.
 *
 * TPass는 Google Apps Script 웹앱이라 실제 폼이 샌드박스 iframe 안에 있어 webview.executeJavaScript로는 닿지 않는다.
 * 그래서 메인 프로세스에서 프레임을 직접 찾아 넣는다. 비밀번호는 렌더러로 보내지 않는다.
 */

export interface TpassLoginResult {
  ok: boolean;
  reason?: string;
  attempt?: number;
}

export interface TpassLoginOptions {
  allowFrame?: (url: string) => boolean;
  findAttempts?: number;
}

const POLL_MS = 300;
/** 학교망에서 페이지가 늦게 떠도 기다린다 */
const FIND_ATTEMPTS = 60;
/** 다음 화면으로 넘어갔는지 확인하는 횟수 */
const CONFIRM_ATTEMPTS = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Google Apps Script 화면이 쓰는 주소에만 비밀번호를 넣는다 */
export function isTpassFrameUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (hostname === 'script.google.com' || hostname.endsWith('.googleusercontent.com'));
  } catch {
    return false;
  }
}

/** 외출시스템 화면의 webview인지 확인한다. 다른 창이나 화면에는 넣지 않는다 */
export function isTpassView(wc: WebContents): boolean {
  return wc.getType() === 'webview' && wc.session === session.fromPartition('persist:tpass');
}

function fillScript(password: string): string {
  return `
    (function() {
      const pw = document.getElementById('password');
      if (!pw) return { found: false };
      if (pw.dataset.t1tFilled === '1') return { found: true };
      // 페이지가 값 변경을 감지하도록 기본 setter로 넣는다
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(pw, ${JSON.stringify(password)});
      pw.dataset.t1tFilled = '1';
      pw.dispatchEvent(new Event('input', { bubbles: true }));
      pw.dispatchEvent(new Event('change', { bubbles: true }));
      try {
        // 페이지의 확인 함수를 먼저 쓰고, 없으면 다음 단계를 직접 연다
        if (typeof checkPassword === 'function') {
          checkPassword();
        } else {
          const box = document.getElementById('login-box');
          const form = document.getElementById('form-section');
          if (box) box.style.display = 'none';
          if (form) form.style.display = 'block';
        }
      } catch (e) { /* 넘어가지 못하면 아래 확인에서 걸러진다 */ }
      return { found: true };
    })();
  `;
}

const STILL_ON_PASSWORD = `
  (function() {
    const pw = document.getElementById('password');
    return !!pw && pw.getClientRects().length > 0;
  })();
`;

export async function tpassAutoLogin(
  wc: WebContents,
  password: string,
  { allowFrame = isTpassFrameUrl, findAttempts = FIND_ATTEMPTS }: TpassLoginOptions = {},
): Promise<TpassLoginResult> {
  for (let attempt = 1; attempt <= findAttempts; attempt++) {
    if (wc.isDestroyed()) return { ok: false, reason: 'view closed' };
    const frames = (wc.mainFrame?.framesInSubtree ?? []).filter((frame) => allowFrame(frame.url));
    for (const frame of frames) {
      let found = false;
      try {
        const result = await frame.executeJavaScript(fillScript(password), true) as { found?: boolean } | null;
        found = !!result?.found;
      } catch {
        continue; // 사라진 프레임은 다음 차례에 다시 찾는다
      }
      if (!found) continue;
      for (let check = 0; check < CONFIRM_ATTEMPTS; check++) {
        if (wc.isDestroyed()) return { ok: false, reason: 'view closed' };
        try {
          if (!(await frame.executeJavaScript(STILL_ON_PASSWORD, true))) return { ok: true, attempt };
        } catch {
          return { ok: true, attempt }; // 프레임이 다음 페이지로 바뀌었다
        }
        await sleep(POLL_MS);
      }
      return { ok: false, reason: 'still on password step', attempt };
    }
    await sleep(POLL_MS);
  }
  return { ok: false, reason: 'password input not found' };
}

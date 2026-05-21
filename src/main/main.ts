import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell, type NativeImage } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { comciganService } from './comcigan';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isClickThrough = false;
let isWidgetMode = true; // Desktop widget mode (pinned behind windows)
let updaterInterval: NodeJS.Timeout | null = null;

// 클릭 통과 모드 토글 (단축키/트레이/IPC 공통 호출)
function setClickThrough(enabled: boolean): void {
  isClickThrough = enabled;
  mainWindow?.setIgnoreMouseEvents(enabled, { forward: true });
  // 렌더러에 상태 알림 (UI 동기화)
  mainWindow?.webContents.send('click-through-changed', enabled);
  // 트레이 메뉴 체크 상태 업데이트
  updateTrayMenu();
}

function toggleClickThrough(): void {
  setClickThrough(!isClickThrough);
}

const isDev = !app.isPackaged;

// macOS 26 (Tahoe) beta workaround: disable sandbox to prevent V8 crash
// TODO: Electron 42+ 업그레이드 시 이 플래그가 여전히 필요한지 재검증 필요
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
}

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    x: screenWidth - 440,
    y: 20,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    minimizable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  // Use a simple 16x16 icon for tray
  const iconPath = isDev
    ? path.join(__dirname, '../../assets/tray-icon.png')
    : path.join(process.resourcesPath, 'assets/tray-icon.png');

  let trayIcon: NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: create a simple colored icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.isEmpty() ? createDefaultTrayIcon() : trayIcon);

  tray.setToolTip('T1T');
  updateTrayMenu();
  tray.on('click', () => toggleWindow());
}

function updateTrayMenu(): void {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '캘린더 표시/숨김',
      click: () => toggleWindow(),
    },
    {
      label: '항상 위',
      type: 'checkbox',
      checked: !!mainWindow?.isAlwaysOnTop(),
      click: (menuItem) => {
        mainWindow?.setAlwaysOnTop(menuItem.checked);
      },
    },
    {
      label: isClickThrough ? '🖱 클릭 통과 해제' : '🖱 클릭 통과 켜기',
      click: () => toggleClickThrough(),
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        mainWindow?.destroy();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function createDefaultTrayIcon(): NativeImage {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 74;      // R
    canvas[i * 4 + 1] = 144;  // G
    canvas[i * 4 + 2] = 226;  // B
    canvas[i * 4 + 3] = 255;  // A
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function toggleWindow(): void {
  if (mainWindow?.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow?.show();
    mainWindow?.focus();
  }
}

function applyWidgetMode(enabled: boolean): void {
  if (!mainWindow) return;
  isWidgetMode = enabled;
  if (enabled) {
    // Widget mode: behind all windows, not focusable, on desktop
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSkipTaskbar(true);
    mainWindow.setResizable(false);
    // Move to bottom of z-order (desktop level)
    if (process.platform === 'win32') {
      mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
      // Briefly set on top then move to bottom
      setTimeout(() => {
        mainWindow?.setAlwaysOnTop(false);
      }, 50);
    }
    mainWindow.blur();
  } else {
    // Edit mode: interactive, on top, resizable
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.focus();
  }
}

// IPC Handlers
function setupIPC(): void {
  ipcMain.handle('window:toggle-always-on-top', (_event, value: boolean) => {
    mainWindow?.setAlwaysOnTop(value);
  });

  ipcMain.handle('window:set-opacity', (_event, opacity: number) => {
    if (typeof opacity === 'number' && opacity >= 0 && opacity <= 1) {
      mainWindow?.setOpacity(opacity);
    }
  });

  ipcMain.handle('window:toggle-click-through', (_event, enabled: boolean) => {
    setClickThrough(enabled);
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.destroy();
    app.quit();
  });

  ipcMain.handle('window:set-size', (_event, width: number, height: number) => {
    if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
      mainWindow?.setSize(Math.round(width), Math.round(height));
    }
  });

  ipcMain.handle('window:set-widget-mode', (_event, enabled: boolean) => {
    applyWidgetMode(enabled);
  });

  ipcMain.handle('window:get-widget-mode', () => {
    return isWidgetMode;
  });

  ipcMain.handle('window:get-bounds', () => {
    return mainWindow?.getBounds();
  });

  ipcMain.handle('window:set-bounds', (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!mainWindow || !bounds) return;
    const { x, y, width, height } = bounds;
    if (![x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v))) return;
    if (width <= 0 || height <= 0 || width > 10000 || height > 10000) return;
    const { workAreaSize } = screen.getPrimaryDisplay();
    const clampedX = Math.max(-width + 100, Math.min(Math.round(x), workAreaSize.width - 100));
    const clampedY = Math.max(0, Math.min(Math.round(y), workAreaSize.height - 100));
    const wasResizable = mainWindow.isResizable();
    if (!wasResizable) mainWindow.setResizable(true);
    mainWindow.setBounds({ x: clampedX, y: clampedY, width: Math.round(width), height: Math.round(height) });
    if (!wasResizable) mainWindow.setResizable(false);
  });

  ipcMain.handle('tray:set-badge', (_event, hasBadge: boolean) => {
    if (tray) {
      tray.setToolTip(hasBadge ? 'T1T (새 알림)' : 'T1T');
    }
  });

  // Auto-updater IPC
  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate().catch((err) => console.error('[Updater] Download failed:', err));
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('updater:check', () => {
    autoUpdater.checkForUpdates().catch((err) => console.warn('[Updater] Check failed:', err));
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });
}

// ============================================================
// Auto-updater
// ============================================================

function setupAutoUpdater(): void {
  if (isDev) return; // Skip in development

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('updater:downloaded');
  });

  autoUpdater.on('error', (err) => {
    sendToRenderer('updater:error', err?.message || 'Update error');
  });

  // Check for updates every 30 minutes (앱 종료 시 interval 정리)
  autoUpdater.checkForUpdates().catch(() => {});
  if (updaterInterval) clearInterval(updaterInterval);
  updaterInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}

// Google Calendar OAuth IPC — Authorization Code Flow + PKCE (RFC 8252)
// Desktop 클라이언트는 implicit flow(response_type=token) 미지원 → Code+PKCE 사용
// 시스템 브라우저로 인증 → 로컬 서버가 code 받음 → token endpoint로 교환
function setupGoogleAuthIPC(): void {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
    || '607193357118-eb152l89b7e5eh6fkquvu1olm2i8hc00.apps.googleusercontent.com';
  // Desktop 앱 client_secret — Google 가이드 상 desktop 클라이언트는 secret이 사실상 노출되어도 무방
  // (env로 오버라이드 가능, 기본값 없음 — 없으면 PKCE only로 시도)
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const SCOPES = 'https://www.googleapis.com/auth/calendar';

  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn('[GoogleAuth] GOOGLE_CLIENT_ID 환경변수 미설정 — 기본 Client ID 사용.');
  }

  // PKCE 헬퍼
  function base64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Token endpoint 호출 (code → access_token + refresh_token)
  // 반환: 성공시 토큰, 실패시 { error: 'msg' }
  async function exchangeCodeForToken(code: string, verifier: string, redirectUri: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number } | { error: string }> {
    const https = require('https') as typeof import('https');
    const params: Record<string, string> = {
      code,
      client_id: GOOGLE_CLIENT_ID,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    };
    if (GOOGLE_CLIENT_SECRET) params.client_secret = GOOGLE_CLIENT_SECRET;
    const body = new URLSearchParams(params).toString();

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'Accept': 'application/json',
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try {
            const json = JSON.parse(text);
            if (json.access_token) {
              resolve({
                access_token: json.access_token,
                refresh_token: json.refresh_token,
                expires_in: json.expires_in || 3600,
              });
            } else {
              // Google이 반환한 에러 그대로 전달
              const errMsg = json.error_description || json.error || `HTTP ${res.statusCode}`;
              console.warn('[GoogleAuth] token exchange failed:', errMsg, '— full response:', json);
              resolve({ error: errMsg });
            }
          } catch (e) {
            console.warn('[GoogleAuth] token JSON parse failed:', e, '— body:', text);
            resolve({ error: `응답 파싱 실패 (HTTP ${res.statusCode})` });
          }
        });
      });
      req.on('error', (err) => {
        console.error('[GoogleAuth] token request error:', err);
        resolve({ error: err.message });
      });
      req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
      req.write(body);
      req.end();
    });
  }

  type AuthResult = { access_token: string; expires_in: number } | { error: string };

  ipcMain.handle('google:auth', () => {
    return new Promise<AuthResult>(async (resolve) => {
      // PKCE 생성
      const codeVerifier = base64url(crypto.randomBytes(32));
      const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
      const state = base64url(crypto.randomBytes(16));

      let port = 0;
      let redirectUri = '';
      let resolved = false;
      const safeResolve = (v: AuthResult) => {
        if (resolved) return;
        resolved = true;
        try { server.close(); } catch {}
        resolve(v);
      };

      const server = http.createServer(async (req, res) => {
        try {
          if (!req.url) { res.writeHead(400); res.end(); return; }
          const u = new URL(req.url, `http://127.0.0.1:${port}`);
          if (u.pathname !== '/callback') {
            res.writeHead(404); res.end(); return;
          }
          const code = u.searchParams.get('code');
          const returnedState = u.searchParams.get('state');
          const errorParam = u.searchParams.get('error');
          const errorDesc = u.searchParams.get('error_description');

          if (errorParam) {
            const msg = errorDesc || errorParam;
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>인증 실패</title>
              <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:48px;background:#f5f5f7}code{background:#fff;padding:4px 8px;border-radius:4px;border:1px solid #ddd}</style></head>
              <body><h2>❌ 인증 실패</h2><p>오류: <code>${errorParam}</code></p><p style="color:#86868b">${msg}</p></body></html>`);
            safeResolve({ error: msg });
            return;
          }
          if (!code || returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><body><h2>❌ 잘못된 요청 (state 불일치)</h2></body></html>`);
            safeResolve({ error: 'state mismatch' });
            return;
          }

          // 토큰 교환
          const result = await exchangeCodeForToken(code, codeVerifier, redirectUri);
          if ('access_token' in result) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>T1T 인증</title>
              <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:48px;background:#f5f5f7;color:#1d1d1f}h2{margin-bottom:8px}p{color:#86868b}</style></head>
              <body><h2>✅ Google Calendar 연동 완료</h2><p>이 창은 자동으로 닫힙니다.</p>
              <script>setTimeout(()=>window.close(),1200);</script></body></html>`);
            safeResolve({ access_token: result.access_token, expires_in: result.expires_in });
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>토큰 교환 실패</title>
              <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:48px;background:#f5f5f7}code{background:#fff;padding:4px 8px;border-radius:4px;border:1px solid #ddd}</style></head>
              <body><h2>❌ 토큰 교환 실패</h2><p style="color:#86868b">${result.error}</p>
              <p style="font-size:12px;color:#999">앱으로 돌아가 다시 시도하거나 관리자에게 문의하세요.</p></body></html>`);
            safeResolve({ error: result.error });
          }
        } catch (err: any) {
          console.warn('[GoogleAuth] server error:', err);
          res.writeHead(500); res.end();
          safeResolve({ error: err?.message || '서버 오류' });
        }
      });

      // 고정 포트 8123 우선, 사용 중이면 0(랜덤)
      const FIXED_PORT = 8123;
      server.once('error', () => {
        server.removeAllListeners('error');
        console.warn('[GoogleAuth] Port 8123 in use, using random port');
        server.listen(0, '127.0.0.1');
      });
      server.on('listening', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          port = addr.port;
          redirectUri = `http://127.0.0.1:${port}/callback`;
          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(SCOPES)}` +
            `&access_type=offline` +
            `&prompt=consent` +
            `&state=${state}` +
            `&code_challenge=${codeChallenge}` +
            `&code_challenge_method=S256`;
          console.log('[GoogleAuth] Opening browser, redirect:', redirectUri);
          shell.openExternal(authUrl).catch((err) => {
            console.error('[GoogleAuth] openExternal failed:', err);
            safeResolve({ error: '브라우저를 열 수 없습니다: ' + (err?.message || '') });
          });
        }
      });
      server.listen(FIXED_PORT, '127.0.0.1');

      // 5분 후 타임아웃
      setTimeout(() => safeResolve({ error: '시간 초과 (5분) — 다시 시도해주세요' }), 5 * 60 * 1000);
    });
  });
}

// School website scraper IPC (학사일정 + 급식)
function setupSchoolScrapeIPC(): void {
  const { fetchSchoolSchedule, fetchSchoolMeal } = require('./schoolScrape');

  ipcMain.handle('school:fetchSchedule', async (_event, schoolKey: string) => {
    if (schoolKey !== 'taeseong_middle' && schoolKey !== 'taeseong_high') {
      throw new Error('Invalid school key');
    }
    return fetchSchoolSchedule(schoolKey);
  });

  ipcMain.handle('school:fetchMeal', async (_event, schoolKey: string, dateYMD?: string) => {
    if (schoolKey !== 'taeseong_middle' && schoolKey !== 'taeseong_high') {
      throw new Error('Invalid school key');
    }
    if (dateYMD && !/^\d{8}$/.test(dateYMD)) {
      throw new Error('Invalid date format (expected YYYYMMDD)');
    }
    return fetchSchoolMeal(schoolKey, dateYMD);
  });
}

// Comcigan IPC
function setupComciganIPC(): void {
  ipcMain.handle('comcigan:search', async (_event, name: string) => {
    if (typeof name !== 'string') throw new Error('Invalid school name');
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) throw new Error('Invalid school name');
    return comciganService.searchSchool(trimmed);
  });

  ipcMain.handle('comcigan:configure', async (_event, config) => {
    await comciganService.configure(config);
  });

  ipcMain.handle('comcigan:get-config', () => {
    return comciganService.getConfig();
  });

  ipcMain.handle('comcigan:fetch', async () => {
    return comciganService.fetchTimetable();
  });

  ipcMain.handle('comcigan:get-cached', () => {
    return comciganService.getCachedData();
  });

  ipcMain.handle('comcigan:clear', () => {
    comciganService.clearConfig();
  });
}

function sendToRenderer(channel: string, data?: any): void {
  mainWindow?.webContents.send(channel, data);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIPC();
  setupGoogleAuthIPC();
  setupComciganIPC();
  setupSchoolScrapeIPC();
  setupAutoUpdater();

  // Initialize comcigan service
  if (mainWindow) comciganService.setMainWindow(mainWindow);
  comciganService.init().catch(() => {});

  // Start in widget mode after window loads
  mainWindow?.webContents.on('did-finish-load', () => {
    applyWidgetMode(true);
  });

  // Register global shortcut: Ctrl+Shift+C to toggle edit/widget mode
  const widgetShortcutOk = globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (mainWindow?.isVisible()) {
      applyWidgetMode(!isWidgetMode);
      mainWindow?.webContents.send('widget-mode-changed', isWidgetMode);
    } else {
      mainWindow?.show();
    }
  });
  if (!widgetShortcutOk) {
    console.warn('[Shortcut] Failed to register Ctrl+Shift+C — may conflict with another app');
  }

  // Register global shortcut: Ctrl+Shift+X to toggle click-through
  // (UI 클릭 불가 상태에서 복구용 단축키)
  const clickThroughShortcutOk = globalShortcut.register('CommandOrControl+Shift+X', () => {
    toggleClickThrough();
  });
  if (!clickThroughShortcutOk) {
    console.warn('[Shortcut] Failed to register Ctrl+Shift+X — may conflict with another app');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  comciganService.stopAutoRefresh();
  if (updaterInterval) { clearInterval(updaterInterval); updaterInterval = null; }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

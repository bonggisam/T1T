import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell, type NativeImage } from 'electron';
import * as http from 'http';
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

// Google Calendar OAuth IPC — Loopback HTTP server + external browser
// Google이 2021년부터 embedded webview 차단 (disallowed_useragent 에러)
// 표준 OAuth 2.0 for Native Apps (RFC 8252) 방식: localhost 서버 + 시스템 브라우저
function setupGoogleAuthIPC(): void {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
    || '607193357118-eb152l89b7e5eh6fkquvu1olm2i8hc00.apps.googleusercontent.com';
  const SCOPES = 'https://www.googleapis.com/auth/calendar';

  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn('[GoogleAuth] GOOGLE_CLIENT_ID 환경변수 미설정 — 기본 개발 Client ID 사용.');
  }

  ipcMain.handle('google:auth', () => {
    return new Promise<{ access_token: string; expires_in: number } | null>(async (resolve) => {
      // 1) 임시 HTTP 서버 (포트 0 = OS 할당)
      let port = 0;
      const server = http.createServer((req, res) => {
        try {
          if (!req.url) { res.writeHead(400); res.end(); return; }
          const u = new URL(req.url, `http://127.0.0.1:${port}`);
          // 콜백 페이지: JS로 fragment(#access_token=...)를 query로 전송
          if (u.pathname === '/callback') {
            // implicit flow → 토큰이 fragment(#)에 옴 → JS로 query로 전환
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>T1T 인증</title>
              <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:48px;background:#f5f5f7;color:#1d1d1f}h2{margin-bottom:8px}p{color:#86868b}</style></head>
              <body><h2>✅ Google Calendar 연동 완료</h2><p>이 창은 자동으로 닫힙니다.</p>
              <script>
                const h = location.hash.substring(1);
                if (h) { fetch('/token?'+h).then(()=>setTimeout(()=>window.close(),800)); }
                else { document.body.innerHTML='<h2>❌ 인증 실패</h2><p>로그인을 완료하지 못했습니다.</p>'; }
              </script></body></html>`);
            return;
          }
          if (u.pathname === '/token') {
            const token = u.searchParams.get('access_token');
            const expiresIn = parseInt(u.searchParams.get('expires_in') || '3600');
            res.writeHead(204);
            res.end();
            if (token) {
              resolve({ access_token: token, expires_in: expiresIn });
            } else {
              resolve(null);
            }
            // 짧은 지연 후 서버 종료
            setTimeout(() => server.close(), 1000);
            return;
          }
          res.writeHead(404);
          res.end();
        } catch (err) {
          console.warn('[GoogleAuth] server error:', err);
          res.writeHead(500); res.end();
        }
      });

      // 고정 포트 사용 — Google Cloud Console에 등록된 redirect URI와 일치시키기 위함
      // (Desktop 앱 타입이면 모든 포트가 자동 허용되지만, Web 앱 타입은 정확한 URI 일치 필요)
      // 포트 사용 중일 경우 0 (랜덤 포트)로 fallback
      const FIXED_PORT = 8123;
      const tryListen = (p: number, onError: () => void) => {
        server.once('error', onError);
        server.listen(p, '127.0.0.1');
      };
      tryListen(FIXED_PORT, () => {
        server.removeAllListeners('error');
        // 8123 사용 중이면 랜덤 포트로 fallback (대신 Desktop 앱 타입 필요)
        console.warn('[GoogleAuth] Port 8123 in use, falling back to random port');
        server.listen(0, '127.0.0.1');
      });
      server.on('listening', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          port = addr.port;
          const redirectUri = `http://127.0.0.1:${port}/callback`;
          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `response_type=token&` +
            `scope=${encodeURIComponent(SCOPES)}&` +
            `prompt=consent`;
          console.log('[GoogleAuth] Opening external browser for OAuth, redirect:', redirectUri);
          // 시스템 기본 브라우저로 열기 (Google이 신뢰)
          shell.openExternal(authUrl).catch((err) => {
            console.error('[GoogleAuth] openExternal failed:', err);
            resolve(null);
            server.close();
          });
        }
      });

      // 5분 후 타임아웃
      setTimeout(() => {
        try { server.close(); } catch {}
        resolve(null);
      }, 5 * 60 * 1000);
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

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell, webContents as electronWebContents, type NativeImage } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { autoUpdater } from 'electron-updater';
import { comciganService } from './comcigan';
import { GOOGLE_CLIENT_ID as INJECTED_GOOGLE_ID, GOOGLE_CLIENT_SECRET as INJECTED_GOOGLE_SECRET } from './credentials.gen';

// 진단 로그 — 개발 모드에서만 (프로덕션 console 노이즈 제거)
if (!app.isPackaged) {
  console.log('[Startup] INJECTED_GOOGLE_ID:', INJECTED_GOOGLE_ID ? `${INJECTED_GOOGLE_ID.slice(0, 20)}... (length: ${INJECTED_GOOGLE_ID.length})` : '(empty)');
  console.log('[Startup] INJECTED_GOOGLE_SECRET:', INJECTED_GOOGLE_SECRET ? `(length: ${INJECTED_GOOGLE_SECRET.length})` : '(empty)');
}

// 개발 모드에서는 .env 우선 로드 (process.env 채움)
// 프로덕션에서는 credentials.gen.ts에 빌드 타임 inject된 값 사용
(function loadDevEnv() {
  const candidates: string[] = [
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../../.env'),
  ];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, '.env'));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log(`[Env] dev .env loaded: ${p}`);
        return;
      }
    } catch {}
  }
})();

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

// 창 위치/크기 영구 저장 (userData/window-state.json)
interface WindowState { x?: number; y?: number; width: number; height: number; }
function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}
function loadWindowState(): WindowState | null {
  try {
    const p = getWindowStatePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        // 너무 작거나 비정상 크기는 기본값으로 fallback
        const MIN_W = 320, MIN_H = 280, MAX_W = 4000, MAX_H = 4000;
        if (data.width < MIN_W || data.height < MIN_H) return null;
        if (data.width > MAX_W || data.height > MAX_H) return null;
        return data;
      }
    }
  } catch (e) { console.warn('[Window] loadState failed:', e); }
  return null;
}
function saveWindowState(): void {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(b), 'utf-8');
  } catch (e) { console.warn('[Window] saveState failed:', e); }
}

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  // 아이콘 경로 — 개발/패키지(asar) 모두 동일 (__dirname 상대)
  const iconPath = path.join(__dirname, '../../assets', process.platform === 'win32' ? 'icon.ico' : 'icon.icns');

  // 저장된 창 상태 복원 (없으면 기본값)
  const savedState = loadWindowState();
  const initX = savedState?.x !== undefined ? savedState.x : screenWidth - 440;
  const initY = savedState?.y !== undefined ? savedState.y : 20;
  const initWidth = savedState?.width || 420;
  const initHeight = savedState?.height || 520;
  // 화면 밖으로 나간 좌표 안전 처리
  const safeX = Math.max(0, Math.min(initX, screenWidth - 100));
  const safeY = Math.max(0, Math.min(initY, screenHeight - 100));

  mainWindow = new BrowserWindow({
    width: initWidth,
    height: initHeight,
    x: safeX,
    y: safeY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    minimizable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    icon: iconPath,
    // 시작 속도 최적화: 페이지 로드 완료까지 show=false → 깜빡임 방지
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      // 페이지 백그라운드 throttle 비활성화 → 첫 페인트 빠름
      backgroundThrottling: false,
    },
  });

  // 창 이동·크기 변경 시 상태 저장 (debounce)
  let resizeDebounce: NodeJS.Timeout | null = null;
  const debouncedSave = () => {
    if (resizeDebounce) clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(saveWindowState, 500);
  };
  mainWindow.on('resize', debouncedSave);
  mainWindow.on('move', debouncedSave);

  // 페이지 로드 완료 시 한번에 표시 (깜빡임 없음)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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

  // 가장자리 드래그 리사이즈 — frameless+transparent 윈도우에서 OS 핸들이 안 보이는 문제 해결.
  // 'top'|'right'|'bottom'|'left'|'top-left'|'top-right'|'bottom-left'|'bottom-right'
  type ResizeEdge = 'top'|'right'|'bottom'|'left'|'top-left'|'top-right'|'bottom-left'|'bottom-right';
  const VALID_EDGES: ResizeEdge[] = ['top','right','bottom','left','top-left','top-right','bottom-left','bottom-right'];
  let resizeState: null | {
    edge: ResizeEdge;
    initBounds: Electron.Rectangle;
    initCursor: { x: number; y: number };
    interval: NodeJS.Timeout;
  } = null;

  function stopEdgeResize() {
    if (!resizeState) return;
    clearInterval(resizeState.interval);
    resizeState = null;
  }

  ipcMain.handle('window:start-edge-resize', (_event, edge: ResizeEdge) => {
    if (!mainWindow || !VALID_EDGES.includes(edge)) return;
    stopEdgeResize();
    const initBounds = mainWindow.getBounds();
    const initCursor = screen.getCursorScreenPoint();
    const MIN_W = 320, MIN_H = 280;
    const startedAt = Date.now();
    const SAFETY_TIMEOUT_MS = 15000; // 15초 — 정상 사용자는 절대 안 걸림, 폴링 안전망
    const interval = setInterval(() => {
      // 안전망 1: 윈도우가 destroy되었거나 15초 경과 → 강제 종료
      if (!mainWindow || mainWindow.isDestroyed()) { stopEdgeResize(); return; }
      if (Date.now() - startedAt > SAFETY_TIMEOUT_MS) {
        console.warn('[EdgeResize] Safety timeout — auto stop');
        stopEdgeResize();
        return;
      }
      const cur = screen.getCursorScreenPoint();
      const dx = cur.x - initCursor.x;
      const dy = cur.y - initCursor.y;
      let { x, y, width, height } = initBounds;
      if (edge.includes('right')) {
        width = Math.max(MIN_W, initBounds.width + dx);
      }
      if (edge.includes('left')) {
        const newWidth = Math.max(MIN_W, initBounds.width - dx);
        x = initBounds.x + (initBounds.width - newWidth);
        width = newWidth;
      }
      if (edge.includes('bottom')) {
        height = Math.max(MIN_H, initBounds.height + dy);
      }
      if (edge.includes('top')) {
        const newHeight = Math.max(MIN_H, initBounds.height - dy);
        y = initBounds.y + (initBounds.height - newHeight);
        height = newHeight;
      }
      try {
        mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
      } catch {}
    }, 16);
    resizeState = { edge, initBounds, initCursor, interval };
  });

  ipcMain.handle('window:stop-edge-resize', () => {
    stopEdgeResize();
  });

  // ============================================================
  // 외부 링크 열기 (도서관 시스템 등) — URL 화이트리스트로 안전 보장
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (typeof url !== 'string') return { ok: false, reason: 'invalid' };
    // https 만 허용 + 신뢰 도메인 화이트리스트
    const ALLOWED_HOSTS = [
      'read365.edunet.net',         // 학교 도서관(독서로)
      'comci.net',                  // 컴시간
      'taesung-m.goeyi.kr',         // 태성중 홈페이지
      'taesung-h.goeyi.kr',         // 태성고 홈페이지
      'github.com',                 // 릴리스 페이지
    ];
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return { ok: false, reason: 'protocol' };
      if (!ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) {
        return { ok: false, reason: 'host not allowed' };
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: e?.message || 'unknown' };
    }
  });

  // TPass 자동 로그인 — iframe sandbox 안의 비밀번호 입력에 직접 주입
  // ============================================================
  // 입력 검증: webContentsId만 받고 password는 main 프로세스에서 하드코딩(상수 노출 방지)
  const TPASS_PASSWORD = '62';
  ipcMain.handle('tpass:auto-login', async (_event, webContentsId: number) => {
    if (typeof webContentsId !== 'number' || webContentsId <= 0) return { ok: false, reason: 'invalid id' };
    const wc = electronWebContents.fromId(webContentsId);
    if (!wc || wc.isDestroyed()) return { ok: false, reason: 'no webContents' };
    // 모든 하위 프레임을 순회 — Google Apps Script 콘텐츠 프레임(googleusercontent.com) 탐색
    const tryFrames = () => {
      const frames = wc.mainFrame?.framesInSubtree || [];
      const targets = frames.filter((f) =>
        f.url.includes('googleusercontent.com') ||
        f.url.includes('userCodeAppPanel') ||
        f.url.includes('script.google.com'),
      );
      return targets;
    };
    // 최대 12회 (300ms 간격) 재시도 — iframe 로딩이 늦을 수 있음
    const MAX_ATTEMPTS = 12;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const frames = tryFrames();
      for (const frame of frames) {
        try {
          const result = await frame.executeJavaScript(`
            (function() {
              const pw = document.getElementById('password');
              if (!pw) return { found: false };
              if (pw.dataset.t1tFilled === '1') return { found: true, alreadyFilled: true };
              // React 호환 setter 사용
              const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              nativeSetter.call(pw, ${JSON.stringify(TPASS_PASSWORD)});
              pw.dataset.t1tFilled = '1';
              pw.dispatchEvent(new Event('input', { bubbles: true }));
              pw.dispatchEvent(new Event('change', { bubbles: true }));
              // 페이지에 정의된 checkPassword() 호출 우선, 없으면 직접 DOM 조작
              try {
                if (typeof checkPassword === 'function') {
                  checkPassword();
                } else {
                  const lb = document.getElementById('login-box');
                  const fs = document.getElementById('form-section');
                  if (lb) lb.style.display = 'none';
                  if (fs) fs.style.display = 'block';
                }
                return { found: true, submitted: true };
              } catch (e) {
                return { found: true, submitted: false, error: String(e) };
              }
            })();
          `, true);
          if (result && (result as any).found) {
            console.log(`[TPass] auto-login success (attempt ${attempt + 1}):`, result);
            return { ok: true, attempt: attempt + 1 };
          }
        } catch (err) {
          // 프레임이 cross-origin 차단 등으로 실패 시 다음 프레임 시도
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return { ok: false, reason: 'password input not found after retries' };
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
    // isSilent=true: 가능한 경우 NSIS 인스톨러를 silent 모드로 실행 → 매끄러운 업데이트
    // isForceRunAfter=true: 설치 후 앱 자동 실행
    autoUpdater.quitAndInstall(true, true);
  });

  // 메뉴에서 수동 호출 — 사용자에게 명확한 피드백
  ipcMain.handle('updater:check', async () => {
    try {
      manualCheckInProgress = true;
      const result = await autoUpdater.checkForUpdates();
      manualCheckInProgress = false;
      return { ok: true, version: result?.updateInfo?.version };
    } catch (err: any) {
      manualCheckInProgress = false;
      console.warn('[Updater] Manual check failed:', err);
      return { ok: false, error: err?.message || '업데이트 확인 실패 (네트워크 확인)' };
    }
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  // 시작 시 자동 실행 (로그인 시 실행)
  ipcMain.handle('app:get-auto-launch', () => {
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('app:set-auto-launch', (_event, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // Windows에서는 트레이로 시작 옵션을 보낼 수 있음 (옵션)
      openAsHidden: false,
    });
    return app.getLoginItemSettings().openAtLogin;
  });
}

// ============================================================
// Auto-updater
// ============================================================

// 수동 업데이트 확인 진행 여부 — 자동/수동 구분
let manualCheckInProgress = false;

function setupAutoUpdater(): void {
  if (isDev) return; // Skip in development

  // 사용자 개입 없이 백그라운드 자동 다운로드 → 매끄러운 경험
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // 다운로드 실패 시 자동 재시도 비활성 (직접 제어)
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('checking-for-update', () => {
    if (manualCheckInProgress) sendToRenderer('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    // 자동 다운로드 시작됨을 알리지만 진행률은 background
    sendToRenderer('updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    // 수동 확인일 때만 '최신 버전입니다' 표시 (자동 확인은 조용히)
    if (manualCheckInProgress) sendToRenderer('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    // 다운로드 완료 → 사용자에게 재시작 안내
    sendToRenderer('updater:downloaded');
  });

  autoUpdater.on('error', (err) => {
    // 네트워크/일시적 에러는 자동 확인 중엔 무시 (배너 깜빡임 방지)
    // 수동 확인 시에만 사용자에게 표시
    const msg = err?.message || '';
    // 잘 알려진 무해한 에러는 silently ignore
    const benign = /ENOTFOUND|ETIMEDOUT|ECONNRESET|ENETUNREACH|net::ERR/i.test(msg);
    if (manualCheckInProgress) {
      sendToRenderer('updater:error', benign ? '네트워크에 연결되지 않았습니다' : msg);
    } else {
      console.warn('[Updater] Silent auto-check error:', msg);
    }
  });

  // 시작 시 한 번 + 30분 주기 자동 확인 (조용히)
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
  // OAuth 자격증명 우선순위: 환경변수 > 빌드 타임 inject (credentials.gen.ts)
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || INJECTED_GOOGLE_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || INJECTED_GOOGLE_SECRET || '';
  const SCOPES = 'https://www.googleapis.com/auth/calendar';

  if (!GOOGLE_CLIENT_ID) {
    console.error('[GoogleAuth] GOOGLE_CLIENT_ID 미설정 — Google Calendar 연동 불가.');
  } else if (!app.isPackaged) {
    console.log(`[GoogleAuth] client_id 확인: ${GOOGLE_CLIENT_ID.slice(0, 30)}...`);
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
              // Google이 반환한 에러 그대로 전달 (+ 진단 정보)
              const errCode = json.error || `HTTP_${res.statusCode}`;
              const errDesc = json.error_description || '';
              const hint =
                errCode === 'invalid_grant' ? ' (코드 만료 또는 재사용 시도 — 다시 인증해주세요)' :
                errCode === 'invalid_client' ? ' (client_id/secret 불일치 — Google Cloud Console 확인)' :
                errCode === 'redirect_uri_mismatch' ? ` (redirect URI 미등록 — Console에 ${redirectUri} 등록 필요)` :
                '';
              const errMsg = `${errCode}${errDesc ? ': ' + errDesc : ''}${hint}`;
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

  type AuthResult = { access_token: string; refresh_token?: string; expires_in: number } | { error: string };

  // refresh_token으로 access_token 재발급
  ipcMain.handle('google:refresh', async (_event, refreshToken: string) => {
    if (!refreshToken || !GOOGLE_CLIENT_ID) return { error: 'no refresh token' };
    const https = require('https') as typeof import('https');
    const params: Record<string, string> = {
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    };
    if (GOOGLE_CLIENT_SECRET) params.client_secret = GOOGLE_CLIENT_SECRET;
    const body = new URLSearchParams(params).toString();
    return new Promise<{ access_token: string; expires_in: number } | { error: string }>((resolve) => {
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
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            if (json.access_token) {
              resolve({ access_token: json.access_token, expires_in: json.expires_in || 3600 });
            } else {
              resolve({ error: json.error_description || json.error || 'refresh failed' });
            }
          } catch (e: any) { resolve({ error: e?.message || 'parse error' }); }
        });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
      req.write(body);
      req.end();
    });
  });

  ipcMain.handle('google:auth', async () => {
    // 사전 검증 — 자격증명 없으면 즉시 에러 (사용자 친화 메시지 + 진단 정보)
    const idLen = (GOOGLE_CLIENT_ID || '').length;
    const secretLen = (GOOGLE_CLIENT_SECRET || '').length;
    const injectedIdLen = (INJECTED_GOOGLE_ID || '').length;
    const envIdLen = (process.env.GOOGLE_CLIENT_ID || '').length;
    const appVer = app.getVersion();
    console.log(`[GoogleAuth] preflight v${appVer} — clientId:${idLen} secret:${secretLen} injected:${injectedIdLen} env:${envIdLen}`);
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      const detail = `(앱 v${appVer}, injected:${injectedIdLen}, env:${envIdLen})`;
      return {
        error: `이 버전(v${appVer})은 Google Calendar 연동을 지원하지 않습니다. 최신 버전(v2.5.3+)을 새로 다운로드해서 설치해주세요. ${detail}`,
      } as AuthResult;
    }
    return new Promise<AuthResult>((resolve) => {
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
            safeResolve({
              access_token: result.access_token,
              refresh_token: result.refresh_token,
              expires_in: result.expires_in,
            });
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

      // 고정 포트 8123 우선, 사용 중이면 0(랜덤). 둘 다 실패하면 즉시 에러.
      const FIXED_PORT = 8123;
      const tryRandomPort = () => {
        server.removeAllListeners('error');
        server.once('error', (err: any) => {
          console.error('[GoogleAuth] Random port bind also failed:', err);
          safeResolve({
            error: `로컬 인증 서버를 시작할 수 없습니다 — Windows 방화벽이 T1T를 차단했을 가능성. 방화벽에서 T1T를 허용해주세요. (${err?.code || err?.message || 'unknown'})`,
          });
        });
        console.warn('[GoogleAuth] Port 8123 in use, trying random port');
        server.listen(0, '127.0.0.1');
      };
      server.once('error', (err: any) => {
        // 포트 8123 점유 시 랜덤 포트 재시도. EACCES(권한)는 즉시 실패
        if (err?.code === 'EACCES' || err?.code === 'EPERM') {
          console.error('[GoogleAuth] Port bind denied:', err);
          safeResolve({
            error: `포트 권한 거부 (${err.code}) — Windows 방화벽 / 보안 프로그램에서 T1T 차단 가능성. 방화벽 설정 확인 필요.`,
          });
          return;
        }
        tryRandomPort();
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
          console.log(`[GoogleAuth] Server listening on ${port}, redirect: ${redirectUri}`);
          console.log(`[GoogleAuth] Opening browser to Google auth URL (length=${authUrl.length})`);
          shell.openExternal(authUrl).catch((err) => {
            console.error('[GoogleAuth] openExternal failed:', err);
            safeResolve({ error: `브라우저를 열 수 없습니다: ${err?.message || '시스템 브라우저 호출 실패'}` });
          });
        }
      });
      server.listen(FIXED_PORT, '127.0.0.1');

      // 5분 후 타임아웃 (사용자가 인증 안 하고 방치)
      setTimeout(() => safeResolve({
        error: '시간 초과 (5분) — Google 로그인을 완료하지 못했습니다. 브라우저 창을 닫고 다시 시도해주세요.'
      }), 5 * 60 * 1000);
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
    // 한글·영문·숫자·공백·괄호·하이픈만 허용 (입력 sanitize)
    if (!/^[가-힣a-zA-Z0-9\s\-()()]+$/.test(trimmed)) {
      throw new Error('학교 이름은 한글/영문/숫자만 입력 가능합니다');
    }
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

// 싱글톤 락 — 이중 실행 방지 (설치 후 중복 실행 / 사용자 반복 클릭 대응)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('[App] 이미 다른 인스턴스 실행 중 — 종료');
  app.quit();
} else {
  app.on('second-instance', () => {
    // 두 번째 인스턴스 시도 시 기존 창 활성화
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  // 시작 속도 최적화: 핵심 IPC만 즉시, 나머지는 지연 로드
  setupIPC();
  setupGoogleAuthIPC();
  // 트레이/업데이터/스크래퍼는 50ms 후 지연 (메인 창 페인트 우선)
  setTimeout(() => {
    createTray();
    setupComciganIPC();
    setupSchoolScrapeIPC();
    setupAutoUpdater();
    if (mainWindow) comciganService.setMainWindow(mainWindow);
    // Comcigan 초기 fetch는 5초 더 지연 (네트워크 무거움)
    setTimeout(() => comciganService.init().catch(() => {}), 5000);
  }, 50);

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

app.on('before-quit', () => {
  // 종료 직전 창 상태 저장 (마지막 위치/크기)
  saveWindowState();
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

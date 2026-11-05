import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, powerMonitor, screen, shell, type NativeImage } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { autoUpdater } from 'electron-updater';
import { comciganService } from './comcigan';
import { defaultBounds, isReachable, parseSavedState, resolveBounds } from './windowPlacement';
import type { DisplayArea, Rect, SavedWindowState } from './windowPlacement';
import * as macUpdater from './macUpdater';
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
/** 사용자가 고른 항상 위 설정. 위젯 모드를 끄면 이 값으로 돌아간다 */
let alwaysOnTopPref = true;
/** 사용자가 직접 누른 최소화인지 구분 (Win+D 복귀와 구별) */
let userMinimizing = false;
/** 화면 구성이 바뀌는 동안에는 창 위치를 저장하지 않는다 */
let suspendSaveUntil = 0;
let updaterInterval: NodeJS.Timeout | null = null;
// 진짜 종료 중인지 — 창 close 핸들러는 평소엔 hide(트레이 상주)로 바꾸지만, 이 플래그가 서면 그대로 닫힌다.
// app.quit()은 창 하나라도 close를 preventDefault하면 취소되므로, 이 플래그 없이는 어떤 경로로도 종료가 완료되지 않았다.
let isQuitting = false;

// ─── 글로벌 크래시 안전망 ───
// comcigan-parser 등 서드파티 라이브러리의 비동기 콜백 내 예외는 promise 체인을
// 탈출해 uncaughtException이 됨 → 기본 동작은 흉측한 크래시 다이얼로그 + 앱 종료.
// 네트워크 오류 같은 회복 가능한 예외로 앱 전체가 죽으면 안 되므로 로그만 남기고 계속.
function logCrash(kind: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  console.error(`[${kind}]`, msg);
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    const line = `[${new Date().toISOString()}] ${kind}: ${msg}\n`;
    fs.appendFileSync(logPath, line);
    // 로그 5MB 초과 시 절반 자르기
    const stat = fs.statSync(logPath);
    if (stat.size > 5 * 1024 * 1024) {
      const content = fs.readFileSync(logPath, 'utf8');
      fs.writeFileSync(logPath, content.slice(content.length / 2));
    }
  } catch {}
}
process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err);
  // 앱 계속 실행 — 크래시 다이얼로그 표시 안 함
});
process.on('unhandledRejection', (reason) => {
  logCrash('unhandledRejection', reason);
});

// electron-updater 진단 로그 — userData/update.log (5MB 초과 시 절반 절삭).
// "자동 업데이트 안 됨" 재현 시 이 파일만 받으면 어느 단계(확인/다운로드/검증/설치)에서
// 멈췄는지 바로 알 수 있음. 지금까지는 실패 원인이 아무 데도 남지 않았음.
function logUpdate(level: string, msg: unknown): void {
  let text: string;
  if (msg instanceof Error) text = `${msg.message}\n${msg.stack}`;
  else if (typeof msg === 'string') text = msg;
  else { try { text = JSON.stringify(msg); } catch { text = String(msg); } }
  try {
    const logPath = path.join(app.getPath('userData'), 'update.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [${level}] ${text}\n`);
    const stat = fs.statSync(logPath);
    if (stat.size > 5 * 1024 * 1024) {
      const content = fs.readFileSync(logPath, 'utf8');
      fs.writeFileSync(logPath, content.slice(content.length / 2));
    }
  } catch {}
}

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

// macOS에서 투명 창 표시 안정성을 위해 GPU 가속을 끈다.
// 예전에 함께 쓰던 no-sandbox는 Electron 45에서 필요 없어 제거했다. 외부 페이지를 띄우는 앱이라 샌드박스를 유지한다.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-gpu');
}

// 창 위치/크기 영구 저장 (userData/window-state.json)
function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}
function loadWindowState(): SavedWindowState | null {
  try {
    const p = getWindowStatePath();
    if (fs.existsSync(p)) return parseSavedState(JSON.parse(fs.readFileSync(p, 'utf-8')));
  } catch (e) { console.warn('[Window] loadState failed:', e); }
  return null;
}
function saveWindowState(): void {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // 모니터를 뺀 직후에 끌려온 위치로 저장 위치를 덮어쓰면, 다시 꽂아도 원래 자리로 못 돌아간다
    if (Date.now() < suspendSaveUntil) return;
    const b = mainWindow.getBounds();
    const state: SavedWindowState = { ...b, displayId: screen.getDisplayMatching(b).id };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state), 'utf-8');
  } catch (e) { console.warn('[Window] saveState failed:', e); }
}
function currentDisplays(): DisplayArea[] {
  return screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea as Rect }));
}
function setWindowBounds(bounds: Rect): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // 위젯 모드에서는 크기 조절이 꺼져 있어 setBounds가 크기를 무시할 수 있다
  const wasResizable = mainWindow.isResizable();
  if (!wasResizable) mainWindow.setResizable(true);
  mainWindow.setBounds(bounds);
  if (!wasResizable) mainWindow.setResizable(false);
}
/** 화면 구성이 바뀐 뒤: 저장 자리가 다시 보이면 그리로, 창이 안 보이면 화면 안으로 */
function repositionForDisplays(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const displays = currentDisplays();
  const primary = screen.getPrimaryDisplay().workArea as Rect;
  const target = resolveBounds(loadWindowState(), displays, primary);
  const now = mainWindow.getBounds();
  if (!isReachable(now, displays) || isReachable(target, displays)) {
    if (target.x !== now.x || target.y !== now.y || target.width !== now.width || target.height !== now.height) {
      setWindowBounds(target);
    }
  }
}
/** 창을 잃어버렸을 때 트레이에서 부르는 복구 */
function resetWindowPosition(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  suspendSaveUntil = 0;
  setWindowBounds(defaultBounds(screen.getPrimaryDisplay().workArea as Rect));
  mainWindow.show();
  mainWindow.focus();
  saveWindowState();
}

function createWindow(): void {
  // 아이콘 경로 — 개발/패키지(asar) 모두 동일 (__dirname 상대)
  const iconPath = path.join(__dirname, '../../assets', process.platform === 'win32' ? 'icon.ico' : 'icon.icns');

  // 저장된 창 상태 복원. 보조 모니터 위치는 유지하고, 사라진 모니터면 화면 안으로 옮긴다
  const initial = resolveBounds(loadWindowState(), currentDisplays(), screen.getPrimaryDisplay().workArea as Rect);

  mainWindow = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: initial.x,
    y: initial.y,
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

  // Win+D 등으로 위젯이 최소화되면 다시 띄운다. 직접 누른 최소화와 편집 모드는 건드리지 않는다.
  if (process.platform === 'win32') {
    let lastRestore = 0;
    mainWindow.on('minimize', () => {
      if (userMinimizing) { userMinimizing = false; return; }
      if (!isWidgetMode || Date.now() - lastRestore < 1000) return;
      lastRestore = Date.now();
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed() || !isWidgetMode) return;
        mainWindow.restore();
        mainWindow.showInactive();
      }, 150);
    });
  }

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
    // 진짜 종료(트레이 종료 / 업데이트 설치 / autoInstallOnAppQuit)면 그대로 닫히게 둔다.
    // 이 분기가 없으면 app.quit()이 여기서 취소되어 — 업데이트 인스톨러만 뜨고 앱은 숨은 채 살아남아
    // 인스톨러의 taskkill에 함께 죽는 — "앱만 꺼지고 새 버전은 안 깔림"의 한 축이었다.
    if (isQuitting) return;
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

/** 가리기 상태는 렌더러가 들고 있다. 창이 숨겨져 있어도 다음에 보일 때 가려져 있도록 신호만 보낸다. */
function togglePersonalPrivacy(): void {
  mainWindow?.webContents.send('privacy:toggle');
}

function updateTrayMenu(): void {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '캘린더 표시/숨김',
      click: () => toggleWindow(),
    },
    {
      label: '창을 화면 안으로 가져오기',
      click: () => resetWindowPosition(),
    },
    {
      label: '개인 일정 가리기/보이기 (Ctrl+Shift+H)',
      click: () => togglePersonalPrivacy(),
    },
    {
      label: '항상 위',
      type: 'checkbox',
      checked: !!mainWindow?.isAlwaysOnTop(),
      click: (menuItem) => {
        alwaysOnTopPref = menuItem.checked;
        mainWindow?.setAlwaysOnTop(menuItem.checked);
      },
    },
    {
      label: isClickThrough ? '클릭 통과 해제' : '클릭 통과 켜기',
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
    // Edit mode: interactive, resizable. 항상 위는 사용자 설정을 따른다
    mainWindow.setAlwaysOnTop(alwaysOnTopPref);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.focus();
  }
}

// IPC Handlers
function setupIPC(): void {
  ipcMain.handle('window:toggle-always-on-top', (_event, value: boolean) => {
    alwaysOnTopPref = !!value;
    // 위젯 모드에서는 다른 창 뒤에 있어야 하므로 설정값만 기억하고 해제할 때 적용한다
    if (!isWidgetMode) mainWindow?.setAlwaysOnTop(alwaysOnTopPref);
  });


  ipcMain.handle('window:toggle-click-through', (_event, enabled: boolean) => {
    setClickThrough(enabled);
  });

  ipcMain.handle('window:get-click-through', () => {
    return isClickThrough;
  });

  ipcMain.handle('window:minimize', () => {
    userMinimizing = true;
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
    // 모니터마다 좌표계가 다르므로 주 모니터로 끌어오지 않고, 어느 화면에서도 잡을 수 없을 때만 옮긴다
    const next = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    const displays = currentDisplays();
    setWindowBounds(isReachable(next, displays) ? next : resolveBounds({ ...next }, displays, screen.getPrimaryDisplay().workArea as Rect));
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
  // 업데이트 수동 다운로드 페이지 열기 (자동 업데이트 실패 시 fallback)
  ipcMain.handle('updater:open-download-page', async () => {
    try {
      // 최신 릴리스 직접 링크 — 항상 최신 .exe로 리다이렉트
      await shell.openExternal('https://github.com/bonggisam/T1T/releases/latest');
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: e?.message || 'unknown' };
    }
  });

  // 외부 링크 열기 (도서관 시스템 등) — URL 화이트리스트로 안전 보장
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (typeof url !== 'string') return { ok: false, reason: 'invalid' };
    // https 만 허용 + 신뢰 도메인 화이트리스트
    const ALLOWED_HOSTS = [
      'read365.edunet.net',         // 학교 도서관(독서로)
      'comci.net',                  // 컴시간
      'comcigan.co.kr',             // 컴시간 문의 게시판
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

  ipcMain.handle('tray:set-badge', (_event, hasBadge: boolean) => {
    if (tray) {
      tray.setToolTip(hasBadge ? 'T1T (새 알림)' : 'T1T');
    }
  });

  // Auto-updater IPC
  ipcMain.handle('updater:download', async () => {
    // 미서명 Mac은 Squirrel 다운로드가 항상 실패 → 릴리스 페이지로 안내
    if (macSelfUpdate) return; // 자체 설치기가 이미 자동 다운로드 중
    if (UPDATER_MANUAL_ONLY) {
      await shell.openExternal(RELEASES_URL).catch(() => {});
      return;
    }
    autoUpdater.downloadUpdate().catch((err) => console.error('[Updater] Download failed:', err));
  });

  ipcMain.handle('updater:install', () => {
    // 흐름 (installDownloadedUpdate):
    //   1) UI에 "설치 중" 알림 → 사용자 인지
    //   2) 500ms 대기 (배너가 렌더 완료할 시간)
    //   3) isQuitting = true → 창 close 핸들러가 preventDefault(hide)를 건너뛰어 app.quit()이 실제로 완료됨.
    //      (이 플래그 없이는 quitAndInstall이 spawn한 인스톨러만 뜨고 앱은 숨겨진 채 살아 있었음)
    //   4) Windows: quitAndInstall(isSilent=false, isForceRunAfter=true):
    //      electron-updater 6 실제 동작은 install(isSilent, isSilent ? isForceRunAfter : autoRunAppAfterInstall)
    //      → isSilent=false면 두 번째 인자는 무시되고 autoRunAppAfterInstall(기본 true)가 쓰여 `--updated --force-run`.
    //      /S 없이 oneClick 인스톨러의 작은 진행 창이 보이는데, "앱이 사라졌다"는 오해를 막아 주므로 의도적으로 유지.
    //      Mac: 자체 설치기 스크립트가 종료 후 번들 교체 + 재실행.
    //   5) 실패 시 사용자에게 에러 + 수동 설치 경로 안내
    if (UPDATER_MANUAL_ONLY && !macSelfUpdate) {
      shell.openExternal(RELEASES_URL).catch(() => {});
      return;
    }
    installDownloadedUpdate('user');
  });

  // 메뉴에서 수동 호출 — 사용자에게 명확한 피드백
  ipcMain.handle('updater:check', async () => {
    let timer: NodeJS.Timeout | undefined;
    try {
      manualCheckInProgress = true;
      // 학교망에서 응답이 오지 않으면 끝없이 기다리게 되므로 시간을 정해 둔다
      const result = await Promise.race([
        autoUpdater.checkForUpdates(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('GitHub 응답이 없습니다. 네트워크를 확인해 주세요')), UPDATE_CHECK_TIMEOUT_MS);
        }),
      ]);
      // 개발 실행처럼 업데이트 기능이 꺼져 있으면 결과가 없다
      if (!result) return { ok: false, error: '이 실행 환경에서는 업데이트를 확인할 수 없습니다' };
      // version은 받을 새 버전이 있을 때만 준다. 이미 최신이어도 updateInfo에는 최신 버전이 들어 있다.
      return {
        ok: true,
        latest: result.updateInfo.version,
        version: result.isUpdateAvailable ? result.updateInfo.version : undefined,
      };
    } catch (err: any) {
      console.warn('[Updater] Manual check failed:', err);
      return { ok: false, error: err?.message || '업데이트 확인 실패 (네트워크 확인)' };
    } finally {
      if (timer) clearTimeout(timer);
      manualCheckInProgress = false;
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
    });
    return app.getLoginItemSettings().openAtLogin;
  });
}

// ============================================================
// Auto-updater
// ============================================================

// 수동 업데이트 확인 진행 여부 — 자동/수동 구분
let manualCheckInProgress = false;
// 다운로드 실패 자동 재시도 카운터 (update-available 시 리셋)
let downloadRetries = 0;
const MAX_DOWNLOAD_RETRIES = 3;
/** 수동 확인에서 응답을 기다리는 시간 */
const UPDATE_CHECK_TIMEOUT_MS = 30 * 1000;
// macOS: 앱이 코드 서명되어 있지 않음(package.json build.mac.identity = "-").
// Squirrel.Mac 자동 업데이트는 서명이 필수라 미서명 앱은 다운로드 단계에서 항상 실패한다.
// → Mac은 자동 다운로드/설치를 끄고 "새 버전 있음 + 수동 다운로드" 안내만 한다.
//   (Apple Developer 인증서로 서명하게 되면 이 플래그를 false로 바꾸면 됨)
const UPDATER_MANUAL_ONLY = process.platform === 'darwin';
const RELEASES_URL = 'https://github.com/bonggisam/T1T/releases/latest';
// Mac 자체 설치기(macUpdater.ts) 사용 가능 여부 — 앱 위치에 쓰기 권한이 있을 때만. setupAutoUpdater에서 결정.
let macSelfUpdate = false;
// Mac 자체 설치기로 받아 검증까지 끝난 DMG 경로
let macDownloadedDmg: string | null = null;
let macDownloading = false;
// 다운로드 완료 후 자동 설치: 입력이 이 시간 이상 없거나 화면이 잠기면 조용히 설치
const AUTO_INSTALL_IDLE_SEC = 10 * 60;
let autoInstallTimer: NodeJS.Timeout | null = null;
let installStarted = false;
let lastAvailableVersion: string | null = null; // 재시도 카운터는 "새" 버전을 봤을 때만 리셋
let downloadedVersion: string | null = null;    // 다운로드 완료된 버전 — 30분 재확인이 배너를 'available'로 되돌리지 않도록
let autoErrorNotified = false;                  // 자동 확인 중 비-네트워크 오류는 세션당 1회만 배너로 알림

/**
 * 다운로드된 업데이트 설치.
 * reason='user'면 기존처럼 진행 창이 보이는 설치, 'idle'/'lock'(자리 비움)이면 조용히 설치 후 자동 재실행.
 */
function installDownloadedUpdate(reason: 'user' | 'idle' | 'lock'): void {
  if (installStarted) return;
  const isMac = process.platform === 'darwin';
  if (isMac ? !macDownloadedDmg : !downloadedVersion) return;
  installStarted = true;
  logUpdate('info', `install requested (${reason}) v${downloadedVersion}`);
  sendToRenderer('updater:installing');

  setTimeout(() => {
    try {
      isQuitting = true;
      if (isMac) {
        // 앱 종료를 기다렸다가 번들을 교체하고 다시 실행하는 스크립트 → 그다음 종료
        macUpdater.spawnInstaller(macDownloadedDmg!, true);
        app.quit();
      } else {
        // 자리 비움 설치는 /S(silent) + 설치 후 자동 실행. 사용자가 누른 설치는 진행 창 유지 (updater:install 주석 참조)
        autoUpdater.quitAndInstall(reason !== 'user', true);
      }
    } catch (err: any) {
      installStarted = false;
      console.error('[Updater] install failed:', err);
      logUpdate('error', err);
      sendToRenderer('updater:error', `설치 시작 실패: ${err?.message || '알 수 없음'} — 앱 종료 후 다시 실행하면 자동 적용됩니다.`);
    }
  }, 500);
}

/** 다운로드 완료 후 1분마다 자리 비움 여부를 확인해 자동 설치 */
function scheduleAutoInstall(): void {
  if (autoInstallTimer) return;
  autoInstallTimer = setInterval(() => {
    if (powerMonitor.getSystemIdleTime() >= AUTO_INSTALL_IDLE_SEC) {
      if (autoInstallTimer) { clearInterval(autoInstallTimer); autoInstallTimer = null; }
      installDownloadedUpdate('idle');
    }
  }, 60 * 1000);
}

/** 미서명 Mac — DMG를 직접 받아 sha512 검증 (실패 시 20s/40s/60s 후 재시도) */
async function startMacDownload(version: string, files: macUpdater.UpdateFileInfo[]): Promise<void> {
  if (macDownloading || (macDownloadedDmg && downloadedVersion === version)) return;
  const file = macUpdater.pickDmg(files);
  if (!file) {
    logUpdate('warn', `no dmg for arch ${process.arch} in v${version}`);
    sendToRenderer('updater:available', { version, manualOnly: true });
    return;
  }
  macDownloading = true;
  try {
    const dmg = await macUpdater.downloadDmg(version, file, (p) => sendToRenderer('updater:progress', p));
    macDownloadedDmg = dmg;
    downloadedVersion = version;
    logUpdate('info', `mac update-downloaded: v${version} → ${dmg}`);
    sendToRenderer('updater:downloaded', { idleMinutes: AUTO_INSTALL_IDLE_SEC / 60 });
    scheduleAutoInstall();
  } catch (err: any) {
    logUpdate('error', err);
    if (downloadRetries < MAX_DOWNLOAD_RETRIES) {
      downloadRetries++;
      setTimeout(() => { startMacDownload(version, files).catch(() => {}); }, downloadRetries * 20 * 1000);
    } else {
      sendToRenderer('updater:error', `자동 업데이트 실패 — 설정에서 수동 다운로드를 이용해주세요. (${(err?.message || '').slice(0, 80)})`);
    }
  } finally {
    macDownloading = false;
  }
}

function setupAutoUpdater(): void {
  if (isDev) return; // Skip in development

  macSelfUpdate = UPDATER_MANUAL_ONLY && macUpdater.isSupported();

  // 옛 버전(v2.5.20~v2.5.39)에서 캐시된 feedURL을 우회하기 위해 명시적으로 설정.
  // package.json의 build.publish가 있어도 매번 GitHub 원본을 명시해 캐시 mismatch 회피.
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'bonggisam',
      repo: 'T1T',
    });
  } catch (err) {
    console.warn('[Updater] setFeedURL failed (will fallback to package.json):', err);
  }

  // electron-updater 내부 동작을 파일로 기록 (확인 → 다운로드 → sha512 검증 → 설치 spawn)
  autoUpdater.logger = {
    info: (m: unknown) => logUpdate('info', m),
    warn: (m: unknown) => logUpdate('warn', m),
    error: (m: unknown) => logUpdate('error', m),
    debug: (m: unknown) => logUpdate('debug', m),
  };
  logUpdate('info', `setupAutoUpdater v${app.getVersion()} platform=${process.platform} manualOnly=${UPDATER_MANUAL_ONLY} macSelfUpdate=${macSelfUpdate}`);
  // 참고: 'before-quit-for-update'는 Electron 내장 autoUpdater의 이벤트이며 electron-updater에는 없다.
  // 종료 플래그(isQuitting)는 app.on('before-quit')에서 세우므로 quitAndInstall / autoInstallOnAppQuit
  // 어느 경로든 app.quit() 시점에 창 close 핸들러가 quit를 가로채지 않는다.

  // Windows: 사용자 개입 없이 백그라운드 자동 다운로드 → 매끄러운 경험
  // Mac(미서명): 자동 다운로드/설치 불가 → 확인만 하고 수동 안내 (UPDATER_MANUAL_ONLY 주석 참조)
  autoUpdater.autoDownload = !UPDATER_MANUAL_ONLY;
  autoUpdater.autoInstallOnAppQuit = !UPDATER_MANUAL_ONLY;
  // 다운로드 실패 시 자동 재시도 비활성 (직접 제어)
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('checking-for-update', () => {
    if (manualCheckInProgress) sendToRenderer('updater:checking');
  });

  autoUpdater.on('update-available', (info) => {
    // 30분마다 재확인이 돌면 같은 버전으로 이 이벤트가 반복 발화한다.
    // 재시도 카운터를 매번 0으로 돌리면 3회 제한이 무의미해지므로 "새 버전"일 때만 리셋.
    if (info.version !== lastAvailableVersion) {
      downloadRetries = 0;
      lastAvailableVersion = info.version;
    }
    logUpdate('info', `update-available: v${info.version} (current v${app.getVersion()})`);
    // 이미 다운로드까지 끝난 버전이면 배너를 'available'로 되돌리지 않음 (설치 버튼 유지)
    if (downloadedVersion === info.version) return;
    // 미서명 Mac: Squirrel 대신 자체 설치기로 DMG 다운로드
    if (macSelfUpdate) {
      sendToRenderer('updater:available', { version: info.version, releaseNotes: info.releaseNotes, manualOnly: false });
      startMacDownload(info.version, info.files as macUpdater.UpdateFileInfo[]).catch(() => {});
      return;
    }
    // Windows: 자동 다운로드 시작됨을 알리지만 진행률은 background
    // Mac: manualOnly → 배너가 "다운로드 페이지 열기" 버튼을 보여줌
    sendToRenderer('updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      manualOnly: UPDATER_MANUAL_ONLY,
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

  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info?.version ?? lastAvailableVersion;
    logUpdate('info', `update-downloaded: v${downloadedVersion}`);
    // 다운로드 완료 → 자리 비움 시 자동 설치 예약 + 배너로 안내 (바로 설치 버튼도 제공)
    sendToRenderer('updater:downloaded', { idleMinutes: AUTO_INSTALL_IDLE_SEC / 60 });
    scheduleAutoInstall();
  });

  autoUpdater.on('error', (err) => {
    const msg = err?.message || '';
    // 진단용 — 업데이트 실패 원인 추적 (crash.log에 기록)
    logCrash('updater-error', err);
    // 다운로드/체크섬 관련 에러면 자동 재시도 (지수 백오프).
    // 학교망 불안정으로 100MB 다운로드가 중단되는 케이스를 자동 회복.
    const isDownloadErr = /download|net::|ETIMEDOUT|ECONNRESET|ENETUNREACH|EPIPE|sha512|checksum|EAI_AGAIN/i.test(msg);
    if (!UPDATER_MANUAL_ONLY && isDownloadErr && downloadRetries < MAX_DOWNLOAD_RETRIES) {
      downloadRetries++;
      const delaySec = downloadRetries * 20; // 20s, 40s, 60s
      console.warn(`[Updater] Download error — retry ${downloadRetries}/${MAX_DOWNLOAD_RETRIES} in ${delaySec}s`);
      setTimeout(() => autoUpdater.downloadUpdate().catch(() => {}), delaySec * 1000);
      return;
    }
    // 잘 알려진 무해한 에러는 자동 확인 중엔 조용히 무시 (배너 깜빡임 방지)
    const benign = /ENOTFOUND|ETIMEDOUT|ECONNRESET|ENETUNREACH|net::ERR/i.test(msg);
    if (manualCheckInProgress) {
      sendToRenderer('updater:error', benign ? '네트워크에 연결되지 않았습니다' : msg);
    } else if (downloadRetries >= MAX_DOWNLOAD_RETRIES) {
      // 재시도 모두 소진 — 사용자에게 수동 다운로드 유도
      sendToRenderer('updater:error', `자동 업데이트 실패 — 설정에서 수동 다운로드를 이용해주세요. (${msg.slice(0, 80)})`);
    } else if (!benign && !autoErrorNotified) {
      // latest.yml 404, provider 오류 등 "다운로드가 아닌" 실패는 지금까지 완전 무음이었음
      // (프로덕션 콘솔은 아무도 안 봄) → 왜 안 되는지 알 길이 없었다. 세션당 1회는 배너로 알린다.
      autoErrorNotified = true;
      sendToRenderer('updater:error', `업데이트 확인 실패: ${msg.slice(0, 100)} — 설정 > 수동 다운로드 (update.log 참조)`);
    } else {
      console.warn('[Updater] Silent auto-check error:', msg);
    }
  });

  // 화면 잠금 = 자리 비움 → 받아 둔 업데이트가 있으면 바로 설치
  powerMonitor.on('lock-screen', () => installDownloadedUpdate('lock'));

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

// Weather IPC (날씨 + 미세먼지)
function setupWeatherIPC(): void {
  const { fetchWeather } = require('./weather');

  ipcMain.handle('weather:fetch', async (_event, lat: number, lon: number) => {
    // 대한민국 범위 밖 좌표는 거부 (입력 검증)
    if (typeof lat !== 'number' || typeof lon !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < 33 || lat > 39 || lon < 124 || lon > 132) {
      throw new Error('Invalid coordinates');
    }
    return fetchWeather(lat, lon);
  });
}

// Comcigan IPC
function setupComciganIPC(): void {
  ipcMain.handle('comcigan:search', async (_event, name: string) => {
    if (typeof name !== 'string') throw new Error('Invalid school name');
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 50) throw new Error('Invalid school name');
    // 한글·영문·숫자·공백·괄호·하이픈만 허용 (입력 sanitize)
    if (!/^[가-힣a-zA-Z0-9\s\-()]+$/.test(trimmed)) {
      throw new Error('학교 이름은 한글/영문/숫자만 입력 가능합니다');
    }
    return comciganService.searchSchool(trimmed);
  });

  ipcMain.handle('comcigan:school-grid', async (_event, schoolCode: number, maxGrade: number, force?: boolean) => {
    if (!Number.isInteger(schoolCode) || schoolCode <= 0 || schoolCode > 9_999_999) throw new Error('Invalid school code');
    if (!Number.isInteger(maxGrade) || maxGrade < 1 || maxGrade > 6) throw new Error('Invalid grade');
    return comciganService.getSchoolGrid(schoolCode, maxGrade, force === true);
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
    setupWeatherIPC();
    setupAutoUpdater();
    if (mainWindow) comciganService.setMainWindow(mainWindow);
    // Comcigan 초기 fetch는 5초 더 지연 (네트워크 무거움)
    setTimeout(() => comciganService.init().catch(() => {}), 5000);
  }, 50);

  // 화면 구성 변경: 모니터 연결, 해제, 해상도 변경
  let displayDebounce: NodeJS.Timeout | null = null;
  const onDisplayChanged = () => {
    suspendSaveUntil = Date.now() + 3000;
    if (displayDebounce) clearTimeout(displayDebounce);
    displayDebounce = setTimeout(repositionForDisplays, 1000);
  };
  screen.on('display-added', onDisplayChanged);
  screen.on('display-removed', onDisplayChanged);
  screen.on('display-metrics-changed', onDisplayChanged);

  // 절전 복귀, 화면 잠금 해제: 창 위치와 날짜, 시간표를 다시 맞춘다
  const onWake = () => {
    setTimeout(() => {
      repositionForDisplays();
      mainWindow?.webContents.send('system:woke');
      comciganService.fetchTimetable().catch(() => {});
    }, 1500);
  };
  powerMonitor.on('resume', onWake);
  powerMonitor.on('unlock-screen', onWake);

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

  // Ctrl+Shift+H: 개인 일정 즉시 가리기/보이기. 발표나 수업 직전에 다른 프로그램을 쓰다가도 바로 눌러야 한다.
  // 다른 프로그램이 먼저 잡고 있으면 제목 줄 눈 단추와 트레이 메뉴로 쓸 수 있다.
  const privacyShortcutOk = globalShortcut.register('CommandOrControl+Shift+H', togglePersonalPrivacy);
  if (!privacyShortcutOk) {
    console.warn('[Shortcut] Failed to register Ctrl+Shift+H — may conflict with another app');
  }
});

app.on('before-quit', () => {
  // 어떤 경로로 app.quit()이 불리든(트레이 종료, 업데이트, 싱글톤 락) 창 close가 quit를 가로채지 않게 한다.
  isQuitting = true;
  // 종료 직전 창 상태 저장 (마지막 위치/크기)
  saveWindowState();
  // Mac: 받아 둔 업데이트가 있으면 종료와 함께 설치 (Windows는 autoInstallOnAppQuit이 담당). 다시 실행하지는 않음.
  if (macDownloadedDmg && !installStarted) {
    installStarted = true;
    try { macUpdater.spawnInstaller(macDownloadedDmg, false); }
    catch (err) { logUpdate('error', err); }
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  comciganService.stopAutoRefresh();
  if (updaterInterval) { clearInterval(updaterInterval); updaterInterval = null; }
  if (autoInstallTimer) { clearInterval(autoInstallTimer); autoInstallTimer = null; }
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

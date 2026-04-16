import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, type NativeImage } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { comciganService } from './comcigan';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isClickThrough = false;
let isWidgetMode = true; // Desktop widget mode (pinned behind windows)

const isDev = !app.isPackaged;

// macOS 26 (Tahoe) beta workaround: disable sandbox to prevent V8 crash
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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '캘린더 표시/숨김',
      click: () => toggleWindow(),
    },
    {
      label: '항상 위',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        mainWindow?.setAlwaysOnTop(menuItem.checked);
      },
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

  tray.setToolTip('ToneT');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleWindow());
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
    mainWindow?.setOpacity(opacity);
  });

  ipcMain.handle('window:toggle-click-through', (_event, enabled: boolean) => {
    isClickThrough = enabled;
    mainWindow?.setIgnoreMouseEvents(enabled, { forward: true });
  });

  ipcMain.handle('window:minimize', () => {
    mainWindow?.hide();
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.destroy();
    app.quit();
  });

  ipcMain.handle('window:set-size', (_event, width: number, height: number) => {
    mainWindow?.setSize(width, height);
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
    if (mainWindow) {
      // Temporarily allow resize so setBounds works even in widget mode
      const wasResizable = mainWindow.isResizable();
      if (!wasResizable) mainWindow.setResizable(true);
      mainWindow.setBounds(bounds);
      if (!wasResizable) mainWindow.setResizable(false);
    }
  });

  ipcMain.handle('tray:set-badge', (_event, hasBadge: boolean) => {
    if (tray) {
      tray.setToolTip(hasBadge ? 'ToneT (새 알림)' : 'ToneT');
    }
  });

  // Auto-updater IPC
  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate().catch(() => {});
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('updater:check', () => {
    autoUpdater.checkForUpdates().catch(() => {});
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

  // Check for updates every 30 minutes
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}

// Google Calendar OAuth IPC
function setupGoogleAuthIPC(): void {
  const GOOGLE_CLIENT_ID = '607193357118-cu3ldm1e22re43un4bhc6p5j2e221kpk.apps.googleusercontent.com';
  const REDIRECT_URI = 'http://localhost/auth/google/callback';
  const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

  ipcMain.handle('google:auth', () => {
    return new Promise<{ access_token: string; expires_in: number } | null>((resolve) => {
      const authWindow = new BrowserWindow({
        width: 500,
        height: 650,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `response_type=token&` +
        `scope=${encodeURIComponent(SCOPES)}&` +
        `prompt=consent`;

      authWindow.loadURL(authUrl);

      authWindow.webContents.on('will-redirect', (_event, url) => {
        try {
          if (url.startsWith(REDIRECT_URI)) {
            const hash = new URL(url).hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in') || '3600');
            if (token) {
              resolve({ access_token: token, expires_in: expiresIn });
            } else {
              resolve(null);
            }
            authWindow.close();
          }
        } catch {
          resolve(null);
          authWindow.close();
        }
      });

      authWindow.webContents.on('will-navigate', (_event, url) => {
        try {
          if (url.startsWith(REDIRECT_URI)) {
            const hash = new URL(url).hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get('access_token');
            const expiresIn = parseInt(params.get('expires_in') || '3600');
            if (token) {
              resolve({ access_token: token, expires_in: expiresIn });
            } else {
              resolve(null);
            }
            authWindow.close();
          }
        } catch {}
      });

      authWindow.on('closed', () => {
        resolve(null);
      });
    });
  });
}

// Comcigan IPC
function setupComciganIPC(): void {
  ipcMain.handle('comcigan:search', async (_event, name: string) => {
    return comciganService.searchSchool(name);
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
  setupAutoUpdater();

  // Initialize comcigan service
  if (mainWindow) comciganService.setMainWindow(mainWindow);
  comciganService.init().catch(() => {});

  // Start in widget mode after window loads
  mainWindow?.webContents.on('did-finish-load', () => {
    applyWidgetMode(true);
  });

  // Register global shortcut: Ctrl+Shift+C to toggle edit/widget mode
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (mainWindow?.isVisible()) {
      applyWidgetMode(!isWidgetMode);
      mainWindow?.webContents.send('widget-mode-changed', isWidgetMode);
    } else {
      mainWindow?.show();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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

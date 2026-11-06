import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { ComciganConfig, ComciganSchool, ComciganSchoolGrid, ComciganTimetableData, WeatherData } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  toggleAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:toggle-always-on-top', value),
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  toggleClickThrough: (enabled: boolean) => ipcRenderer.invoke('window:toggle-click-through', enabled),
  getClickThrough: (): Promise<boolean> => ipcRenderer.invoke('window:get-click-through'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  setSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', width, height),
  setWidgetMode: (enabled: boolean) => ipcRenderer.invoke('window:set-widget-mode', enabled),
  getWidgetMode: () => ipcRenderer.invoke('window:get-widget-mode'),
  getBounds: () => ipcRenderer.invoke('window:get-bounds'),
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('window:set-bounds', bounds),
  startEdgeResize: (edge: string) => ipcRenderer.invoke('window:start-edge-resize', edge),
  stopEdgeResize: () => ipcRenderer.invoke('window:stop-edge-resize'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  tpassAutoLogin: (webContentsId: number) => ipcRenderer.invoke('tpass:auto-login', webContentsId),
  onWidgetModeChanged: (callback: (enabled: boolean) => void) => {
    const listener = (_event: any, enabled: boolean) => callback(enabled);
    ipcRenderer.on('widget-mode-changed', listener);
    return () => ipcRenderer.removeListener('widget-mode-changed', listener);
  },
  onSystemWoke: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('system:woke', listener);
    return () => ipcRenderer.removeListener('system:woke', listener);
  },
  onPrivacyToggle: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('privacy:toggle', listener);
    return () => ipcRenderer.removeListener('privacy:toggle', listener);
  },
  onClickThroughChanged: (callback: (enabled: boolean) => void) => {
    const listener = (_event: any, enabled: boolean) => callback(enabled);
    ipcRenderer.on('click-through-changed', listener);
    return () => ipcRenderer.removeListener('click-through-changed', listener);
  },
  setTrayBadge: (hasBadge: boolean) => ipcRenderer.invoke('tray:set-badge', hasBadge),

  // Auto-updater
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterOpenDownloadPage: () => ipcRenderer.invoke('updater:open-download-page'),
  updaterGetState: () => ipcRenderer.invoke('updater:get-state'),
  updaterCopyLog: () => ipcRenderer.invoke('updater:copy-log'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getAutoLaunch: (): Promise<boolean> => ipcRenderer.invoke('app:get-auto-launch'),
  setAutoLaunch: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('app:set-auto-launch', enabled),
  onUpdaterEvent: (callback: (channel: string, data: any) => void) => {
    const channels = ['updater:checking', 'updater:available', 'updater:not-available', 'updater:progress', 'updater:downloaded', 'updater:installing', 'updater:error'];
    const listeners = channels.map((ch) => {
      const listener = (_event: any, data: any) => callback(ch, data);
      ipcRenderer.on(ch, listener);
      return { ch, listener };
    });
    return () => {
      listeners.forEach(({ ch, listener }) => ipcRenderer.removeListener(ch, listener));
    };
  },

  // Google Calendar OAuth
  googleAuth: () => ipcRenderer.invoke('google:auth'),
  googleRefresh: (refreshToken: string) => ipcRenderer.invoke('google:refresh', refreshToken),

  // School website scraper (학사일정 + 급식)
  schoolFetchSchedule: (schoolKey: string): Promise<{ events: Array<{ startDate: string; endDate: string; title: string; seq: string }> }> => ipcRenderer.invoke('school:fetchSchedule', schoolKey),
  schoolFetchMeal: (schoolKey: string, dateYMD?: string): Promise<{ weekStart: string; weekEnd: string; days: Array<{ date: string; weekday: string; menu: string[]; calorie: string }> }> => ipcRenderer.invoke('school:fetchMeal', schoolKey, dateYMD),

  // Weather (날씨 + 미세먼지)
  weatherFetch: (lat: number, lon: number): Promise<WeatherData> => ipcRenderer.invoke('weather:fetch', lat, lon),

  // Comcigan
  comciganSearch: (name: string): Promise<ComciganSchool[]> => ipcRenderer.invoke('comcigan:search', name),
  comciganConfigure: (config: ComciganConfig): Promise<void> => ipcRenderer.invoke('comcigan:configure', config),
  clearWebSessions: (): Promise<void> => ipcRenderer.invoke('app:clear-web-sessions'),
  setEditShortcut: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:set-edit-shortcut', enabled),
  comciganSetUser: (userId: string | null): Promise<void> => ipcRenderer.invoke('comcigan:set-user', userId),
  comciganGetConfig: (): Promise<ComciganConfig | null> => ipcRenderer.invoke('comcigan:get-config'),
  comciganFetch: (force?: boolean): Promise<ComciganTimetableData | null> => ipcRenderer.invoke('comcigan:fetch', force === true),
  comciganGetCached: (): Promise<ComciganTimetableData | null> => ipcRenderer.invoke('comcigan:get-cached'),
  comciganClear: (): Promise<void> => ipcRenderer.invoke('comcigan:clear'),
  comciganSchoolGrid: (schoolCode: number, maxGrade: number, force?: boolean): Promise<ComciganSchoolGrid> =>
    ipcRenderer.invoke('comcigan:school-grid', schoolCode, maxGrade, force),
  onComciganUpdate: (callback: (data: ComciganTimetableData) => void) => {
    const listener = (_event: any, data: ComciganTimetableData) => callback(data);
    ipcRenderer.on('comcigan:updated', listener);
    return () => ipcRenderer.removeListener('comcigan:updated', listener);
  },
});

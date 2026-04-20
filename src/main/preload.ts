import { contextBridge, ipcRenderer } from 'electron';
import type { ComciganConfig, ComciganSchool, ComciganTimetableData } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  toggleAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:toggle-always-on-top', value),
  setOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  toggleClickThrough: (enabled: boolean) => ipcRenderer.invoke('window:toggle-click-through', enabled),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  setSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', width, height),
  setWidgetMode: (enabled: boolean) => ipcRenderer.invoke('window:set-widget-mode', enabled),
  getWidgetMode: () => ipcRenderer.invoke('window:get-widget-mode'),
  getBounds: () => ipcRenderer.invoke('window:get-bounds'),
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('window:set-bounds', bounds),
  onWidgetModeChanged: (callback: (enabled: boolean) => void) => {
    const listener = (_event: any, enabled: boolean) => callback(enabled);
    ipcRenderer.on('widget-mode-changed', listener);
    return () => ipcRenderer.removeListener('widget-mode-changed', listener);
  },
  setTrayBadge: (hasBadge: boolean) => ipcRenderer.invoke('tray:set-badge', hasBadge),

  // Auto-updater
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  onUpdaterEvent: (callback: (channel: string, data: any) => void) => {
    const channels = ['updater:checking', 'updater:available', 'updater:not-available', 'updater:progress', 'updater:downloaded', 'updater:error'];
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

  // Comcigan
  comciganSearch: (name: string): Promise<ComciganSchool[]> => ipcRenderer.invoke('comcigan:search', name),
  comciganConfigure: (config: ComciganConfig): Promise<void> => ipcRenderer.invoke('comcigan:configure', config),
  comciganGetConfig: (): Promise<ComciganConfig | null> => ipcRenderer.invoke('comcigan:get-config'),
  comciganFetch: (): Promise<ComciganTimetableData | null> => ipcRenderer.invoke('comcigan:fetch'),
  comciganGetCached: (): Promise<ComciganTimetableData | null> => ipcRenderer.invoke('comcigan:get-cached'),
  comciganClear: (): Promise<void> => ipcRenderer.invoke('comcigan:clear'),
  onComciganUpdate: (callback: (data: ComciganTimetableData) => void) => {
    const listener = (_event: any, data: ComciganTimetableData) => callback(data);
    ipcRenderer.on('comcigan:updated', listener);
    return () => ipcRenderer.removeListener('comcigan:updated', listener);
  },
});

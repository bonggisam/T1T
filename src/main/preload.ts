import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  toggleAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('window:toggle-always-on-top', value),
  setOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  toggleClickThrough: (enabled: boolean) => ipcRenderer.invoke('window:toggle-click-through', enabled),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  setSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', width, height),
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
    // Return cleanup function
    return () => {
      listeners.forEach(({ ch, listener }) => ipcRenderer.removeListener(ch, listener));
    };
  },
});

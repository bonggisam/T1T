import { useCallback } from 'react';

export function useElectron() {
  const isElectron = !!window.electronAPI;

  const minimize = useCallback(() => {
    window.electronAPI?.minimize();
  }, []);

  const close = useCallback(() => {
    window.electronAPI?.close();
  }, []);

  const toggleAlwaysOnTop = useCallback((value: boolean) => {
    window.electronAPI?.toggleAlwaysOnTop(value);
  }, []);

  const toggleClickThrough = useCallback((enabled: boolean) => {
    window.electronAPI?.toggleClickThrough(enabled);
  }, []);

  const setTrayBadge = useCallback((hasBadge: boolean) => {
    window.electronAPI?.setTrayBadge(hasBadge);
  }, []);

  return {
    isElectron,
    minimize,
    close,
    toggleAlwaysOnTop,
    toggleClickThrough,
    setTrayBadge,
  };
}

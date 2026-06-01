import { useEffect, useState } from 'react';

/**
 * 현재 활성 테마가 다크모드인지 추적.
 * `<html data-theme="dark">` 속성을 MutationObserver로 실시간 감지.
 */
export function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

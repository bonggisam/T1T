import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

// 글로벌 비동기 에러 — 콘솔 출력 + 토스트 (가능한 경우)
// 캘린더가 죽어도 앱 전체가 white screen이 되지 않도록 ErrorBoundary와 함께 방어.
function showGlobalErrorToast(message: string): void {
  // 동적 import — 초기 로딩 사이즈 영향 없음
  import('./components/common/Toast')
    .then(({ showToast }) => showToast(`⚠️ ${message}`, 'error'))
    .catch(() => {
      // Toast 모듈 자체 로드 실패 시 콘솔만
    });
}

window.addEventListener('error', (e) => {
  console.error('[Global Error]', e.error || e.message);
  const msg = e.error?.message || e.message || '알 수 없는 오류';
  // 노이즈 줄이기: ResizeObserver 등 무해한 에러 무시
  if (typeof msg === 'string' && /ResizeObserver|Non-Error/i.test(msg)) return;
  showGlobalErrorToast(`예기치 못한 오류: ${msg.slice(0, 100)}`);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise]', e.reason);
  const msg = e.reason?.message || String(e.reason || '알 수 없는 비동기 오류');
  if (typeof msg === 'string' && /aborted|cancelled/i.test(msg)) return;
  showGlobalErrorToast(`비동기 오류: ${msg.slice(0, 100)}`);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './styles/global.css';
import { applyDisplayPrefs } from './utils/displayPrefs';
import { applyCachedAppearance } from './store/appearanceStore';

// 첫 화면을 그리기 전에 마지막 테마와 이 PC의 화면 배율을 적용한다
applyCachedAppearance();
applyDisplayPrefs();

// 글로벌 비동기 에러 — 콘솔 출력 + 토스트 (가능한 경우)
// 캘린더가 죽어도 앱 전체가 white screen이 되지 않도록 ErrorBoundary와 함께 방어.
function showGlobalErrorToast(message: string): void {
  // 동적 import — 초기 로딩 사이즈 영향 없음
  import('./components/common/Toast')
    .then(({ showToast }) => showToast(`${message}`, 'error'))
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

// 투명 창이라 그림이 모두 지워지면 앱이 사라진 것처럼 보인다. 제목 줄이나 창에서 난 오류도 여기서 받는다
function renderFatal(error: Error) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, background: '#f7f8fb', color: '#1f2937', textAlign: 'center', borderRadius: 12 }}>
      <strong>화면을 표시할 수 없습니다</strong>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{error.message}</span>
      <button onClick={() => window.location.reload()} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#1f3a68', color: '#fff', cursor: 'pointer' }}>다시 불러오기</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={renderFatal}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

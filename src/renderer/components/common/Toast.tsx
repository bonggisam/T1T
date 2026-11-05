import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;
let addToastFn: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null;
/** 앱이 처음 뜨는 동안 온 알림. "업데이트 완료"가 사라지지 않게 모아 둔다. 로그아웃 뒤에는 모으지 않는다 */
const waiting: Array<Omit<ToastMessage, 'id'>> = [];
let shownOnce = false;

/** 어디서든 호출 가능한 전역 토스트 함수 */
export function showToast(text: string, type: ToastMessage['type'] = 'success') {
  if (addToastFn) addToastFn({ text, type });
  else if (!shownOnce && waiting.length < 5) waiting.push({ text, type });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const addToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-4), { ...msg, id }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(timer);
    }, msg.type === 'error' || msg.text.length > 30 ? 6000 : 2500);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    shownOnce = true;
    waiting.splice(0).forEach(addToast);
    return () => {
      addToastFn = null;
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            ...styles.toast,
            background: t.type === 'success' ? 'var(--toast-success)' : t.type === 'error' ? 'var(--toast-error)' : 'var(--toast-info)',
          }}
        >
          <span style={styles.icon}>
            {t.type === 'success' ? <CheckCircle size={16} strokeWidth={2.5} /> :
             t.type === 'error' ? <XCircle size={16} strokeWidth={2.5} /> :
             <Info size={16} strokeWidth={2.5} />}
          </span>
          <span style={styles.text}>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'max-content',
    maxWidth: 'calc(100vw - 24px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    zIndex: 9999,
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderRadius: 8,
    boxShadow: '0 4px 12px var(--scrim)',
    animation: 'slideUp 0.25s ease-out',
    pointerEvents: 'auto',
  },
  icon: {
    fontSize: 'var(--fs-control)',
    flexShrink: 0,
  },
  text: {
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    color: 'var(--on-accent)',
    // 좁은 창에서 긴 오류가 잘리지 않게 줄을 바꾼다
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
};

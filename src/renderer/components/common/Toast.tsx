import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;
let addToastFn: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null;

/** 어디서든 호출 가능한 전역 토스트 함수 */
export function showToast(text: string, type: ToastMessage['type'] = 'success') {
  addToastFn?.({ text, type });
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
    }, 2500);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
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
            background: t.type === 'success' ? '#2ECC71' : t.type === 'error' ? '#E74C3C' : '#3498DB',
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
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    animation: 'slideUp 0.25s ease-out',
    pointerEvents: 'auto',
  },
  icon: {
    fontSize: 13,
    flexShrink: 0,
  },
  text: {
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    whiteSpace: 'nowrap',
  },
};

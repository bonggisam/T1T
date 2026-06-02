import React, { useState, useRef, useEffect } from 'react';
import { BookMarked } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDarkMode } from '../../hooks/useDarkMode';
import type { School } from '@shared/types';

/**
 * 학교 도서관 도서검색 시스템(독서로 read365.edunet.net) 빠른 진입.
 * 양교 어느 쪽이든 한 클릭으로 외부 브라우저에서 열림.
 */
const LIBRARY_URLS: Record<School, { url: string; label: string; emoji: string }> = {
  taeseong_middle: {
    url: 'https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%83%9C%EC%84%B1%EC%A4%91%ED%95%99%EA%B5%90&provCode=J10&neisCode=J100000822',
    label: '태성중 도서관',
    emoji: '🏫',
  },
  taeseong_high: {
    url: 'https://read365.edunet.net/PureScreen/SchoolSearch?schoolName=%ED%83%9C%EC%84%B1%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90&provCode=J10&neisCode=J100000822',
    label: '태성고 도서관',
    emoji: '🎓',
  },
};

interface LibraryButtonProps {
  compact?: boolean;
}

export function LibraryButton({ compact }: LibraryButtonProps) {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isDark = useDarkMode();

  // 바깥 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  function openLibrary(school: School) {
    const target = LIBRARY_URLS[school];
    if (!target) return;
    window.electronAPI?.openExternal(target.url).then((res) => {
      if (!res?.ok) {
        console.warn('[Library] open failed:', res);
        import('./Toast').then(({ showToast }) => {
          showToast(`도서관 열기 실패: ${res?.reason || '알 수 없음'}`, 'error');
        });
      }
    });
    setOpen(false);
  }

  const size = compact ? 14 : 18;
  const iconColor = isDark ? '#FBBF24' : '#D97706'; // 따뜻한 골드/앰버 — 책 느낌
  const btnPadding = compact ? '4px 6px' : '6px 9px';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: open ? `${iconColor}22` : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: btnPadding,
          borderRadius: compact ? 6 : 8,
          color: iconColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: compact ? undefined : 32,
          height: compact ? undefined : 32,
          transition: 'all 0.15s',
        }}
        title="학교 도서관 도서검색"
        aria-label="도서관"
      >
        <BookMarked size={size} strokeWidth={2.2} />
      </button>

      {open && (
        <div style={styles.menu}>
          <div style={styles.menuTitle}>📚 도서관 도서검색</div>
          {/* 사용자 학교 우선 */}
          {(['taeseong_middle', 'taeseong_high'] as School[])
            .sort((a, b) => (a === user?.school ? -1 : b === user?.school ? 1 : 0))
            .map((sk) => {
              const info = LIBRARY_URLS[sk];
              return (
                <button
                  key={sk}
                  onClick={() => openLibrary(sk)}
                  style={{
                    ...styles.menuItem,
                    ...(sk === user?.school ? styles.menuItemActive : {}),
                  }}
                >
                  <span style={styles.menuEmoji}>{info.emoji}</span>
                  <span style={styles.menuLabel}>{info.label}</span>
                  {sk === user?.school && <span style={styles.menuMine}>내 학교</span>}
                </button>
              );
            })}
          <div style={styles.menuHint}>외부 브라우저에서 열립니다</div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    minWidth: 200,
    background: 'var(--bg-modal)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    padding: 6,
    zIndex: 200,
    backdropFilter: 'blur(20px)',
  },
  menuTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    padding: '4px 8px 6px',
    borderBottom: '1px solid var(--border-subtle)',
    marginBottom: 4,
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  menuItemActive: {
    background: 'var(--bg-hover)',
  },
  menuEmoji: { fontSize: 14 },
  menuLabel: { flex: 1 },
  menuMine: {
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--accent)',
    background: 'rgba(74,144,226,0.15)',
    padding: '1px 6px',
    borderRadius: 8,
  },
  menuHint: {
    fontSize: 10,
    color: 'var(--text-muted)',
    padding: '6px 8px 2px',
    textAlign: 'center',
  },
};

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CalendarEvent, PersonalEvent } from '@shared/types';

const CATEGORY_LABELS: Record<string, string> = {
  event: '행사',
  meeting: '회의',
  deadline: '마감일',
  notice: '공지',
  other: '기타',
};

interface SearchResult {
  type: 'shared' | 'personal';
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  category?: string;
  adminName?: string;
  color?: string;
}

interface SearchPanelProps {
  onClose: () => void;
}

export function SearchPanel({ onClose }: SearchPanelProps) {
  const { events, setSelectedDate, setView } = useCalendarStore();
  const { personalEvents, externalEvents } = usePersonalEventStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const allPersonal = useMemo(() => [...personalEvents, ...externalEvents], [personalEvents, externalEvents]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];

    const sharedResults: SearchResult[] = events
      .filter((e) =>
        e.title.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.adminName?.toLowerCase().includes(q) ||
        (CATEGORY_LABELS[e.category] || '').includes(q)
      )
      .map((e) => ({
        type: 'shared' as const,
        id: e.id,
        title: e.title,
        description: e.description || '',
        startDate: e.startDate instanceof Date ? e.startDate : new Date(e.startDate),
        endDate: e.endDate instanceof Date ? e.endDate : new Date(e.endDate),
        category: e.category,
        adminName: e.adminName,
        color: e.adminColor,
      }));

    const personalResults: SearchResult[] = allPersonal
      .filter((e) =>
        e.title.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q)
      )
      .map((e) => ({
        type: 'personal' as const,
        id: e.id,
        title: e.title,
        description: e.description || '',
        startDate: e.startDate instanceof Date ? e.startDate : new Date(e.startDate),
        endDate: e.endDate instanceof Date ? e.endDate : new Date(e.endDate),
        color: e.color,
      }));

    const all = [...sharedResults, ...personalResults];
    all.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    return all.slice(0, 50);
  }, [query, events, allPersonal]);

  function handleSelect(result: SearchResult) {
    setSelectedDate(result.startDate);
    setView('day');
    onClose();
  }

  function formatDateRange(start: Date, end: Date): string {
    const s = format(start, 'M/d(EEE) HH:mm', { locale: ko });
    const e = format(end, 'HH:mm', { locale: ko });
    return `${s} ~ ${e}`;
  }

  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q || !text) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(74,144,226,0.3)', color: 'inherit', padding: 0, borderRadius: 2 }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="glass-solid animate-slide-up" style={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div style={styles.header}>
          <div style={styles.searchBar}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="일정 제목, 내용, 작성자로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={styles.input}
            />
            {query && (
              <button onClick={() => setQuery('')} style={styles.clearBtn}>✕</button>
            )}
          </div>
          <button onClick={onClose} style={styles.closeBtn}>닫기</button>
        </div>

        {/* Results */}
        <div style={styles.results}>
          {query.trim().length === 0 && (
            <div style={styles.emptyState}>
              <span style={{ fontSize: 24 }}>🔍</span>
              <p>검색어를 입력하세요</p>
            </div>
          )}

          {query.trim().length > 0 && results.length === 0 && (
            <div style={styles.emptyState}>
              <span style={{ fontSize: 24 }}>📭</span>
              <p>검색 결과가 없습니다</p>
            </div>
          )}

          {results.map((r) => (
            <div
              key={`${r.type}-${r.id}`}
              onClick={() => handleSelect(r)}
              style={styles.resultItem}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <div style={styles.resultLeft}>
                <div
                  style={{
                    ...styles.typeBadge,
                    background: r.type === 'shared' ? 'rgba(74,144,226,0.15)' : 'rgba(46,204,113,0.15)',
                    color: r.type === 'shared' ? 'var(--accent)' : '#2ECC71',
                  }}
                >
                  {r.type === 'shared' ? '공유' : '개인'}
                </div>
                {r.category && (
                  <span style={styles.category}>{CATEGORY_LABELS[r.category] || r.category}</span>
                )}
              </div>
              <div style={styles.resultContent}>
                <div style={styles.resultTitle}>
                  {r.color && (
                    <span style={{ ...styles.colorDot, background: r.color }} />
                  )}
                  {highlightMatch(r.title, query.trim())}
                </div>
                {r.description && (
                  <div style={styles.resultDesc}>
                    {highlightMatch(r.description.slice(0, 80), query.trim())}
                    {r.description.length > 80 ? '...' : ''}
                  </div>
                )}
                <div style={styles.resultMeta}>
                  <span>{formatDateRange(r.startDate, r.endDate)}</span>
                  {r.adminName && <span> · {r.adminName}</span>}
                </div>
              </div>
            </div>
          ))}

          {results.length > 0 && (
            <div style={styles.resultCount}>
              {results.length}개 결과{results.length >= 50 ? ' (최대 50개 표시)' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 100,
    padding: '40px 16px 16px',
  },
  panel: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 12px 8px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  searchBar: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--bg-secondary)',
    borderRadius: 8,
    padding: '0 10px',
    border: '1px solid var(--border-color)',
  },
  searchIcon: {
    fontSize: 13,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    padding: '8px 0',
    fontSize: 13,
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: 12,
    padding: '2px 4px',
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  results: {
    flex: 1,
    overflow: 'auto',
    padding: '4px 0',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '32px 16px',
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  resultItem: {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-subtle)',
    transition: 'background 0.1s',
  },
  resultLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
    flexShrink: 0,
  },
  typeBadge: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
  category: {
    fontSize: 9,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  resultContent: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  resultDesc: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultMeta: {
    fontSize: 10,
    color: 'var(--text-muted)',
    marginTop: 3,
  },
  resultCount: {
    textAlign: 'center',
    fontSize: 10,
    color: 'var(--text-muted)',
    padding: '8px 0',
  },
};

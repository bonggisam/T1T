import React from 'react';
import type { SeriesScope } from '@shared/types';

interface SeriesScopeDialogProps {
  action: 'edit' | 'delete';
  /** 이 회차를 포함한 이후 회차 수 */
  followingCount: number;
  /** 전체 회차 수 */
  allCount: number;
  onChoose: (scope: SeriesScope) => void;
  onCancel: () => void;
}

/** 반복 일정을 고치거나 지울 때 어느 회차까지 적용할지 묻는다 */
export function SeriesScopeDialog({ action, followingCount, allCount, onChoose, onCancel }: SeriesScopeDialogProps) {
  const verb = action === 'edit' ? '수정' : '삭제';
  return (
    <div style={styles.overlay} onClick={(e) => { e.stopPropagation(); onCancel(); }} role="dialog" aria-modal="true" aria-label={`반복 일정 ${verb}`}>
      <div className="glass-solid" style={styles.box} onClick={(e) => e.stopPropagation()}>
        <p style={styles.title}>반복 일정을 어디까지 {verb}할까요?</p>
        <button autoFocus onClick={() => onChoose('this')} style={styles.option}>이 일정만</button>
        <button onClick={() => onChoose('following')} style={styles.option}>이 일정과 이후 일정 ({followingCount}회)</button>
        <button onClick={() => onChoose('all')} style={styles.option}>전체 ({allCount}회)</button>
        <button onClick={onCancel} style={styles.cancel}>취소</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(0,0,0,0.3)',
    zIndex: 110,
  },
  box: {
    width: '100%',
    maxWidth: 280,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 14,
  },
  title: {
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  option: {
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'left',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  cancel: {
    padding: '6px 10px',
    fontSize: 12,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
};

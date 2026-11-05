import React from 'react';
import { Ic } from './Ic';

/** 웹 화면을 열지 못했을 때. 안내가 없으면 빈 화면만 남아 왜 그런지 알 수 없다 */
export function WebFailNotice({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div role="alert" style={styles.bar}>
      <span style={styles.text}><Ic name="alert" />{label}을 열지 못했습니다. 인터넷 연결이나 학교망을 확인해 주세요.</span>
      <button type="button" onClick={onRetry} style={styles.retry}>다시 시도</button>
    </div>
  );
}

/** 페이지를 옮기다 끊긴 것(-3)이나 안쪽 틀의 실패는 화면 전체의 실패가 아니다 */
export function isPageLoadFailure(event: { isMainFrame?: boolean; errorCode?: number } | undefined): boolean {
  return !!event?.isMainFrame && event.errorCode !== -3;
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: '8px 10px',
    background: 'color-mix(in srgb, var(--danger) 12%, var(--bg-primary))',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  text: { flex: 1, minWidth: 180, fontSize: 'var(--fs-body)', color: 'var(--text-primary)' },
  retry: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

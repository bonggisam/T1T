import React from 'react';
import { Ic } from './Ic';

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: string;
}

interface Props {
  children: React.ReactNode;
  /** 특정 영역만 감싸고 fallback 표시 후 자동 복구 */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

/**
 * 렌더 중 발생하는 unhandled error를 잡아 흰 화면(전체 unmount)을 막는다.
 * 사용자에게 에러 메시지 + 복구 버튼을 표시.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] caught:', error, errorInfo);
    this.setState({ errorInfo: errorInfo.componentStack || '' });
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div style={styles.container}>
          <div style={styles.icon}><Ic name="alert" gap={false} /></div>
          <div style={styles.title}>화면을 표시할 수 없습니다</div>
          <div style={styles.message}>{this.state.error.message}</div>
          <button onClick={this.reset} style={styles.button}>다시 시도</button>
          <details style={styles.details}>
            <summary style={styles.summary}>기술 정보 (개발자용)</summary>
            <pre style={styles.pre}>{this.state.error.stack || this.state.error.message}</pre>
            {this.state.errorInfo && <pre style={styles.pre}>{this.state.errorInfo}</pre>}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  icon: { fontSize: 'var(--fs-hero)', marginBottom: 8 },
  title: { fontSize: 'var(--fs-subtitle)', fontWeight: 700, marginBottom: 4 },
  message: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
    marginBottom: 12,
    maxWidth: '90%',
    wordBreak: 'break-word',
  },
  button: {
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    border: 'none',
    padding: '6px 16px',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    borderRadius: 6,
    cursor: 'pointer',
  },
  details: {
    marginTop: 16,
    width: '100%',
    maxWidth: 400,
    fontSize: 'var(--fs-caption)',
  },
  summary: {
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: 'var(--fs-caption)',
  },
  pre: {
    background: 'var(--bg-secondary)',
    padding: 8,
    borderRadius: 4,
    overflow: 'auto',
    maxHeight: 200,
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-muted)',
    textAlign: 'left',
  },
};

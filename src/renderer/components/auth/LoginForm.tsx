import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Ic } from '../common/Ic';

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

export function LoginForm({ onSwitchToSignup }: LoginFormProps) {
  const { login, resetPassword, error, clearError, loading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
    } catch (err) {
      console.warn('[Login] Failed:', err);
      // authStore에서 error state 관리하므로 여기선 로그만
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      console.warn('[Login] Password reset failed:', err);
    }
  }

  if (resetMode) {
    return (
      <div className="animate-fade-in" style={styles.container}>
        <h2 style={styles.title}>비밀번호 재설정</h2>
        {resetSent ? (
          <div style={styles.successMsg}>
            <p>재설정 링크가 이메일로 전송되었습니다.</p>
            <button onClick={() => { setResetMode(false); setResetSent(false); }} style={styles.linkBtn}>
              로그인으로 돌아가기
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} style={styles.form}>
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              required
            />
            <button type="submit" style={styles.submitBtn}>재설정 링크 보내기</button>
            <button type="button" onClick={() => setResetMode(false)} style={styles.linkBtn}>
              로그인으로 돌아가기
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <h2 style={styles.title}><Ic name="calendar" />T1T</h2>
      <p style={styles.subtitle}>학교 일정 공유 시스템</p>

      <form onSubmit={handleLogin} style={styles.form}>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.submitBtn}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <div style={styles.links}>
        <button onClick={() => setResetMode(true)} style={styles.linkBtn}>비밀번호 찾기</button>
        <span style={styles.divider}>|</span>
        <button onClick={onSwitchToSignup} style={styles.linkBtn}>회원가입</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: 300,
    textAlign: 'center',
  },
  title: {
    fontSize: 'var(--fs-display)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-secondary)',
    marginBottom: 24,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 'var(--fs-lead)',
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  submitBtn: {
    width: '100%',
    padding: '10px',
    fontSize: 'var(--fs-lead)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    marginTop: 4,
  },
  error: {
    fontSize: 'var(--fs-body)',
    color: 'var(--danger)',
    textAlign: 'left',
  },
  links: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--fs-body)',
    color: 'var(--accent)',
  },
  divider: {
    color: 'var(--text-muted)',
    fontSize: 'var(--fs-body)',
  },
  successMsg: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontSize: 'var(--fs-control)',
    color: 'var(--text-secondary)',
  },
};

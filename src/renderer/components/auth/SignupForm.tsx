import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const { signup, error, clearError, loading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState(false);

  function validatePassword(pw: string): string | null {
    if (pw.length < 8) return '비밀번호는 최소 8자 이상이어야 합니다.';
    if (!/[a-zA-Z]/.test(pw)) return '영문을 포함해야 합니다.';
    if (!/[0-9]/.test(pw)) return '숫자를 포함해야 합니다.';
    if (!/[!@#$%^&*()_+\-=\[\]{};':"|,.<>\/?]/.test(pw)) return '특수문자를 포함해야 합니다.';
    return null;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setLocalError('');

    if (password !== confirmPassword) {
      setLocalError('비밀번호가 일치하지 않습니다.');
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setLocalError(pwError);
      return;
    }

    await signup(email, password, name);
    // If user is now active (admin), App.tsx will show calendar directly.
    // If pending (teacher), show success message.
    const currentUser = useAuthStore.getState().user;
    if (!currentUser || currentUser.status === 'pending') {
      setSuccess(true);
    }
    // If active → App.tsx re-renders to calendar automatically
  }

  if (success) {
    return (
      <div className="animate-fade-in" style={styles.container}>
        <h2 style={styles.title}>회원가입 완료</h2>
        <div style={styles.successMsg}>
          <p>이메일 인증 메일이 발송되었습니다.</p>
          <p>이메일 인증 완료 후 관리자 승인을 기다려주세요.</p>
        </div>
        <button onClick={onSwitchToLogin} style={styles.submitBtn}>로그인으로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <h2 style={styles.title}>회원가입</h2>
      <p style={styles.subtitle}>교사 계정 등록</p>

      <form onSubmit={handleSignup} style={styles.form}>
        <input
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={styles.input}
          required
        />
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
          placeholder="비밀번호 (8자 이상, 영문+숫자+특수문자)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          required
        />
        <input
          type="password"
          placeholder="비밀번호 확인"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={styles.input}
          required
        />
        {(localError || error) && <p style={styles.error}>{localError || error}</p>}
        <button type="submit" disabled={loading} style={styles.submitBtn}>
          {loading ? '가입 중...' : '가입 요청'}
        </button>
      </form>

      <div style={styles.links}>
        <span style={styles.linkText}>이미 계정이 있으신가요?</span>
        <button onClick={onSwitchToLogin} style={styles.linkBtn}>로그인</button>
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
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    marginBottom: 20,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid var(--border-color)',
    borderRadius: 10,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  submitBtn: {
    width: '100%',
    padding: '10px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    marginTop: 4,
  },
  error: {
    fontSize: 12,
    color: 'var(--danger)',
    textAlign: 'left',
  },
  links: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  linkText: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--accent)',
    fontWeight: 600,
  },
  successMsg: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.8,
    margin: '16px 0',
  },
};

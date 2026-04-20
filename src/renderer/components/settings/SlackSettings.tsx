import React, { useState } from 'react';
import { getSlackWebhook, setSlackWebhook, clearSlackWebhook, sendSlackNotification } from '../../utils/slackNotify';
import { showToast } from '../common/Toast';

export function SlackSettings() {
  const [url, setUrl] = useState(getSlackWebhook());
  const [testing, setTesting] = useState(false);

  function handleSave() {
    if (url.trim() && !url.startsWith('https://hooks.slack.com/')) {
      showToast('올바른 Slack Webhook URL이 아닙니다', 'error');
      return;
    }
    if (url.trim()) {
      setSlackWebhook(url.trim());
      showToast('슬랙 웹훅 저장됨');
    } else {
      clearSlackWebhook();
      showToast('슬랙 연동 해제됨');
    }
  }

  async function handleTest() {
    const trimmed = url.trim();
    if (!trimmed) { showToast('URL을 먼저 입력하세요', 'error'); return; }
    if (!trimmed.startsWith('https://hooks.slack.com/')) {
      showToast('Slack Webhook URL이 아닙니다', 'error');
      return;
    }
    setTesting(true);
    // 테스트용으로만 임시 저장 후 원래 값 복원 (저장은 handleSave에서만)
    const prev = getSlackWebhook();
    setSlackWebhook(trimmed);
    const ok = await sendSlackNotification('👋 ToneT 연결 테스트입니다!');
    // 저장 안 된 상태였다면 되돌리기
    if (!prev) clearSlackWebhook();
    else setSlackWebhook(prev);
    setTesting(false);
    if (ok) showToast('테스트 메시지 전송 완료 — 저장을 누르세요');
    else showToast('전송 실패 — URL을 확인하세요', 'error');
  }

  return (
    <div style={styles.container}>
      <p style={styles.description}>
        일정 등록 시 슬랙 채널로 알림을 보냅니다.
      </p>
      <input
        type="url"
        placeholder="https://hooks.slack.com/services/..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={styles.input}
      />
      <div style={styles.actions}>
        <button onClick={handleTest} disabled={testing} style={styles.testBtn}>
          {testing ? '전송 중...' : '🧪 테스트'}
        </button>
        <button onClick={handleSave} style={styles.saveBtn}>저장</button>
      </div>
      <p style={styles.hint}>
        💡 Slack 워크스페이스 → Apps → Incoming Webhooks에서 생성
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 6 },
  description: { fontSize: 11, color: 'var(--text-muted)', margin: 0 },
  input: {
    padding: '6px 10px', fontSize: 11,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  actions: { display: 'flex', gap: 6 },
  testBtn: {
    padding: '4px 10px', fontSize: 11, fontWeight: 500,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  saveBtn: {
    flex: 1, padding: '4px 10px', fontSize: 11, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: '#fff', cursor: 'pointer',
  },
  hint: { fontSize: 10, color: 'var(--text-muted)', margin: 0 },
};

import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { CalendarEvent, EventResponse, ResponseStatus } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { useUsersStore } from '../../store/usersStore';
import { clearMyResponse, setMyResponse, subscribeResponses } from '../../utils/eventResponses';
import { showToast } from '../common/Toast';

const LABELS: Record<ResponseStatus, string> = { attend: '참석', absent: '불참', confirm: '확인' };
const COLORS: Record<ResponseStatus, string> = {
  attend: 'var(--success)',
  absent: 'var(--danger)',
  confirm: 'var(--accent)',
};

/**
 * 일정 응답. 누르면 바로 저장되고 같은 단추를 다시 누르면 취소한다.
 * 사유는 받지 않는다. 불참 이유는 개인 사정일 수 있다.
 */
export function EventResponses({ event }: { event: CalendarEvent }) {
  const user = useAuthStore((s) => s.user);
  const users = useUsersStore((s) => s.users);
  const [responses, setResponses] = useState<EventResponse[]>([]);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const type = event.responseType;

  useEffect(() => {
    if (!type) return undefined;
    setFailed(false);
    return subscribeResponses(event.id, setResponses, (err) => {
      console.warn('[EventResponses] subscription error:', err);
      setFailed(true);
    });
  }, [event.id, type]);

  const statuses: ResponseStatus[] = type === 'attendance' ? ['attend', 'absent'] : ['confirm'];
  const mine = responses.find((r) => r.userId === user?.id)?.status ?? null;
  const canManage = user?.id === event.createdBy || user?.role === 'admin' || user?.role === 'super_admin';

  // 아직 응답하지 않은 사람. 교사 명단을 읽을 수 있는 사람(지금은 관리자)만 계산된다.
  const notResponded = useMemo(() => {
    if (!canManage || users.length === 0) return null;
    const answered = new Set(responses.map((r) => r.userId));
    return users
      .filter((u) => (event.school === 'all' || u.school === event.school) && !answered.has(u.id))
      .map((u) => u.name)
      .sort((a, b) => a.localeCompare(b, 'ko'));
  }, [canManage, users, responses, event.school]);

  if (!type) return null;

  async function answer(status: ResponseStatus) {
    if (!user || saving) return;
    setSaving(true);
    try {
      if (mine === status) await clearMyResponse(event.id, user.id);
      else await setMyResponse(event.id, user.id, user.name, status);
    } catch (err) {
      console.error('[EventResponses] save failed:', err);
      showToast('응답을 저장하지 못했습니다', 'error');
    }
    setSaving(false);
  }

  const groups = statuses.map((status) => ({
    status,
    names: responses.filter((r) => r.status === status).map((r) => r.name).sort((a, b) => a.localeCompare(b, 'ko')),
  }));
  const summary = groups.map((g) => `${LABELS[g.status]} ${g.names.length}`).join(' · ');

  return (
    <div style={styles.section}>
      <div style={styles.header}>
        <span style={styles.label}>응답</span>
        <div style={styles.buttons}>
          {statuses.map((status) => {
            const active = mine === status;
            return (
              <button
                key={status}
                onClick={() => answer(status)}
                disabled={saving || failed}
                aria-pressed={active}
                title={active ? '다시 누르면 취소합니다' : undefined}
                style={{
                  ...styles.button,
                  ...(active ? { background: COLORS[status], borderColor: 'transparent', color: 'var(--on-accent)' } : {}),
                }}
              >
                {status === 'absent' ? <X size={12} strokeWidth={2.6} /> : <Check size={12} strokeWidth={2.6} />}
                {LABELS[status]}
              </button>
            );
          })}
        </div>
      </div>

      {failed ? (
        <p style={styles.note}>응답을 불러오지 못했습니다</p>
      ) : (
        <>
          <button onClick={() => setOpen((v) => !v)} style={styles.summary} aria-expanded={open}>
            <span>
              {summary}
              {notResponded && ` · 미응답 ${notResponded.length}`}
            </span>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {open && (
            <div style={styles.list}>
              {groups.map((g) => (
                <div key={g.status} style={styles.line}>
                  <strong style={{ ...styles.lineLabel, color: COLORS[g.status] }}>{LABELS[g.status]}</strong>
                  <span>{g.names.length > 0 ? g.names.join(', ') : '없음'}</span>
                </div>
              ))}
              {notResponded && notResponded.length > 0 && (
                <div style={styles.line}>
                  <strong style={styles.lineLabel}>미응답</strong>
                  <span>{notResponded.join(', ')}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10,
    padding: '8px 10px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  buttons: {
    display: 'flex',
    gap: 4,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '4px 12px',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 0,
    fontSize: 'var(--fs-label)',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    fontSize: 'var(--fs-label)',
    color: 'var(--text-primary)',
  },
  line: {
    display: 'flex',
    gap: 6,
  },
  lineLabel: {
    flexShrink: 0,
    width: 34,
    color: 'var(--text-muted)',
  },
  note: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
};

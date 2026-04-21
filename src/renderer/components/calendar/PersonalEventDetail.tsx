import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useAuthStore } from '../../store/authStore';
import { showToast } from '../common/Toast';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { PERSONAL_SUFFIX } from '../../utils/calendarHelpers';
import type { PersonalEvent } from '@shared/types';

interface PersonalEventDetailProps {
  event: PersonalEvent;
  onClose: () => void;
}

export function PersonalEventDetail({ event, onClose }: PersonalEventDetailProps) {
  const { user } = useAuthStore();
  const { updatePersonalEvent, deletePersonalEvent } = usePersonalEventStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [startDate, setStartDate] = useState(formatDTL(event.startDate));
  const [endDate, setEndDate] = useState(formatDTL(event.endDate));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEscapeKey(onClose);

  function formatDTL(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const canEdit = event.source === 'local';

  async function handleSave() {
    if (!user) return;
    const trimTitle = title.trim().slice(0, 100);
    if (!trimTitle) { showToast('제목을 입력하세요', 'error'); return; }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) { showToast('날짜가 올바르지 않습니다', 'error'); return; }
    if (end < start) { showToast('종료 시간이 시작 시간보다 앞설 수 없습니다', 'error'); return; }

    setSaving(true);
    try {
      await updatePersonalEvent(user.id, event.id, {
        title: trimTitle,
        description: description.trim().slice(0, 1000),
        startDate: start,
        endDate: end,
      });
      showToast('수정되었습니다');
      setEditing(false);
    } catch (err) {
      console.error('[PersonalEventDetail] update failed:', err);
      showToast('수정 실패', 'error');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!user) return;
    if (!window.confirm(`개인 일정 "${event.title}"을(를) 삭제하시겠습니까?`)) return;
    setDeleting(true);
    try {
      await deletePersonalEvent(user.id, event.id);
      showToast('삭제되었습니다');
      onClose();
    } catch (err) {
      console.error('[PersonalEventDetail] delete failed:', err);
      showToast('삭제 실패', 'error');
    }
    setDeleting(false);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="glass-solid animate-slide-up" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            {event.title} <span style={styles.suffix}>{PERSONAL_SUFFIX}</span>
          </h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {event.source !== 'local' && (
          <div style={styles.externalNote}>
            🔗 외부 캘린더({event.source}) 일정 — 수정·삭제는 원본 캘린더에서 해주세요.
          </div>
        )}

        {editing ? (
          <div style={styles.form}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목"
              style={styles.input}
              autoFocus
            />
            <div style={styles.row}>
              <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.dateInput} />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>~</span>
              <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.dateInput} />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="상세 설명 (선택)"
              style={styles.textarea}
              rows={3}
            />
            <div style={styles.actions}>
              <button onClick={() => setEditing(false)} style={styles.cancelBtn}>취소</button>
              <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.detail}>
            <div style={styles.row}>
              <span style={styles.label}>시작</span>
              <span style={styles.value}>{format(event.startDate, 'yyyy-MM-dd HH:mm', { locale: ko })}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.label}>종료</span>
              <span style={styles.value}>{format(event.endDate, 'yyyy-MM-dd HH:mm', { locale: ko })}</span>
            </div>
            {event.description && (
              <div style={{ ...styles.row, alignItems: 'flex-start' }}>
                <span style={styles.label}>설명</span>
                <p style={styles.value}>{event.description}</p>
              </div>
            )}
            {canEdit && (
              <div style={styles.actions}>
                <button onClick={() => setEditing(true)} style={styles.editBtn}>✏️ 수정</button>
                <button onClick={handleDelete} disabled={deleting} style={styles.deleteBtn}>
                  {deleting ? '삭제 중...' : '🗑️ 삭제'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(0,0,0,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 16,
  },
  modal: { width: '100%', maxWidth: 380, maxHeight: '90%', overflow: 'auto', padding: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  suffix: { fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginLeft: 4 },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)' },
  externalNote: {
    fontSize: 11, color: '#F59E0B',
    padding: '6px 10px', borderRadius: 6,
    background: 'rgba(245,158,11,0.1)',
    marginBottom: 10,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  detail: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  label: { fontSize: 11, color: 'var(--text-muted)', minWidth: 40, fontWeight: 600 },
  value: { fontSize: 12, color: 'var(--text-primary)', flex: 1, margin: 0, lineHeight: 1.5 },
  input: {
    padding: '8px 12px', fontSize: 13,
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  dateInput: {
    flex: 1, padding: '6px 8px', fontSize: 11,
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  textarea: {
    padding: '8px 12px', fontSize: 12,
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
    resize: 'vertical', fontFamily: 'inherit',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 },
  cancelBtn: {
    padding: '6px 14px', fontSize: 12,
    border: '1px solid var(--border-color)', borderRadius: 6,
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  saveBtn: {
    padding: '6px 16px', fontSize: 12, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: '#fff', cursor: 'pointer',
  },
  editBtn: {
    padding: '6px 12px', fontSize: 12, fontWeight: 500,
    border: '1px solid var(--accent)', borderRadius: 6,
    background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
  },
  deleteBtn: {
    padding: '6px 12px', fontSize: 12, fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: '#EF4444', color: '#fff', cursor: 'pointer',
  },
};

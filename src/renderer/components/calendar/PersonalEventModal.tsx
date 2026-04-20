import React, { useState, useEffect } from 'react';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { showToast } from '../common/Toast';

const COLOR_OPTIONS = [
  '#2ECC71', '#3498DB', '#9B59B6', '#E67E22',
  '#E74C3C', '#1ABC9C', '#F39C12', '#34495E',
];

interface PersonalEventModalProps {
  onClose: () => void;
}

export function PersonalEventModal({ onClose }: PersonalEventModalProps) {
  const { addPersonalEvent } = usePersonalEventStore();
  const { user } = useAuthStore();
  const { selectedDate } = useCalendarStore();

  const clickedHour = selectedDate.getHours();
  const startHour = clickedHour > 0 ? clickedHour : 9;
  const defaultStart = new Date(selectedDate);
  defaultStart.setHours(startHour, 0, 0, 0);
  const defaultEnd = new Date(selectedDate);
  defaultEnd.setHours(startHour + 1, 0, 0, 0);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(formatDateTimeLocal(defaultStart));
  const [endDate, setEndDate] = useState(formatDateTimeLocal(defaultEnd));
  const [color, setColor] = useState('#2ECC71');
  const [saving, setSaving] = useState(false);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function formatDateTimeLocal(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimTitle = title.trim().slice(0, 100);
    const trimDesc = description.trim().slice(0, 1000);
    if (!trimTitle || !user) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (end < start) { showToast('종료 시간이 시작 시간보다 앞설 수 없습니다.', 'error'); return; }

    setSaving(true);
    try {
      await addPersonalEvent(user.id, {
        title: trimTitle,
        description: trimDesc,
        startDate: start,
        endDate: end,
        source: 'local',
        externalId: null,
        checklist: [],
        color,
      });
      showToast('개인 일정이 추가되었습니다');
      onClose();
    } catch (err) {
      console.error('Failed to add personal event:', err);
    }
    setSaving(false);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="glass-solid animate-slide-up" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>개인 일정 추가</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="일정 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            autoFocus
          />

          <div style={styles.row}>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.dateInput} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>~</span>
            <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.dateInput} />
          </div>

          <textarea
            placeholder="메모 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={styles.textarea}
            rows={2}
          />

          <div>
            <span style={styles.sectionLabel}>색상</span>
            <div style={styles.colorRow}>
              {COLOR_OPTIONS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    ...styles.colorSwatch,
                    background: c,
                    outline: color === c ? '2px solid var(--text-primary)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>취소</button>
            <button type="submit" disabled={!title.trim() || saving} style={styles.submitBtn}>
              {saving ? '저장 중...' : '추가'}
            </button>
          </div>
        </form>
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
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    overflow: 'auto',
    padding: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--text-muted)',
    padding: '2px 6px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    padding: '6px 8px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    display: 'block',
  },
  colorRow: {
    display: 'flex',
    gap: 6,
    marginTop: 4,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    cursor: 'pointer',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    padding: '6px 16px',
    fontSize: 12,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '6px 20px',
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
  },
};

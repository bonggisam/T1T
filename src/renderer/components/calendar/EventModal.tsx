import React, { useState, useEffect } from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import type { EventCategory, ChecklistItem } from '@shared/types';
import { showToast } from '../common/Toast';

const CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: 'event', label: '행사' },
  { key: 'meeting', label: '회의' },
  { key: 'deadline', label: '마감일' },
  { key: 'notice', label: '공지' },
  { key: 'other', label: '기타' },
];

export function EventModal() {
  const { addEvent, setShowEventModal, selectedDate } = useCalendarStore();
  const { user } = useAuthStore();

  // selectedDate에 시간 정보가 있으면 사용, 없으면(0시=월뷰) 9시 기본
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
  const [allDay, setAllDay] = useState(false);
  const [category, setCategory] = useState<EventCategory>('event');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [saving, setSaving] = useState(false);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowEventModal(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function formatDateTimeLocal(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function addCheckItem() {
    if (!newCheckItem.trim()) return;
    setChecklist([...checklist, {
      id: Date.now().toString(),
      text: newCheckItem.trim(),
      checked: false,
      order: checklist.length,
    }]);
    setNewCheckItem('');
  }

  function removeCheckItem(id: string) {
    setChecklist(checklist.filter((item) => item.id !== id));
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
      await addEvent({
        title: trimTitle,
        description: trimDesc,
        startDate: start,
        endDate: end,
        allDay,
        category,
        createdBy: user.id,
        adminName: user.name,
        adminColor: user.profileColor || '#4A90E2',
        repeat: null,
        attachments: [],
        checklist,
        readBy: {},
      });
      showToast('일정이 등록되었습니다');
      setShowEventModal(false);
    } catch (err) {
      console.error('Failed to add event:', err);
    }
    setSaving(false);
  }

  return (
    <div style={styles.overlay} onClick={() => setShowEventModal(false)}>
      <div className="glass-solid animate-slide-up" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>새 일정 등록</h3>
          <button onClick={() => setShowEventModal(false)} style={styles.closeBtn}>✕</button>
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
            <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} style={styles.select}>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span style={{ fontSize: 12 }}>종일</span>
            </label>
          </div>

          <div style={styles.row}>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.dateInput} />
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>~</span>
            <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.dateInput} />
          </div>

          <textarea
            placeholder="상세 설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={styles.textarea}
            rows={3}
          />

          {/* Checklist */}
          <div style={styles.checklistSection}>
            <span style={styles.sectionLabel}>체크리스트</span>
            {checklist.map((item) => (
              <div key={item.id} style={styles.checkItem}>
                <span style={styles.checkText}>{item.text}</span>
                <button type="button" onClick={() => removeCheckItem(item.id)} style={styles.removeBtn}>✕</button>
              </div>
            ))}
            <div style={styles.addCheckRow}>
              <input
                type="text"
                placeholder="항목 추가..."
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCheckItem())}
                style={styles.checkInput}
              />
              <button type="button" onClick={addCheckItem} style={styles.addCheckBtn}>+</button>
            </div>
          </div>

          <div style={styles.actions}>
            <button type="button" onClick={() => setShowEventModal(false)} style={styles.cancelBtn}>취소</button>
            <button type="submit" disabled={!title.trim() || saving} style={styles.submitBtn}>
              {saving ? '저장 중...' : '등록'}
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
    maxWidth: 380,
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
    fontSize: 16,
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
  select: {
    flex: 1,
    padding: '6px 10px',
    fontSize: 12,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
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
  checklistSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    background: 'var(--bg-secondary)',
    borderRadius: 6,
  },
  checkText: {
    fontSize: 12,
    color: 'var(--text-primary)',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--danger)',
    fontSize: 11,
    padding: '0 4px',
  },
  addCheckRow: {
    display: 'flex',
    gap: 4,
  },
  checkInput: {
    flex: 1,
    padding: '4px 8px',
    fontSize: 12,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  addCheckBtn: {
    padding: '4px 10px',
    fontSize: 14,
    fontWeight: 700,
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: '#fff',
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

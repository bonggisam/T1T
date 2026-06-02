import React, { useState, useEffect } from 'react';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { showToast } from '../common/Toast';
import { useEscapeKey } from '../../hooks/useEscapeKey';

// 개인 일정용 색상 — 학교 색(태성중 emerald, 태성고 violet)과 겹치지 않는 톤만 포함
const COLOR_OPTIONS = [
  '#3498DB', // 파랑
  '#1ABC9C', // 청록
  '#E67E22', // 주황
  '#E74C3C', // 빨강
  '#F39C12', // 노랑
  '#9B59B6', // 자주
  '#34495E', // 짙은 회색
  '#EC4899', // 핑크
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
  // 기본 색 = 사용자의 프로필 색 (없으면 파랑 — 학교 색과 안 겹침)
  const [color, setColor] = useState(user?.profileColor || '#4A90E2');
  const [saving, setSaving] = useState(false);

  // ESC 키로 닫기
  useEscapeKey(onClose);

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
        allDay: false, // 개인 일정은 기본 시간 지정
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
    <div
      style={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="개인 일정 추가"
    >
      <div
        className="glass-solid animate-slide-up"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const modal = e.currentTarget as HTMLElement;
          const focusable = Array.from(
            modal.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null);
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement as HTMLElement | null;
          if (!active || !modal.contains(active)) {
            e.preventDefault();
            first.focus();
            return;
          }
          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div style={styles.header}>
          <h3 style={styles.title}>개인 일정 추가</h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label="닫기">✕</button>
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

          {/* 빠른 시작 시간 선택 (클릭) */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              빠른 시작 시간 선택
            </div>
            <div style={styles.hourGrid}>
              {Array.from({ length: 14 }, (_, i) => i + 7).map((hour) => {
                const isActive = new Date(startDate).getHours() === hour;
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => {
                      const s = new Date(startDate);
                      s.setHours(hour, 0, 0, 0);
                      const e = new Date(endDate);
                      if (e <= s) e.setTime(s.getTime() + 60 * 60 * 1000);
                      setStartDate(formatDateTimeLocal(s));
                      setEndDate(formatDateTimeLocal(e));
                    }}
                    style={{
                      ...styles.hourBtn,
                      ...(isActive ? styles.hourBtnActive : {}),
                    }}
                  >
                    {hour.toString().padStart(2, '0')}:00
                  </button>
                );
              })}
            </div>
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
              {/* 사용자의 프로필 색을 첫 번째 옵션으로 (이미 COLOR_OPTIONS에 있으면 중복 제외) */}
              {[user?.profileColor, ...COLOR_OPTIONS.filter((c) => c !== user?.profileColor)]
                .filter(Boolean)
                .map((c) => (
                  <div
                    key={c as string}
                    onClick={() => setColor(c as string)}
                    style={{
                      ...styles.colorSwatch,
                      background: c as string,
                      outline: color === c ? '2px solid var(--text-primary)' : 'none',
                      outlineOffset: 2,
                    }}
                    title={c === user?.profileColor ? '내 프로필 색' : ''}
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
    colorScheme: 'light dark',
  },
  hourGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
  },
  hourBtn: {
    padding: '4px 0',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  hourBtnActive: {
    background: 'var(--accent)',
    color: '#fff',
    border: '1px solid transparent',
    fontWeight: 700,
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

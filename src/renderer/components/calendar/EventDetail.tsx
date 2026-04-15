import React, { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import type { ChecklistItem } from '@shared/types';

const CATEGORY_LABELS: Record<string, string> = {
  event: '행사',
  meeting: '회의',
  deadline: '마감일',
  notice: '공지',
  other: '기타',
};

export function EventDetail() {
  const { selectedEvent, setShowEventDetail, setSelectedEvent, deleteEvent, updateChecklist, setShowEventModal } = useCalendarStore();
  const { user } = useAuthStore();
  const [deleting, setDeleting] = useState(false);

  if (!selectedEvent) return null;

  const isCreator = user?.id === selectedEvent.createdBy;
  const canEdit = isCreator;

  const checkedCount = selectedEvent.checklist.filter((i) => i.checked).length;
  const totalCount = selectedEvent.checklist.length;
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  async function handleToggleCheck(item: ChecklistItem) {
    if (!canEdit) return;
    const updated = selectedEvent!.checklist.map((c) =>
      c.id === item.id ? { ...c, checked: !c.checked } : c
    );
    await updateChecklist(selectedEvent!.id, updated);
    setSelectedEvent({ ...selectedEvent!, checklist: updated });
  }

  async function handleDelete() {
    if (!canEdit) return;
    setDeleting(true);
    try {
      await deleteEvent(selectedEvent!.id);
      setShowEventDetail(false);
      setSelectedEvent(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setDeleting(false);
  }

  function close() {
    setShowEventDetail(false);
    setSelectedEvent(null);
  }

  return (
    <div style={styles.overlay} onClick={close}>
      <div className="glass-solid animate-slide-up" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={{ ...styles.colorDot, background: selectedEvent.adminColor }} />
            <span style={styles.category}>{CATEGORY_LABELS[selectedEvent.category] || selectedEvent.category}</span>
          </div>
          <button onClick={close} style={styles.closeBtn}>✕</button>
        </div>

        {/* Title & creator */}
        <h3 style={styles.title}>{selectedEvent.title}</h3>
        <p style={styles.creator}>등록자: {selectedEvent.adminName}</p>

        {/* Date/time */}
        <div style={styles.info}>
          <span>📅 {format(new Date(selectedEvent.startDate), 'yyyy.MM.dd (EEE)', { locale: ko })}</span>
          {!selectedEvent.allDay && (
            <span>
              🕐 {format(new Date(selectedEvent.startDate), 'HH:mm')} ~ {format(new Date(selectedEvent.endDate), 'HH:mm')}
            </span>
          )}
          {selectedEvent.allDay && <span>종일</span>}
        </div>

        {/* Description */}
        {selectedEvent.description && (
          <div style={styles.descSection}>
            <p style={styles.description}>{selectedEvent.description}</p>
          </div>
        )}

        {/* Checklist */}
        {selectedEvent.checklist.length > 0 && (
          <div style={styles.checklistSection}>
            <div style={styles.checklistHeader}>
              <span style={styles.sectionLabel}>☑️ 체크리스트</span>
              <span style={styles.progressText}>{checkedCount}/{totalCount}</span>
            </div>
            {/* Progress bar */}
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            </div>
            {selectedEvent.checklist
              .sort((a, b) => a.order - b.order)
              .map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleToggleCheck(item)}
                  style={{
                    ...styles.checkItem,
                    cursor: canEdit ? 'pointer' : 'default',
                    opacity: item.checked ? 0.6 : 1,
                  }}
                >
                  <span style={styles.checkIcon}>{item.checked ? '✅' : '⬜'}</span>
                  <span style={{
                    ...styles.checkText,
                    textDecoration: item.checked ? 'line-through' : 'none',
                  }}>{item.text}</span>
                </div>
              ))}
            {progress === 100 && (
              <div style={styles.completeMsg}>✅ 모든 항목 완료!</div>
            )}
          </div>
        )}

        {/* Actions */}
        {canEdit && (
          <div style={styles.actions}>
            <button onClick={handleDelete} disabled={deleting} style={styles.deleteBtn}>
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        )}
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
    marginBottom: 8,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  category: {
    fontSize: 11,
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    color: 'var(--text-muted)',
    padding: '2px 6px',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  creator: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginBottom: 10,
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary)',
    marginBottom: 10,
    padding: '8px 10px',
    background: 'var(--bg-secondary)',
    borderRadius: 8,
  },
  descSection: {
    marginBottom: 10,
  },
  description: {
    fontSize: 13,
    color: 'var(--text-primary)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  checklistSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10,
  },
  checklistHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  progressText: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  progressBar: {
    height: 6,
    background: 'var(--bg-secondary)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--success)',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 8px',
    borderRadius: 6,
    transition: 'background 0.12s',
  },
  checkIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  checkText: {
    fontSize: 12,
    color: 'var(--text-primary)',
  },
  completeMsg: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--success)',
    fontWeight: 600,
    padding: 4,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  deleteBtn: {
    padding: '6px 16px',
    fontSize: 12,
    border: '1px solid var(--danger)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--danger)',
    cursor: 'pointer',
  },
};

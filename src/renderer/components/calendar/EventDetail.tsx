import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import type { ChecklistItem, EventComment, EventCategory } from '@shared/types';
import { showToast } from '../common/Toast';
import { MentionInput, renderMentions, extractMentions } from '../common/MentionInput';
import { useUsersStore } from '../../store/usersStore';
import { notifyUser } from '../../utils/notifications';

const CATEGORY_LABELS: Record<string, string> = {
  event: '행사',
  meeting: '회의',
  deadline: '마감일',
  notice: '공지',
  other: '기타',
};

const CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: 'event', label: '행사' },
  { key: 'meeting', label: '회의' },
  { key: 'deadline', label: '마감일' },
  { key: 'notice', label: '공지' },
  { key: 'other', label: '기타' },
];

export function EventDetail() {
  const { selectedEvent, setShowEventDetail, setSelectedEvent, deleteEvent, updateChecklist, markAsRead, updateEvent } = useCalendarStore();
  const { user } = useAuthStore();
  const [deleting, setDeleting] = useState(false);
  const [showReadList, setShowReadList] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editCategory, setEditCategory] = useState<EventCategory>('event');
  const [editAllDay, setEditAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<EventComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // 열 때 자동 읽음 표시
  useEffect(() => {
    if (selectedEvent && user) {
      const alreadyRead = selectedEvent.readBy?.[user.id];
      if (!alreadyRead) {
        markAsRead(selectedEvent.id, user.id, user.name);
      }
    }
  }, [selectedEvent?.id, user?.id]);

  // 댓글 실시간 구독
  useEffect(() => {
    if (!selectedEvent) return;
    const q = query(
      collection(db, 'events', selectedEvent.id, 'comments'),
      orderBy('createdAt', 'asc'),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: EventComment[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          eventId: selectedEvent.id,
          userId: data.userId || '',
          userName: data.userName || '',
          userColor: data.userColor || '#4A90E2',
          text: data.text || '',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        };
      });
      setComments(list);
    }, (err) => {
      console.warn('[EventDetail] Comments subscription error:', err);
    });
    return () => unsub();
  }, [selectedEvent?.id]);

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
      showToast('일정이 삭제되었습니다');
      setShowEventDetail(false);
      setSelectedEvent(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setDeleting(false);
  }

  async function handleAddComment() {
    const text = newComment.trim();
    if (!text || !user || !selectedEvent) return;
    setSendingComment(true);
    try {
      await addDoc(collection(db, 'events', selectedEvent.id, 'comments'), {
        userId: user.id,
        userName: user.name,
        userColor: user.profileColor || '#4A90E2',
        text: text.slice(0, 500),
        createdAt: serverTimestamp(),
      });
      // 멘션된 사용자에게 알림 전송
      const mentionedNames = extractMentions(text);
      if (mentionedNames.length > 0) {
        const allUsers = useUsersStore.getState().users;
        for (const name of mentionedNames) {
          const target = allUsers.find((u) => u.name === name);
          if (target && target.id !== user.id) {
            notifyUser(
              target.id,
              'new_event',
              `💬 ${user.name}님이 "${selectedEvent.title}"에서 언급했습니다`,
              selectedEvent.id,
              user.id,
            );
          }
        }
      }
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
    setSendingComment(false);
  }

  async function handleDeleteComment(commentId: string) {
    if (!selectedEvent) return;
    try {
      await deleteDoc(doc(db, 'events', selectedEvent.id, 'comments', commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  }

  function formatDTL(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function startEditing() {
    if (!selectedEvent) return;
    setEditTitle(selectedEvent.title);
    setEditDesc(selectedEvent.description || '');
    setEditStart(formatDTL(new Date(selectedEvent.startDate)));
    setEditEnd(formatDTL(new Date(selectedEvent.endDate)));
    setEditCategory(selectedEvent.category);
    setEditAllDay(selectedEvent.allDay);
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!selectedEvent) return;
    const trimTitle = editTitle.trim().slice(0, 100);
    if (!trimTitle) return;
    const start = new Date(editStart);
    const end = new Date(editEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (end < start) { showToast('종료 시간이 시작 시간보다 앞설 수 없습니다.', 'error'); return; }

    setSaving(true);
    try {
      const updates = {
        title: trimTitle,
        description: editDesc.trim().slice(0, 1000),
        startDate: start,
        endDate: end,
        category: editCategory,
        allDay: editAllDay,
      };
      await updateEvent(selectedEvent.id, updates);
      // 편집 후 selectedEvent 갱신
      setSelectedEvent({ ...selectedEvent, ...updates });
      showToast('일정이 수정되었습니다');
      setEditing(false);
    } catch (err) {
      showToast('수정에 실패했습니다', 'error');
    }
    setSaving(false);
  }

  function close() {
    setEditing(false);
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
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={styles.editInput}
              placeholder="일정 제목"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as EventCategory)} style={styles.editSelect}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
                <input type="checkbox" checked={editAllDay} onChange={(e) => setEditAllDay(e.target.checked)} />
                종일
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} style={styles.editDateInput} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>~</span>
              <input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} style={styles.editDateInput} />
            </div>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              style={styles.editTextarea}
              rows={3}
              placeholder="상세 설명"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button onClick={() => setEditing(false)} style={styles.editCancelBtn}>취소</button>
              <button onClick={handleSaveEdit} disabled={!editTitle.trim() || saving} style={styles.editSaveBtn}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <>
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
          </>
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

        {/* Read receipts */}
        {(() => {
          const readEntries = Object.entries(selectedEvent.readBy || {});
          const readCount = readEntries.length;
          return (
            <div style={styles.readSection}>
              <div
                onClick={() => setShowReadList(!showReadList)}
                style={styles.readHeader}
              >
                <span style={styles.sectionLabel}>👁️ 읽음 확인</span>
                <span style={styles.readCount}>{readCount}명 확인</span>
              </div>
              {showReadList && readEntries.length > 0 && (
                <div style={styles.readList}>
                  {readEntries
                    .sort((a, b) => {
                      const ta = a[1].readAt instanceof Date ? a[1].readAt.getTime() : 0;
                      const tb = b[1].readAt instanceof Date ? b[1].readAt.getTime() : 0;
                      return ta - tb;
                    })
                    .map(([uid, receipt]) => (
                      <div key={uid} style={styles.readItem}>
                        <span style={styles.readName}>{receipt.name}</span>
                        <span style={styles.readTime}>
                          {receipt.readAt instanceof Date && !isNaN(receipt.readAt.getTime())
                            ? format(receipt.readAt, 'M/d HH:mm', { locale: ko })
                            : '방금'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              {showReadList && readEntries.length === 0 && (
                <div style={styles.readEmpty}>아직 확인한 교사가 없습니다</div>
              )}
            </div>
          );
        })()}

        {/* Comments */}
        <div style={styles.commentSection}>
          <span style={styles.sectionLabel}>💬 댓글 ({comments.length})</span>
          <div style={styles.commentList}>
            {comments.map((c) => (
              <div key={c.id} style={styles.commentItem}>
                <div style={styles.commentHeader}>
                  <div style={styles.commentUser}>
                    <span style={{ ...styles.commentDot, background: c.userColor }} />
                    <span style={styles.commentName}>{c.userName}</span>
                  </div>
                  <div style={styles.commentMeta}>
                    <span style={styles.commentTime}>
                      {format(c.createdAt, 'M/d HH:mm', { locale: ko })}
                    </span>
                    {user?.id === c.userId && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        style={styles.commentDeleteBtn}
                        title="삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <p style={styles.commentText}>{renderMentions(c.text)}</p>
              </div>
            ))}
          </div>
          {user && (
            <div style={styles.commentInput}>
              <MentionInput
                value={newComment}
                onChange={setNewComment}
                onSubmit={handleAddComment}
                placeholder="댓글 (@로 멘션)"
                style={styles.commentTextInput}
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim() || sendingComment}
                style={{
                  ...styles.commentSendBtn,
                  opacity: !newComment.trim() || sendingComment ? 0.5 : 1,
                }}
              >
                {sendingComment ? '...' : '전송'}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        {canEdit && !editing && (
          <div style={styles.actions}>
            <button onClick={startEditing} style={styles.editBtn}>✏️ 수정</button>
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
  readSection: {
    marginBottom: 10,
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  readHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    cursor: 'pointer',
    background: 'var(--bg-secondary)',
    transition: 'background 0.12s',
  },
  readCount: {
    fontSize: 11,
    color: 'var(--accent)',
    fontWeight: 600,
  },
  readList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    maxHeight: 150,
    overflow: 'auto',
  },
  readItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 10px',
    borderTop: '1px solid var(--border-subtle)',
  },
  readName: {
    fontSize: 12,
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  readTime: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  readEmpty: {
    padding: '8px 10px',
    fontSize: 11,
    color: 'var(--text-muted)',
    textAlign: 'center',
    borderTop: '1px solid var(--border-subtle)',
  },
  commentSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10,
  },
  commentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    maxHeight: 180,
    overflow: 'auto',
  },
  commentItem: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  commentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  commentUser: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  commentDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  commentName: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  commentMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  commentTime: {
    fontSize: 9,
    color: 'var(--text-muted)',
  },
  commentDeleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: 10,
    padding: '0 2px',
    lineHeight: 1,
  },
  commentText: {
    fontSize: 12,
    color: 'var(--text-primary)',
    lineHeight: 1.4,
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  commentInput: {
    display: 'flex',
    gap: 4,
    marginTop: 4,
  },
  commentTextInput: {
    flex: 1,
    padding: '6px 10px',
    fontSize: 12,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  commentSendBtn: {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    flexShrink: 0,
  },
  editBtn: {
    padding: '6px 16px',
    fontSize: 12,
    border: '1px solid var(--accent)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--accent)',
    cursor: 'pointer',
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
  editInput: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  editSelect: {
    padding: '4px 8px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  editDateInput: {
    flex: 1,
    padding: '4px 6px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  editTextarea: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 12,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  editCancelBtn: {
    padding: '6px 14px',
    fontSize: 11,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  editSaveBtn: {
    padding: '6px 14px',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
  },
};

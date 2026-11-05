import React, { useState, useMemo } from 'react';
import { endOfDay, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTodosStore } from '../../store/todosStore';
import { useAuthStore } from '../../store/authStore';
import { showToast } from '../common/Toast';
import type { Todo } from '@shared/types';
import { Ic } from '../common/Ic';

const PRIORITY_COLORS = { low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)' } as const;

interface TodosViewProps {
  onBack: () => void;
}

type Filter = 'all' | 'active' | 'completed';

export function TodosView({ onBack }: TodosViewProps) {
  const { user } = useAuthStore();
  // 구독은 앱이 로그인할 때 시작한다. 여기서 끊으면 달력 옆 할 일까지 비어 버린다
  const { todos, addTodo, toggleTodo, deleteTodo, updateTodo } = useTodosStore();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return todos.filter((t) => {
      if (filter === 'active') return !t.completed;
      if (filter === 'completed') return t.completed;
      return true;
    });
  }, [todos, filter]);

  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.length - activeCount;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !user) return;

    setSaving(true);
    try {
      // school이 유효한 값이면 사용, 미지정이면 'all' 폴백 (본인 todos는 userId로만 필터)
      const schoolValue = (user.school === 'taeseong_middle' || user.school === 'taeseong_high')
        ? user.school : 'all';
      await addTodo({
        userId: user.id,
        title: trimmed.slice(0, 200),
        completed: false,
        priority,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00`) : undefined,
        school: schoolValue,
      });
      setTitle('');
      setDueDate('');
      setPriority('medium');
      showToast('할 일이 추가되었습니다');
    } catch (err) {
      console.error('[Todos] add failed:', err);
      showToast('추가 실패', 'error');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm('이 할 일을 삭제하시겠습니까?')) return;
    try {
      await deleteTodo(id);
      showToast('삭제되었습니다');
    } catch {
      showToast('삭제 실패', 'error');
    }
  }

  return (
    <div className="animate-fade-in" style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}><Ic name="checkSquare" />할 일</h3>
        <button onClick={onBack} style={styles.closeBtn}><Ic name="x" gap={false} /></button>
      </div>

      {/* 입력 폼 */}
      <form onSubmit={handleAdd} style={styles.addForm}>
        <input
          type="text"
          placeholder="할 일을 입력하세요..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={styles.input}
          maxLength={200}
          autoFocus
        />
        <div style={styles.formRow}>
          <select value={priority} onChange={(e) => setPriority(e.target.value as any)} style={styles.select}>
            <option value="low">낮음</option>
            <option value="medium">보통</option>
            <option value="high">높음</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={styles.dateInput}
          />
          <button
            type="submit"
            disabled={saving || title.trim().length === 0}
            style={{
              ...styles.addBtn,
              opacity: (saving || title.trim().length === 0) ? 0.5 : 1,
              cursor: (saving || title.trim().length === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '추가 중...' : '+ 추가'}
          </button>
        </div>
      </form>

      {/* 필터 */}
      <div style={styles.filterBar}>
        <FilterBtn active={filter === 'active'} onClick={() => setFilter('active')} label={`진행 중 (${activeCount})`} />
        <FilterBtn active={filter === 'completed'} onClick={() => setFilter('completed')} label={`완료 (${completedCount})`} />
        <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label={`전체 (${todos.length})`} />
      </div>

      {/* 리스트 */}
      <div style={styles.list}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>
            {filter === 'active' ? '진행 중인 할 일이 없습니다' :
             filter === 'completed' ? '아직 완료한 할 일이 없습니다' :
             '할 일이 없습니다'}
          </div>
        ) : (
          filtered.map((t) => (
            <TodoItem
              key={t.id}
              todo={t}
              onToggle={() => toggleTodo(t.id).catch((err) => {
                console.error('[Todos] toggle failed:', err);
                showToast('저장하지 못했습니다', 'error');
              })}
              onDelete={() => handleDelete(t.id)}
              onUpdate={(updates) => updateTodo(t.id, updates).catch((err) => {
                console.error('[Todos] update failed:', err);
                showToast('수정 실패', 'error');
              })}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{ ...styles.filterBtn, ...(active ? styles.filterBtnActive : {}) }}>
      {label}
    </button>
  );
}

function TodoItem({ todo, onToggle, onDelete, onUpdate }: {
  todo: Todo;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<Todo>) => void;
}) {
  const priorityColor = PRIORITY_COLORS[todo.priority];
  // 마감일 당일은 그날 끝까지 지난 것이 아니다
  const isOverdue = todo.dueDate && !todo.completed && endOfDay(new Date(todo.dueDate)) < new Date();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editPriority, setEditPriority] = useState(todo.priority);
  const [editDate, setEditDate] = useState(
    todo.dueDate ? format(new Date(todo.dueDate), 'yyyy-MM-dd') : ''
  );

  function startEdit() {
    setEditTitle(todo.title);
    setEditPriority(todo.priority);
    setEditDate(todo.dueDate ? format(new Date(todo.dueDate), 'yyyy-MM-dd') : '');
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      showToast('제목을 입력하세요', 'error');
      return;
    }
    onUpdate({
      title: trimmed.slice(0, 200),
      priority: editPriority,
      dueDate: editDate ? new Date(`${editDate}T00:00:00`) : undefined,
    });
    setEditing(false);
    showToast('수정되었습니다');
  }

  function cancelEdit() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ ...styles.todoItem, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          maxLength={200}
          style={styles.input}
          autoFocus
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return; // IME 조합 중 무시
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as any)} style={styles.select}>
            <option value="low">낮음</option>
            <option value="medium">보통</option>
            <option value="high">높음</option>
          </select>
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            style={styles.dateInput}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={cancelEdit} style={{ ...styles.editBtn, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>취소</button>
          <button onClick={saveEdit} style={styles.editBtn}>저장</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.todoItem, opacity: todo.completed ? 0.55 : 1 }}>
      <button onClick={onToggle} style={styles.checkBtn} aria-label="완료 토글">
        <span style={{
          ...styles.checkbox,
          background: todo.completed ? 'var(--accent)' : 'transparent',
          borderColor: todo.completed ? 'var(--accent)' : 'var(--border-color)',
        }}>
          {todo.completed && <Ic name="check" gap={false} />}
        </span>
      </button>
      <div style={styles.todoContent} onDoubleClick={startEdit} title="더블클릭하면 수정">
        <span style={{
          ...styles.todoTitle,
          textDecoration: todo.completed ? 'line-through' : 'none',
        }}>
          <span style={{ ...styles.priorityDot, background: priorityColor }} />
          {todo.title}
        </span>
        {todo.dueDate && (
          <span style={{ ...styles.dueDate, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)' }}>
            <Ic name={isOverdue ? 'alert' : 'calendar'} />
            {format(new Date(todo.dueDate), 'M/d (EEE)', { locale: ko })}
          </span>
        )}
      </div>
      <button onClick={startEdit} style={styles.iconBtn} title="수정" aria-label="수정"><Ic name="pencil" gap={false} /></button>
      <button onClick={onDelete} style={styles.deleteBtn} title="삭제" aria-label="삭제"><Ic name="x" gap={false} /></button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: '0 12px 12px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' },
  title: { fontSize: 'var(--fs-subtitle)', fontWeight: 700, color: 'var(--text-primary)' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--fs-lead)', color: 'var(--text-muted)' },
  addForm: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 },
  input: {
    width: '100%', padding: '8px 12px', fontSize: 'var(--fs-control)',
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  formRow: { display: 'flex', gap: 6 },
  select: {
    flex: 1, padding: '6px 10px', fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  dateInput: {
    flex: 1, padding: '6px 10px', fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  addBtn: {
    padding: '6px 14px', fontSize: 'var(--fs-body)', fontWeight: 600,
    border: 'none', borderRadius: 8,
    background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer',
  },
  filterBar: { display: 'flex', gap: 4, marginBottom: 10 },
  filterBtn: {
    flex: 1, padding: '5px 0', fontSize: 'var(--fs-label)', fontWeight: 500,
    border: 'none', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  filterBtnActive: { background: 'var(--accent)', color: 'var(--on-accent)' },
  list: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 },
  empty: { textAlign: 'center', fontSize: 'var(--fs-control)', color: 'var(--text-muted)', marginTop: 40 },
  todoItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px',
    background: 'var(--bg-secondary)', borderRadius: 8,
  },
  checkBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    border: '2px solid var(--border-color)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--on-accent)', fontSize: 'var(--fs-label)', fontWeight: 700,
  },
  todoContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  todoTitle: { fontSize: 'var(--fs-control)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 },
  priorityDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  dueDate: { fontSize: 'var(--fs-caption)', marginLeft: 12 },
  deleteBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 'var(--fs-body)', padding: '2px 6px',
  },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 'var(--fs-body)', padding: '2px 6px', opacity: 0.7,
  },
  editBtn: {
    padding: '5px 12px', fontSize: 'var(--fs-label)', fontWeight: 600,
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer',
  },
};

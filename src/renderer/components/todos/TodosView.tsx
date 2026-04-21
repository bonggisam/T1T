import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTodosStore } from '../../store/todosStore';
import { useAuthStore } from '../../store/authStore';
import { showToast } from '../common/Toast';
import type { Todo } from '@shared/types';

const PRIORITY_COLORS = { low: '#10B981', medium: '#F59E0B', high: '#EF4444' } as const;

interface TodosViewProps {
  onBack: () => void;
}

type Filter = 'all' | 'active' | 'completed';

export function TodosView({ onBack }: TodosViewProps) {
  const { user } = useAuthStore();
  const { todos, subscribeToTodos, cleanup, addTodo, toggleTodo, deleteTodo, updateTodo } = useTodosStore();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    subscribeToTodos(user.id);
    return () => cleanup();
  }, [user?.id]);

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
        dueDate: dueDate ? new Date(dueDate) : undefined,
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
        <h3 style={styles.title}>✅ 할 일</h3>
        <button onClick={onBack} style={styles.closeBtn}>✕</button>
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
            <option value="low">🟢 낮음</option>
            <option value="medium">🟡 보통</option>
            <option value="high">🔴 높음</option>
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
            {filter === 'active' ? '🎉 진행 중인 할 일이 없습니다' :
             filter === 'completed' ? '아직 완료한 할 일이 없습니다' :
             '할 일이 없습니다'}
          </div>
        ) : (
          filtered.map((t) => (
            <TodoItem key={t.id} todo={t} onToggle={() => toggleTodo(t.id)} onDelete={() => handleDelete(t.id)} />
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

function TodoItem({ todo, onToggle, onDelete }: { todo: Todo; onToggle: () => void; onDelete: () => void }) {
  const priorityColor = PRIORITY_COLORS[todo.priority];
  const isOverdue = todo.dueDate && !todo.completed && new Date(todo.dueDate) < new Date();

  return (
    <div style={{ ...styles.todoItem, opacity: todo.completed ? 0.55 : 1 }}>
      <button onClick={onToggle} style={styles.checkBtn} aria-label="완료 토글">
        <span style={{
          ...styles.checkbox,
          background: todo.completed ? 'var(--accent)' : 'transparent',
          borderColor: todo.completed ? 'var(--accent)' : 'var(--border-color)',
        }}>
          {todo.completed && '✓'}
        </span>
      </button>
      <div style={styles.todoContent}>
        <span style={{
          ...styles.todoTitle,
          textDecoration: todo.completed ? 'line-through' : 'none',
        }}>
          <span style={{ ...styles.priorityDot, background: priorityColor }} />
          {todo.title}
        </span>
        {todo.dueDate && (
          <span style={{ ...styles.dueDate, color: isOverdue ? '#EF4444' : 'var(--text-muted)' }}>
            {isOverdue ? '⚠️ ' : '📅 '}
            {format(new Date(todo.dueDate), 'M/d (EEE)', { locale: ko })}
          </span>
        )}
      </div>
      <button onClick={onDelete} style={styles.deleteBtn} title="삭제">✕</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: '0 12px 12px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)' },
  addForm: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 },
  input: {
    width: '100%', padding: '8px 12px', fontSize: 13,
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  formRow: { display: 'flex', gap: 6 },
  select: {
    flex: 1, padding: '6px 10px', fontSize: 11,
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  dateInput: {
    flex: 1, padding: '6px 10px', fontSize: 11,
    border: '1px solid var(--border-color)', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
  },
  addBtn: {
    padding: '6px 14px', fontSize: 12, fontWeight: 600,
    border: 'none', borderRadius: 8,
    background: 'var(--accent)', color: '#fff', cursor: 'pointer',
  },
  filterBar: { display: 'flex', gap: 4, marginBottom: 10 },
  filterBtn: {
    flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 500,
    border: 'none', borderRadius: 8,
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
  },
  filterBtnActive: { background: 'var(--accent)', color: '#fff' },
  list: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 },
  empty: { textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 40 },
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
    color: '#fff', fontSize: 11, fontWeight: 700,
  },
  todoContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  todoTitle: { fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 },
  priorityDot: { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  dueDate: { fontSize: 10, marginLeft: 12 },
  deleteBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 12, padding: '2px 6px',
  },
};

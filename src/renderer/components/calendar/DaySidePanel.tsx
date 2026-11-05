import React from 'react';
import { format, isSameDay } from 'date-fns';
import { Check } from 'lucide-react';
import type { PersonalEvent } from '@shared/types';
import { useTodosStore } from '../../store/todosStore';
import { usePersonalHidden } from '../../store/privacyStore';
import { DayAgenda } from './DayAgenda';
import { TodayWidgets } from './TodayWidgets';

const SIDE_WIDTH = 256;
const MAX_TODOS = 5;

/** 곧 할 일 몇 가지. 개인 내용이므로 가린 동안에는 보여 주지 않는다. */
export function TodoMini() {
  const todos = useTodosStore((s) => s.todos);
  const toggleTodo = useTodosStore((s) => s.toggleTodo);
  const hidden = usePersonalHidden();
  if (hidden) return null;
  const active = todos.filter((t) => !t.completed).slice(0, MAX_TODOS);
  if (active.length === 0) return null;
  return (
    <div>
      <h5 style={styles.heading}>할 일</h5>
      {active.map((todo) => (
        <button key={todo.id} className="ag-row" style={styles.todo} onClick={() => toggleTodo(todo.id)} title="완료로 표시">
          <span style={styles.box}><Check size={10} strokeWidth={3} style={{ opacity: 0 }} /></span>
          <span style={styles.todoText}>{todo.title}</span>
          {todo.dueDate && <span style={styles.due}>{format(new Date(todo.dueDate), 'M/d')}</span>}
        </button>
      ))}
    </div>
  );
}

/** 넓은 창의 월 화면 옆 칸. 고른 날의 일정을 보여 주고, 오늘이면 날씨, 다음 수업, 할 일도 함께 둔다. */
export function DaySidePanel({ date, onPersonalClick }: { date: Date; onPersonalClick?: (pe: PersonalEvent) => void }) {
  const today = isSameDay(date, new Date());
  return (
    <aside style={styles.panel} aria-label="고른 날의 일정">
      <DayAgenda date={date} onPersonalClick={onPersonalClick} />
      {today && <TodoMini />}
      {today && <TodayWidgets />}
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flexShrink: 0,
    width: SIDE_WIDTH,
    overflowY: 'auto',
    borderLeft: '1px solid var(--grid-line)',
  },
  heading: {
    margin: '10px 12px 2px',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  todo: {
    alignItems: 'center',
    padding: '4px 12px',
  },
  box: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 14,
    height: 14,
    borderRadius: 4,
    boxShadow: 'inset 0 0 0 1.5px var(--text-muted)',
  },
  todoText: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  due: {
    flexShrink: 0,
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
};

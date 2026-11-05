import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useComciganStore } from '../../store/comciganStore';
import { showToast } from '../common/Toast';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useDisableClickThrough } from '../../hooks/useDisableClickThrough';
import { parseEventDrafts, type ParsedDraft } from '../../utils/pasteEventParser';
import { Ic } from '../common/Ic';

interface Row extends ParsedDraft {
  checked: boolean;
  /** 같은 제목과 시작 시각의 개인 일정이 이미 있다 */
  exists: boolean;
}

interface PasteEventsModalProps {
  initialText: string;
  onClose: () => void;
}

const DEFAULT_START_HOUR = 9;

function toRows(text: string, classTimes: string[] | undefined): Row[] {
  const existing = usePersonalEventStore.getState().personalEvents;
  return parseEventDrafts(text, new Date(), classTimes ?? []).map((draft) => {
    const exists = existing.some((p) => (
      p.title === draft.title && new Date(p.startDate).getTime() === draft.start.getTime()
    ));
    return { ...draft, exists, checked: !draft.past && !exists };
  });
}

function toInputValue(date: Date, allDay: boolean): string {
  return format(date, allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm");
}

/** 날짜만 있는 값을 new Date()에 넘기면 UTC 자정으로 읽혀 시각이 어긋나므로 나누어 만든다 */
function fromInputValue(value: string, allDay: boolean, edge: 'start' | 'end'): Date | null {
  if (!value) return null;
  if (allDay) {
    const [y, m, d] = value.split('-').map(Number);
    return edge === 'start' ? new Date(y, m - 1, d, 0, 0, 0, 0) : new Date(y, m - 1, d, 23, 59, 0, 0);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValid(row: Row): boolean {
  return row.title.trim().length > 0 && row.end >= row.start;
}

/**
 * 쪽지나 공문을 붙여 넣어 일정 초안을 만들고, 고치고 고른 것만 개인 일정으로 저장한다.
 * 글은 이 PC 안에서 규칙으로만 읽는다. 다른 곳으로 보내지 않고 저장하지도 않는다.
 */
export function PasteEventsModal({ initialText, onClose }: PasteEventsModalProps) {
  const { user } = useAuthStore();
  const addPersonalEvent = usePersonalEventStore((s) => s.addPersonalEvent);
  const classTimes = useComciganStore((s) => s.timetableData?.classTimes);
  const [text, setText] = useState(initialText);
  const [rows, setRows] = useState<Row[]>(() => toRows(initialText, classTimes));
  const [saving, setSaving] = useState(false);

  useEscapeKey(onClose);
  // 위젯 모드에서 입력 막힘 방지 — 창이 열린 동안 clickThrough 강제 해제
  useDisableClickThrough();

  const selected = useMemo(() => rows.filter((r) => r.checked), [rows]);
  const canSave = selected.length > 0 && selected.every(isValid) && !saving;

  function handleTextChange(value: string) {
    setText(value);
    setRows(toRows(value, classTimes));
  }

  function updateRow(id: string, updates: Partial<Row>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }

  function changeStart(row: Row, value: string) {
    const start = fromInputValue(value, row.allDay, 'start');
    if (!start) return;
    // 일정 길이를 유지한 채 함께 옮긴다
    updateRow(row.id, { start, end: new Date(start.getTime() + (row.end.getTime() - row.start.getTime())) });
  }

  function changeEnd(row: Row, value: string) {
    const end = fromInputValue(value, row.allDay, 'end');
    if (end) updateRow(row.id, { end });
  }

  function toggleAllDay(row: Row, allDay: boolean) {
    const start = new Date(row.start);
    const end = new Date(row.end);
    if (allDay) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 0, 0);
    } else {
      start.setHours(DEFAULT_START_HOUR, 0, 0, 0);
      end.setHours(DEFAULT_START_HOUR + 1, 0, 0, 0);
    }
    updateRow(row.id, { allDay, start, end });
  }

  async function handleSave() {
    if (!user || !canSave) return;
    setSaving(true);
    const failed: Row[] = [];
    let googleFailed = 0;
    // 한 건씩 저장한다. 구글 연동이 있으면 건마다 구글에도 보내므로 한꺼번에 보내지 않는다.
    for (const row of selected) {
      try {
        const result = await addPersonalEvent(user.id, {
          title: row.title.trim().slice(0, 100),
          description: '',
          startDate: row.start,
          endDate: row.end,
          allDay: row.allDay,
          source: 'local',
          externalId: null,
          checklist: [],
          color: user.profileColor || '#4A90E2',
        });
        if (result.googleSync === 'failed') googleFailed += 1;
      } catch (err) {
        console.error('Failed to add pasted event:', err);
        failed.push(row);
      }
    }
    setSaving(false);

    const savedCount = selected.length - failed.length;
    if (failed.length > 0) {
      // 저장하지 못한 것만 남겨 다시 시도할 수 있게 한다
      setRows(failed);
      showToast(`${savedCount}건 저장, ${failed.length}건 실패. 남은 항목을 다시 저장해 주세요.`, 'error');
      return;
    }
    showToast(
      googleFailed > 0
        ? `개인 일정 ${savedCount}건 추가. 구글 동기화 실패 ${googleFailed}건은 자동으로 다시 시도합니다.`
        : `개인 일정 ${savedCount}건을 추가했습니다`,
      googleFailed > 0 ? 'error' : 'success',
    );
    // 방금 만든 일정이 보이는 달로 옮긴다
    const first = selected.reduce((a, b) => (a.start <= b.start ? a : b));
    const calendar = useCalendarStore.getState();
    calendar.setCurrentMonth(first.start);
    calendar.setSelectedDate(first.start);
    onClose();
  }

  return (
    <div style={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="붙여 넣어 일정 만들기">
      <div className="glass-solid animate-slide-up" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>붙여 넣어 일정 만들기</h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label="닫기"><Ic name="x" gap={false} /></button>
        </div>

        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="쪽지나 공문을 여기에 붙여 넣으세요"
          aria-label="붙여 넣은 글"
          rows={3}
          style={styles.textarea}
          autoFocus={!initialText}
        />
        <p style={styles.note}>글은 이 PC 안에서만 읽고 보관하지 않습니다. 고른 항목만 개인 일정으로 저장합니다.</p>

        <div style={styles.list}>
          {rows.length === 0 && text.trim() && (
            <p style={styles.empty}>날짜를 찾지 못했습니다. 11월 12일, 11.12., 다음 주 금요일처럼 적힌 줄을 읽습니다.</p>
          )}
          {rows.map((row) => {
            const badRange = row.end < row.start;
            return (
              <div key={row.id} style={{ ...styles.row, opacity: row.checked ? 1 : 0.65 }}>
                <div style={styles.rowTop}>
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => updateRow(row.id, { checked: e.target.checked })}
                    aria-label={`${row.title} 저장`}
                  />
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(row.id, { title: e.target.value })}
                    placeholder="일정 제목"
                    aria-label="일정 제목"
                    maxLength={100}
                    style={styles.titleInput}
                  />
                  <label style={styles.allDay}>
                    <input type="checkbox" checked={row.allDay} onChange={(e) => toggleAllDay(row, e.target.checked)} />
                    종일
                  </label>
                </div>
                <div style={styles.rowDates}>
                  <input
                    type={row.allDay ? 'date' : 'datetime-local'}
                    value={toInputValue(row.start, row.allDay)}
                    onChange={(e) => changeStart(row, e.target.value)}
                    aria-label="시작"
                    style={styles.dateInput}
                  />
                  <span style={styles.tilde}>~</span>
                  <input
                    type={row.allDay ? 'date' : 'datetime-local'}
                    value={toInputValue(row.end, row.allDay)}
                    onChange={(e) => changeEnd(row, e.target.value)}
                    aria-label="끝"
                    style={styles.dateInput}
                  />
                </div>
                <div style={styles.source} title={row.source}>
                  {badRange && <strong style={styles.warn}>끝이 시작보다 빠릅니다 · </strong>}
                  {row.exists && <strong style={styles.warn}>이미 있는 일정 · </strong>}
                  {row.past && <strong style={styles.warn}>지난 날짜 · </strong>}
                  {row.source}
                </div>
              </div>
            );
          })}
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={onClose} style={styles.cancelBtn}>취소</button>
          <button type="button" onClick={handleSave} disabled={!canSave} style={{ ...styles.submitBtn, opacity: canSave ? 1 : 0.5 }}>
            {saving ? '저장 중...' : `개인 일정 ${selected.length}건 추가`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--scrim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 12,
  },
  modal: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 14,
    minHeight: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--fs-subtitle)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--fs-lead)',
    color: 'var(--text-muted)',
    padding: '2px 6px',
  },
  textarea: {
    width: '100%',
    flexShrink: 0,
    padding: '8px 10px',
    fontSize: 'var(--fs-body)',
    lineHeight: 1.45,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  note: {
    flexShrink: 0,
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
  },
  list: {
    flex: 1,
    minHeight: 60,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  empty: {
    padding: '10px 4px',
    fontSize: 'var(--fs-body)',
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
  },
  row: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '6px 8px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
  },
  rowTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  titleInput: {
    flex: 1,
    minWidth: 0,
    padding: '4px 6px',
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  rowDates: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  dateInput: {
    flex: 1,
    minWidth: 0,
    padding: '3px 5px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    outline: 'none',
    colorScheme: 'light dark',
  },
  tilde: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  allDay: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  source: {
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  warn: {
    color: 'var(--warning)',
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  cancelBtn: {
    padding: '6px 16px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '6px 16px',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
};

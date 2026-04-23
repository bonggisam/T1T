import React, { useState, useEffect } from 'react';
import { useCalendarStore } from '../../store/calendarStore';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import type { EventCategory, ChecklistItem, School } from '@shared/types';
import { showToast } from '../common/Toast';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { parseNaturalDate, stripDateText } from '../../utils/naturalDateParse';
import { COMMON_EVENT_TEMPLATES } from '../../utils/schoolColors';

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
  const { viewingSchool } = useUIStore();
  const visibleEvents = useVisibleEvents();

  // 현재 보는 학교 뷰에 맞게 기본 공유 범위 계산
  function defaultScope(): School | 'all' {
    if (viewingSchool === 'all') {
      // 전체 뷰 → 본인 학교가 유효하면 본인 학교, 아니면 'all'
      if (user?.school === 'taeseong_middle' || user?.school === 'taeseong_high') {
        return user.school;
      }
      return 'all';
    }
    return viewingSchool; // 특정 학교 뷰
  }

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
  const [scope, setScope] = useState<School | 'all'>(defaultScope());
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [saving, setSaving] = useState(false);

  // ESC 키로 닫기 (캡처 우선)
  useEscapeKey(() => setShowEventModal(false));

  // user 로드 또는 viewingSchool 변경 시 scope 기본값 재계산 (사용자가 직접 바꾼 값이 아닌 경우)
  useEffect(() => {
    setScope(defaultScope());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.school, viewingSchool]);

  /** 제목에서 "내일 3시" 등 자연어 추출 → 시작 시간 자동 설정 */
  function applyNaturalDate() {
    const parsed = parseNaturalDate(title);
    if (!parsed) {
      showToast('인식할 수 있는 날짜/시간 표현이 없습니다', 'info');
      return;
    }
    const newStart = new Date(parsed.date);
    if (!parsed.hasTime) {
      newStart.setHours(9, 0, 0, 0);
    }
    const newEnd = new Date(newStart);
    newEnd.setHours(newStart.getHours() + 1);
    setStartDate(formatDateTimeLocal(newStart));
    setEndDate(formatDateTimeLocal(newEnd));
    const cleaned = stripDateText(title, parsed.matchedText);
    setTitle(cleaned || title);
    showToast(`📅 ${parsed.matchedText} → ${newStart.toLocaleString('ko-KR')}`, 'success');
  }

  /** 공통 템플릿 적용 */
  function applyTemplate(key: string) {
    const t = COMMON_EVENT_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description);
    setCategory(t.category);
    setScope(t.school);
  }

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

    // 시간 충돌 경고 (같은 학교 범위 + 종일 아닌 경우)
    if (!allDay) {
      const conflicts = visibleEvents.filter((e) => {
        if (e.allDay) return false;
        const eStart = new Date(e.startDate).getTime();
        const eEnd = new Date(e.endDate).getTime();
        return eStart < end.getTime() && eEnd > start.getTime();
      });
      if (conflicts.length > 0) {
        const list = conflicts.slice(0, 3).map((c) => `• ${c.title}`).join('\n');
        const ok = window.confirm(
          `⚠️ 같은 시간대에 ${conflicts.length}개 일정이 겹칩니다:\n${list}${conflicts.length > 3 ? `\n...외 ${conflicts.length - 3}개` : ''}\n\n그래도 등록하시겠습니까?`
        );
        if (!ok) return;
      }
    }

    setSaving(true);
    try {
      await addEvent({
        title: trimTitle,
        description: trimDesc,
        startDate: start,
        endDate: end,
        allDay,
        category,
        school: scope,
        creatorSchool: (user.school === 'taeseong_middle' || user.school === 'taeseong_high') ? user.school : undefined,
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
      const msg = err instanceof Error ? err.message : '일정 등록에 실패했습니다';
      showToast(`❌ ${msg}`, 'error');
    }
    setSaving(false);
  }

  return (
    <div
      style={styles.overlay}
      onClick={() => setShowEventModal(false)}
      role="dialog"
      aria-modal="true"
      aria-label="새 일정 등록"
    >
      <div
        className="glass-solid animate-slide-up"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // 간단 focus-trap: 모달 내 Tab/Shift+Tab 순환
          if (e.key !== 'Tab') return;
          const modal = e.currentTarget as HTMLElement;
          const focusable = modal.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div style={styles.header}>
          <h3 style={styles.title}>새 일정 등록</h3>
          <button onClick={() => setShowEventModal(false)} style={styles.closeBtn} aria-label="닫기">✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <select
            value=""
            onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}
            style={styles.select}
            title="공통 행사 템플릿"
          >
            <option value="">📋 공통 템플릿 선택…</option>
            {COMMON_EVENT_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>{t.title}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="일정 제목 (예: 내일 3시 회의)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ ...styles.input, flex: 1 }}
              autoFocus
            />
            <button
              type="button"
              onClick={applyNaturalDate}
              style={styles.magicBtn}
              title="자연어 날짜 인식 — 제목의 '내일 3시' 같은 표현을 시작 시간으로 설정"
            >
              🪄
            </button>
          </div>

          {/* 공유 범위 — 학교 구분 버튼 */}
          <div style={styles.schoolRow}>
            <span style={styles.schoolRowLabel}>공유 대상:</span>
            <button
              type="button"
              onClick={() => setScope('taeseong_middle')}
              style={{
                ...styles.schoolBtn,
                ...(scope === 'taeseong_middle' ? { ...styles.schoolBtnActive, background: '#10B981' } : {}),
              }}
            >
              🏫 태성중
            </button>
            <button
              type="button"
              onClick={() => setScope('taeseong_high')}
              style={{
                ...styles.schoolBtn,
                ...(scope === 'taeseong_high' ? { ...styles.schoolBtnActive, background: '#8B5CF6' } : {}),
              }}
            >
              🎓 태성고
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              style={{
                ...styles.schoolBtn,
                ...(scope === 'all' ? { ...styles.schoolBtnActive, background: '#3B82F6' } : {}),
              }}
            >
              📢 공통
            </button>
          </div>

          <div style={styles.row}>
            <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} style={styles.select}>
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={allDay} onChange={(e) => {
                const checked = e.target.checked;
                setAllDay(checked);
                // 종일 토글 시 startDate는 당일 0시, endDate는 당일 23:59로 자동 조정
                if (checked) {
                  const s = new Date(startDate); s.setHours(0, 0, 0, 0);
                  const ed = new Date(endDate); ed.setHours(23, 59, 0, 0);
                  setStartDate(formatDateTimeLocal(s));
                  setEndDate(formatDateTimeLocal(ed));
                }
              }} />
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
  magicBtn: {
    background: 'linear-gradient(135deg, #8B5CF6, #4A90E2)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    padding: '0 12px',
    fontSize: 18,
    borderRadius: 8,
    transition: 'opacity 0.15s',
  },
  schoolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 0',
  },
  schoolRowLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginRight: 4,
    flexShrink: 0,
  },
  schoolBtn: {
    flex: 1,
    padding: '6px 8px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  schoolBtnActive: {
    color: '#fff',
    border: '1px solid transparent',
    fontWeight: 700,
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

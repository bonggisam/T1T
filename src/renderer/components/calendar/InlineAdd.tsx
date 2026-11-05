import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useComciganStore } from '../../store/comciganStore';
import { usePersonalEventStore } from '../../store/personalEventStore';
import { usePersonalHidden } from '../../store/privacyStore';
import { useUIStore } from '../../store/uiStore';
import { parseInlineTitle } from '../../utils/pasteEventParser';
import { showToast } from '../common/Toast';

const WIDTH = 240;

interface InlineAddProps {
  day: Date;
  /** 더블클릭한 칸의 위치 */
  anchor: { left: number; top: number; bottom: number };
  /** 교시 줄에서 열었으면 그 시각으로 시작한다 */
  startMin?: number;
  endMin?: number;
  onClose: () => void;
  /** 자세히 쓰기. 그날이 선택된 채로 입력 창을 연다 */
  onMorePersonal?: () => void;
}

/**
 * 칸을 더블클릭하면 그 자리에서 제목만 쓰고 저장한다. "3시 회의", "3교시 공개수업"처럼 시각도 읽는다.
 * 잘못 눌러 공유되지 않도록 기본은 개인 일정이다.
 * 가린 동안에는 개인 일정을 만들지 않으며, 평소처럼 쓰고 Enter를 눌러 공유되지 않게 "공유"를 직접 눌러야 저장된다.
 */
export function InlineAdd({ day, anchor, startMin, endMin, onClose, onMorePersonal }: InlineAddProps) {
  const user = useAuthStore((s) => s.user);
  const addEvent = useCalendarStore((s) => s.addEvent);
  const setSelectedDate = useCalendarStore((s) => s.setSelectedDate);
  const setShowEventModal = useCalendarStore((s) => s.setShowEventModal);
  const addPersonalEvent = usePersonalEventStore((s) => s.addPersonalEvent);
  const classTimes = useComciganStore((s) => s.timetableData?.classTimes);
  const viewingSchool = useUIStore((s) => s.viewingSchool);
  const hidden = usePersonalHidden();
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'personal' | 'shared' | null>(hidden ? null : 'personal');
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  async function save() {
    const trimmed = text.trim();
    if (!trimmed || !user || saving || !scope) return;
    const parsed = parseInlineTitle(trimmed.slice(0, 100), classTimes ?? []);
    const from = parsed.startMin ?? startMin ?? null;
    const to = parsed.startMin !== null ? parsed.endMin : endMin ?? (from !== null ? from + 60 : null);
    const start = new Date(day);
    const end = new Date(day);
    if (from !== null && to !== null) {
      start.setHours(Math.floor(from / 60), from % 60, 0, 0);
      end.setHours(Math.floor(to / 60), to % 60, 0, 0);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 0, 0);
    }
    const allDay = from === null;

    setSaving(true);
    try {
      if (scope === 'personal') {
        await addPersonalEvent(user.id, {
          title: parsed.title,
          description: '',
          startDate: start,
          endDate: end,
          allDay,
          source: 'local',
          externalId: null,
          checklist: [],
          color: user.profileColor || '#4A90E2',
        });
      } else {
        const ownSchool = user.school === 'taeseong_middle' || user.school === 'taeseong_high' ? user.school : undefined;
        await addEvent({
          title: parsed.title,
          description: '',
          startDate: start,
          endDate: end,
          allDay,
          category: 'event',
          school: viewingSchool === 'all' ? ownSchool ?? 'all' : viewingSchool,
          creatorSchool: ownSchool,
          createdBy: user.id,
          adminName: user.name,
          adminColor: user.profileColor || '#4A90E2',
          repeat: null,
          attachments: [],
          checklist: [],
          readBy: {},
        });
      }
      onClose();
    } catch (err) {
      console.error('[InlineAdd] save failed:', err);
      showToast('일정을 저장하지 못했습니다', 'error');
      setSaving(false);
    }
  }

  function openFull() {
    const selected = new Date(day);
    if (startMin !== undefined) selected.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    setSelectedDate(selected);
    onClose();
    if (scope === 'personal') onMorePersonal?.();
    else setShowEventModal(true);
  }

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8));
  const below = anchor.bottom + 110 < window.innerHeight;
  const position: React.CSSProperties = below
    ? { left, top: anchor.bottom + 2, width: Math.min(WIDTH, window.innerWidth - 16) }
    : { left, bottom: window.innerHeight - anchor.top + 2, width: Math.min(WIDTH, window.innerWidth - 16) };

  return (
    <div ref={boxRef} className="menu-pop" style={{ ...position, padding: 8 }} role="dialog" aria-label={`${format(day, 'M월 d일')} 일정 입력`}>
      <input
        autoFocus
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        }}
        placeholder={`${format(day, 'M/d')} 일정 (예: 3시 회의)`}
        aria-label="일정 제목"
        maxLength={100}
        style={styles.input}
      />
      <div style={styles.row}>
        <div className="seg" role="group" aria-label="공유 범위">
          <button
            type="button"
            onClick={() => setScope('personal')}
            aria-pressed={scope === 'personal'}
            disabled={hidden}
            title={hidden ? '개인 일정을 가린 동안에는 만들 수 없습니다' : '나만 봅니다'}
          >
            개인
          </button>
          <button type="button" onClick={() => setScope('shared')} aria-pressed={scope === 'shared'} title="선생님들과 공유합니다">공유</button>
        </div>
        <button type="button" onClick={openFull} style={styles.more}>자세히</button>
        <button type="button" onClick={save} disabled={!text.trim() || saving || !scope} style={{ ...styles.save, opacity: text.trim() && scope ? 1 : 0.5 }}>저장</button>
      </div>
      {!scope && <p role="status" style={styles.hint}>개인 일정을 가린 동안에는 개인 일정을 만들 수 없습니다. 모두에게 보이게 하려면 공유를 누르세요.</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    width: '100%',
    padding: '6px 8px',
    fontSize: 'var(--fs-control)',
    border: '1px solid var(--accent)',
    borderRadius: 7,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  more: {
    marginLeft: 'auto',
    padding: '3px 6px',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--fs-body)',
    cursor: 'pointer',
  },
  hint: {
    margin: '6px 2px 0',
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },
  save: {
    padding: '3px 10px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

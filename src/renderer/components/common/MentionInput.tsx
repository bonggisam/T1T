import React, { useState, useRef, useEffect } from 'react';

import { useUsersStore } from '../../store/usersStore';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/**
 * @를 입력하면 사용자 목록 팝업이 뜨는 텍스트 입력.
 */
export function MentionInput({ value, onChange, onSubmit, placeholder, disabled, style }: MentionInputProps) {
  const { users } = useUsersStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [popupPosition, setPopupPosition] = useState<'top' | 'bottom'>('top');

  useEffect(() => {
    if (mentionQuery !== null && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      // input이 화면 상단 절반이면 popup을 아래에, 아니면 위에
      setPopupPosition(rect.top < window.innerHeight / 2 ? 'bottom' : 'top');
    }
  }, [mentionQuery]);

  const filteredUsers = mentionQuery !== null
    ? users
        .filter((u) => u.name.includes(mentionQuery) || u.email.startsWith(mentionQuery))
        .sort((a, b) => {
          // 시작 매칭 우선, 그다음 이름 가나다순
          const aStart = a.name.startsWith(mentionQuery);
          const bStart = b.name.startsWith(mentionQuery);
          if (aStart && !bStart) return -1;
          if (!aStart && bStart) return 1;
          return a.name.localeCompare(b.name, 'ko');
        })
        .slice(0, 5)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    onChange(text);
    // @ 이후 텍스트 추출
    const cursor = e.target.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const match = before.match(/@([^\s@]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setSelectedIdx(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(name: string) {
    if (!inputRef.current) return;
    const cursor = inputRef.current.selectionStart ?? value.length;
    const before = value.slice(0, cursor).replace(/@[^\s@]*$/, `@${name} `);
    const after = value.slice(cursor);
    onChange(before + after);
    setMentionQuery(null);
    setTimeout(() => {
      inputRef.current?.focus();
      const pos = before.length;
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionQuery !== null && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filteredUsers.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredUsers[selectedIdx].name);
        return;
      }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={style}
      />
      {mentionQuery !== null && filteredUsers.length > 0 && (
        <div style={{
          ...mStyles.popup,
          ...(popupPosition === 'top'
            ? { bottom: '100%', marginBottom: 4 }
            : { top: '100%', marginTop: 4 }),
        }}>
          {filteredUsers.map((u, i) => (
            <div
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(u.name); }}
              style={{
                ...mStyles.item,
                background: i === selectedIdx ? 'var(--bg-hover)' : 'transparent',
              }}
            >
              <span style={{
                ...mStyles.avatar,
                background: u.profileColor || 'var(--accent)',
              }}>{u.name.charAt(0)}</span>
              <span style={mStyles.name}>{u.name}</span>
              <span style={mStyles.school}>{u.school === 'taeseong_high' ? '고' : u.school === 'taeseong_middle' ? '중' : '?'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 멘션 패턴: 공백 또는 문자열 시작 뒤의 @이름 (이메일 내부 @ 제외).
 * 한글·영문·숫자·언더스코어 이름만 매칭.
 */
const MENTION_RE = /(^|\s)@([\w가-힣]+)/g;

/**
 * 텍스트 내 @이름 패턴을 React 요소로 렌더링.
 */
export function renderMentions(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const matchStart = m.index! + m[1].length; // 선행 공백 제외
    if (matchStart > lastIdx) out.push(<React.Fragment key={key++}>{text.slice(lastIdx, matchStart)}</React.Fragment>);
    out.push(<span key={key++} style={{ color: 'var(--accent)', fontWeight: 600 }}>@{m[2]}</span>);
    lastIdx = matchStart + 1 + m[2].length;
  }
  if (lastIdx < text.length) out.push(<React.Fragment key={key++}>{text.slice(lastIdx)}</React.Fragment>);
  return out;
}

/**
 * 텍스트에서 멘션된 사용자 이름 추출 (이메일 @ 제외).
 */
export function extractMentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) out.push(m[2]);
  return out;
}

const mStyles: Record<string, React.CSSProperties> = {
  popup: {
    position: 'absolute', left: 0, right: 0,
    padding: 4, borderRadius: 8,
    background: 'var(--bg-modal, #fff)',
    border: '1px solid var(--border-color)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    zIndex: 50,
    maxHeight: 180, overflowY: 'auto',
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 8px', borderRadius: 6,
    cursor: 'pointer', fontSize: 12,
  },
  avatar: {
    width: 18, height: 18, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 10, fontWeight: 700,
  },
  name: { fontSize: 12, color: 'var(--text-primary)', flex: 1 },
  school: { fontSize: 9, color: 'var(--text-muted)' },
};

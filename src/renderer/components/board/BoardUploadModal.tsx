import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import type { BoardGroup, BoardPost, School } from '@shared/types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useAuthStore } from '../../store/authStore';
import { BOARD_GROUP_LABELS, useBoardStore } from '../../store/boardStore';
import { useKeyphoneStore } from '../../store/keyphoneStore';
import {
  BOARD_MAX_IMAGES, BoardImageError, isImageFile, prepareBoardImage, type PreparedBoardImage,
} from '../../utils/boardImage';
import { showToast } from '../common/Toast';

const SUBJECTS = ['국어', '영어', '수학', '사회', '역사', '도덕', '과학', '기술·가정', '정보', '체육', '음악', '미술', '한문', '진로'];

const SCHOOLS: Array<{ value: School | 'all'; label: string }> = [
  { value: 'taeseong_middle', label: '태성중' },
  { value: 'taeseong_high', label: '태성고' },
  { value: 'all', label: '양교' },
];

interface PendingImage extends PreparedBoardImage {
  key: string;
  url: string;
  name: string;
}

interface BoardUploadModalProps {
  posts: BoardPost[];
  initialGroup: BoardGroup;
  initialTab: string;
  initialFiles?: File[];
  onClose: () => void;
  /** 올린 탭을 알려 준다 */
  onDone: (group: BoardGroup, tab: string) => void;
}

/** 사진 올리기: 사진을 고르거나 끌어다 놓거나 붙여 넣고, 부서나 교과 탭을 정한다 */
export function BoardUploadModal({ posts, initialGroup, initialTab, initialFiles, onClose, onDone }: BoardUploadModalProps) {
  const user = useAuthStore((s) => s.user);
  const addPost = useBoardStore((s) => s.addPost);
  const keyphones = useKeyphoneStore((s) => s.entries);
  const ownSchool = user?.school === 'taeseong_middle' || user?.school === 'taeseong_high' ? user.school : 'all';
  const [group, setGroup] = useState<BoardGroup>(initialGroup);
  const [tab, setTab] = useState(initialTab);
  const [title, setTitle] = useState('');
  const [school, setSchool] = useState<School | 'all'>(ownSchool);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  // 창 안에서 시작한 끌기가 창 밖에서 끝나도 바깥 칸을 누른 것으로 온다
  const pressedInside = useRef(false);
  const open = useRef(true);
  // 사진을 읽는 동안에도 몇 장째인지 바로 알아야 한다
  const reserved = useRef(0);
  const urls = useRef(new Set<string>());

  // 부서 이름은 키폰 번호부에 적힌 이름을 제안한다
  useEffect(() => {
    const keyphone = useKeyphoneStore.getState();
    keyphone.subscribe();
    return () => keyphone.cleanup();
  }, []);

  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const names = useMemo(() => {
    const set = new Set(posts.filter((p) => p.group === group).map((p) => p.tab));
    if (group === 'subject') SUBJECTS.forEach((name) => set.add(name));
    else keyphones.forEach((entry) => { if (entry.department) set.add(entry.department); });
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [posts, group, keyphones]);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const problems: string[] = [];
    const pictures = files.filter(isImageFile);
    if (pictures.length < files.length) {
      problems.push(`사진이 아닌 파일 ${files.length - pictures.length}개는 뺐습니다. 한글, 엑셀, PDF 표는 화면을 캡처해 붙여 넣어 주세요.`);
    }
    const room = Math.max(0, BOARD_MAX_IMAGES - reserved.current);
    if (pictures.length > room) {
      problems.push(`글 하나에 ${BOARD_MAX_IMAGES}장까지 올릴 수 있어 ${pictures.length - room}장은 뺐습니다.`);
    }
    const taken = pictures.slice(0, room);
    reserved.current += taken.length;
    setNotice(problems.join(' '));
    setError('');
    setPreparing((count) => count + taken.length);
    for (const file of taken) {
      try {
        const prepared = await prepareBoardImage(file);
        if (!open.current) return;
        const url = URL.createObjectURL(prepared.blob);
        urls.current.add(url);
        setImages((current) => [...current, { ...prepared, url, name: file.name, key: `${Date.now()}-${Math.random()}` }]);
      } catch (err) {
        if (!open.current) return;
        reserved.current -= 1;
        const why = err instanceof BoardImageError ? err.message : '사진으로 읽지 못했습니다.';
        problems.push(`${file.name || '붙여 넣은 사진'}: ${why}`);
        setNotice(problems.join(' '));
      }
      setPreparing((count) => count - 1);
    }
  }, []);

  useEffect(() => {
    if (initialFiles?.length) addFiles(initialFiles);
    // 처음 열 때 한 번만 받는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 화면 캡처는 Ctrl+V로 붙여 넣는다
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  function requestClose() {
    if (saving) return;
    const typed = images.length > 0 || preparing > 0 || !!title.trim() || tab.trim() !== initialTab;
    if (typed && !window.confirm('올리지 않고 닫을까요?\n고른 사진과 입력한 내용이 사라집니다.')) return;
    onClose();
  }

  useEscapeKey(requestClose);

  function removeImage(key: string) {
    setImages((current) => {
      const target = current.find((image) => image.key === key);
      if (target) {
        URL.revokeObjectURL(target.url);
        urls.current.delete(target.url);
        reserved.current -= 1;
      }
      return current.filter((image) => image.key !== key);
    });
  }

  function moveImage(index: number, delta: number) {
    setImages((current) => {
      const next = [...current];
      const [picked] = next.splice(index, 1);
      next.splice(index + delta, 0, picked);
      return next;
    });
  }

  async function save() {
    const name = tab.trim();
    if (!user || saving) return;
    if (!name) {
      setError(`${BOARD_GROUP_LABELS[group]} 이름을 넣어 주세요.`);
      return;
    }
    if (images.length === 0) {
      setError('사진을 한 장 이상 넣어 주세요.');
      return;
    }
    setSaving(true);
    setProgress(0);
    setError('');
    try {
      await addPost({ group, tab: name, title: title.trim(), school }, images, user, setProgress);
      showToast(`사진 ${images.length}장을 올렸습니다`);
      onDone(group, name);
    } catch (err: any) {
      console.error('[Board] upload failed:', err);
      if (err?.code === 'permission-denied') setError('서버 규칙이 아직 적용되지 않아 올리지 못했습니다. 관리자에게 알려 주세요.');
      else setError(err?.message?.includes('인터넷') ? err.message : '올리지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      setSaving(false);
    }
  }

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="사진 올리기"
      onMouseDown={(e) => { pressedInside.current = e.target !== e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && !pressedInside.current) requestClose(); }}
    >
      <div
        className="glass-solid animate-slide-up"
        style={dragging ? { ...styles.modal, outline: '2px dashed var(--accent)', outlineOffset: -4 } : styles.modal}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { if (e.target === e.currentTarget) setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div style={styles.header}>
          <h3 style={styles.title}>사진 올리기</h3>
          <button type="button" onClick={requestClose} style={styles.closeBtn} aria-label="닫기"><X size={16} /></button>
        </div>

        <div style={styles.scroll}>
          <div style={styles.row}>
            <div className="seg" role="group" aria-label="구분">
              {(Object.keys(BOARD_GROUP_LABELS) as BoardGroup[]).map((value) => (
                <button key={value} type="button" aria-pressed={group === value} onClick={() => setGroup(value)}>{BOARD_GROUP_LABELS[value]}</button>
              ))}
            </div>
            <input
              value={tab}
              onChange={(e) => setTab(e.target.value)}
              list="board-tab-names"
              maxLength={20}
              placeholder={group === 'dept' ? '부서 이름 (예: 교무부)' : '교과 이름 (예: 수학)'}
              aria-label={`${BOARD_GROUP_LABELS[group]} 이름`}
              style={{ ...styles.input, flex: '1 1 150px' }}
            />
            <datalist id="board-tab-names">
              {names.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div style={styles.row}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="제목 (없어도 됩니다. 예: 2학기 2차 지필평가 감독표)"
              aria-label="제목"
              style={{ ...styles.input, flex: '1 1 220px' }}
            />
            <div className="seg" role="group" aria-label="학교">
              {SCHOOLS.map(({ value, label }) => (
                <button key={value} type="button" aria-pressed={school === value} onClick={() => setSchool(value)}>{label}</button>
              ))}
            </div>
          </div>

          <button type="button" style={styles.pick} onClick={() => picker.current?.click()}>
            <ImagePlus size={18} />
            <span><b>사진 고르기</b> (여러 장 가능)</span>
            <span style={styles.pickHint}>끌어다 놓거나, 화면을 캡처해 Ctrl+V로 붙여 넣어도 됩니다.</span>
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="사진 파일"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />

          {notice && <p role="status" style={styles.warn}>{notice}</p>}
          {preparing > 0 && <p role="status" style={styles.note}>사진 {preparing}장을 준비하는 중입니다...</p>}

          {images.length > 0 && (
            <ul style={styles.thumbs} aria-label="고른 사진">
              {images.map((image, index) => (
                <li key={image.key} style={styles.thumb}>
                  <img src={image.url} alt={`${index + 1}번째 사진`} style={styles.thumbImg} />
                  <span style={styles.thumbNum}>{index + 1}</span>
                  <div style={styles.thumbBar}>
                    <button type="button" style={styles.thumbBtn} disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label={`${index + 1}번째 사진 앞으로`}><ChevronLeft size={13} /></button>
                    <button type="button" style={styles.thumbBtn} disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} aria-label={`${index + 1}번째 사진 뒤로`}><ChevronRight size={13} /></button>
                    <button type="button" style={styles.thumbBtn} onClick={() => removeImage(image.key)} aria-label={`${index + 1}번째 사진 빼기`}><X size={13} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p style={styles.note}>모든 선생님이 볼 수 있습니다. 시험 문제, 평가 자료, 개인 사유가 사진에 들어 있지 않은지 확인해 주세요.</p>
          {error && <p role="alert" style={styles.error}>{error}</p>}
        </div>

        <div style={styles.footer}>
          <button type="button" onClick={requestClose} disabled={saving} style={styles.cancel}>취소</button>
          <button type="button" onClick={save} disabled={saving || preparing > 0} style={{ ...styles.save, opacity: saving || preparing > 0 ? 0.6 : 1 }}>
            {saving ? `${progress} / ${images.length}장 올리는 중...` : images.length > 0 ? `${images.length}장 올리기` : '올리기'}
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
    maxWidth: 560,
    maxHeight: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 14,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 'var(--fs-subtitle)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    display: 'flex',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    padding: '2px 4px',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  input: {
    padding: '5px 8px',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
    minWidth: 0,
  },
  pick: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    padding: '14px 10px',
    flexShrink: 0,
    border: '1.5px dashed var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    cursor: 'pointer',
  },
  pickHint: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  thumbs: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
    gap: 6,
    flexShrink: 0,
  },
  thumb: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
  },
  thumbImg: {
    display: 'block',
    width: '100%',
    aspectRatio: '4 / 3',
    objectFit: 'contain',
    background: '#fff',
  },
  thumbNum: {
    position: 'absolute',
    top: 3,
    left: 3,
    minWidth: 16,
    padding: '0 4px',
    borderRadius: 8,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: 'var(--fs-tiny)',
    fontWeight: 700,
    lineHeight: '16px',
    textAlign: 'center',
  },
  thumbBar: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 2px',
  },
  thumbBtn: {
    display: 'flex',
    padding: 3,
    border: 'none',
    borderRadius: 4,
    background: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  note: {
    margin: 0,
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  warn: {
    margin: 0,
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    fontWeight: 600,
    color: 'var(--warning)',
    flexShrink: 0,
  },
  error: {
    margin: 0,
    fontSize: 'var(--fs-body)',
    lineHeight: 1.4,
    fontWeight: 600,
    color: 'var(--danger)',
    flexShrink: 0,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  cancel: {
    padding: '6px 12px',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    cursor: 'pointer',
  },
  save: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

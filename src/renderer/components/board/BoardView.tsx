import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { BoardGroup, BoardImageRef, BoardPost, School } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { BOARD_GROUP_LABELS, canManageBoardPost, loadBoardImage, useBoardStore } from '../../store/boardStore';
import { isImageFile } from '../../utils/boardImage';
import { showToast } from '../common/Toast';
import { BoardImageViewer, type BoardViewerItem } from './BoardImageViewer';
import { BoardUploadModal } from './BoardUploadModal';

const ALL_TAB = 'all';
const GROUPS: BoardGroup[] = ['dept', 'subject'];
const SCHOOLS: Array<{ value: School | 'all'; label: string }> = [
  { value: 'taeseong_middle', label: '태성중' },
  { value: 'taeseong_high', label: '태성고' },
  { value: 'all', label: '전체' },
];
const SCHOOL_NAMES: Record<string, string> = { taeseong_middle: '태성중', taeseong_high: '태성고', all: '양교' };

const tabKey = (group: BoardGroup, tab: string) => `${group}:${tab}`;

function countImages(posts: BoardPost[]): number {
  return posts.reduce((sum, post) => sum + post.images.length, 0);
}

/** 시험감독 게시판: 부서, 교과 탭을 골라 올려 둔 사진을 본다 */
export function BoardView({ onBack }: { onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  const posts = useBoardStore((s) => s.posts);
  const loaded = useBoardStore((s) => s.loaded);
  const denied = useBoardStore((s) => s.denied);
  const deletePost = useBoardStore((s) => s.deletePost);
  const ownSchool = user?.school === 'taeseong_middle' || user?.school === 'taeseong_high' ? user.school : 'all';
  const [school, setSchool] = useState<School | 'all'>(ownSchool);
  const [selected, setSelected] = useState(ALL_TAB);
  const [upload, setUpload] = useState<{ files?: File[] } | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    const board = useBoardStore.getState();
    board.subscribe();
    return () => board.cleanup();
  }, []);

  const inSchool = useMemo(
    () => posts.filter((post) => school === 'all' || post.school === 'all' || post.school === school),
    [posts, school],
  );

  const tabs = useMemo(() => {
    const out: Record<BoardGroup, Array<{ name: string; count: number }>> = { dept: [], subject: [] };
    for (const group of GROUPS) {
      const counts = new Map<string, number>();
      inSchool.filter((post) => post.group === group).forEach((post) => {
        counts.set(post.tab, (counts.get(post.tab) ?? 0) + post.images.length);
      });
      out[group] = [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
    return out;
  }, [inSchool]);

  // 고른 탭의 글이 없어지면 전체로 돌아간다
  const exists = selected === ALL_TAB || inSchool.some((post) => tabKey(post.group, post.tab) === selected);
  const current = exists ? selected : ALL_TAB;
  const visible = useMemo(
    () => (current === ALL_TAB ? inSchool : inSchool.filter((post) => tabKey(post.group, post.tab) === current)),
    [inSchool, current],
  );

  const viewerItems = useMemo<BoardViewerItem[]>(
    () => visible.flatMap((post) => post.images.map((image) => ({ id: image.id, label: post.title || post.tab }))),
    [visible],
  );

  const openImage = useCallback((id: string) => {
    const index = viewerItems.findIndex((item) => item.id === id);
    if (index >= 0) setViewing(index);
  }, [viewerItems]);

  async function remove(post: BoardPost) {
    const name = post.title || post.tab;
    if (!window.confirm(`"${name}" 글과 사진 ${post.images.length}장을 지울까요?\n지우면 되돌릴 수 없습니다.`)) return;
    try {
      await deletePost(post);
      showToast('글을 지웠습니다');
    } catch (err) {
      console.error('[Board] delete failed:', err);
      showToast('글을 지우지 못했습니다', 'error');
    }
  }

  const [group, tabName] = current === ALL_TAB
    ? ['dept' as BoardGroup, '']
    : [current.slice(0, current.indexOf(':')) as BoardGroup, current.slice(current.indexOf(':') + 1)];

  return (
    <div
      style={styles.container}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(isImageFile);
        if (files.length > 0 && !denied) setUpload({ files });
      }}
    >
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} aria-label="달력으로 돌아가기"><ArrowLeft size={14} /></button>
        <h3 style={styles.heading}>시험감독</h3>
        <div className="seg" role="group" aria-label="학교">
          {SCHOOLS.map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={school === value} onClick={() => setSchool(value)}>{label}</button>
          ))}
        </div>
        {!denied && <button onClick={() => setUpload({})} style={styles.addBtn}><Plus size={13} />올리기</button>}
      </div>

      {inSchool.length > 0 && (
        <div style={styles.tabs} role="tablist" aria-label="부서와 교과">
          <TabButton label="전체" count={countImages(inSchool)} active={current === ALL_TAB} onClick={() => setSelected(ALL_TAB)} />
          {GROUPS.map((key) => tabs[key].length > 0 && (
            <React.Fragment key={key}>
              <span style={styles.groupLabel}>{BOARD_GROUP_LABELS[key]}</span>
              {tabs[key].map(({ name, count }) => (
                <TabButton
                  key={name}
                  label={name}
                  count={count}
                  active={current === tabKey(key, name)}
                  onClick={() => setSelected(tabKey(key, name))}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={styles.body}>
        {denied && <p style={styles.warn}>게시판을 불러오지 못했습니다. 서버 규칙 적용 여부를 관리자에게 확인해 주세요.</p>}
        {!loaded && !denied && <p style={styles.note}>불러오는 중입니다...</p>}
        {loaded && !denied && visible.length === 0 && (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>아직 올린 사진이 없습니다.</p>
            <p style={styles.note}>올리기를 눌러 감독표 사진을 올려 주세요. 부서나 교과 이름이 탭이 됩니다.</p>
            <p style={styles.note}>한글, 엑셀, PDF 표는 화면을 캡처해 Ctrl+V로 붙여 넣으면 됩니다.</p>
          </div>
        )}
        {visible.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            showTab={current === ALL_TAB}
            canManage={canManageBoardPost(post, user)}
            onDelete={() => remove(post)}
            onOpen={openImage}
          />
        ))}
      </div>

      {upload && (
        <BoardUploadModal
          posts={posts}
          initialGroup={group}
          initialTab={tabName}
          initialFiles={upload.files}
          onClose={() => setUpload(null)}
          onDone={(doneGroup, doneTab) => {
            setUpload(null);
            setSelected(tabKey(doneGroup, doneTab));
          }}
        />
      )}
      {viewing !== null && <BoardImageViewer items={viewerItems} startIndex={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function TabButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={active ? { ...styles.tab, ...styles.tabActive } : styles.tab}
    >
      {label}<span style={active ? { ...styles.tabCount, color: 'inherit' } : styles.tabCount}>{count}</span>
    </button>
  );
}

function PostCard({ post, showTab, canManage, onDelete, onOpen }: {
  post: BoardPost;
  showTab: boolean;
  canManage: boolean;
  onDelete: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <article style={styles.card}>
      <div style={styles.cardHead}>
        <div style={styles.cardText}>
          <b style={styles.cardTitle}>{post.title || post.tab}</b>
          <span style={styles.cardMeta}>
            {showTab && post.title ? `${post.tab} · ` : ''}{SCHOOL_NAMES[post.school] ?? ''} · {post.createdByName} · {post.createdAt ? format(post.createdAt, 'M월 d일 (EEE) HH:mm', { locale: ko }) : '방금'} · {post.images.length}장
          </span>
        </div>
        {canManage && (
          <button type="button" onClick={onDelete} style={styles.iconBtn} aria-label={`${post.title || post.tab} 글 지우기`} title="글 지우기"><Trash2 size={14} /></button>
        )}
      </div>
      {post.images.map((image, index) => (
        <BoardImage key={image.id} image={image} alt={`${post.title || post.tab} ${index + 1}번째 사진`} onOpen={() => onOpen(image.id)} />
      ))}
    </article>
  );
}

/** 화면 가까이 왔을 때 받는다. 사진 한 장이 문서 읽기 한 번이다 */
function BoardImage({ image, alt, onOpen }: { image: BoardImageRef; alt: string; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    setFailed(false);
    loadBoardImage(image.id).then(setUrl).catch((err) => {
      console.warn('[Board] image load failed:', err);
      setFailed(true);
    });
  }, [image.id]);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [load]);

  const ratio = image.width && image.height ? `${image.width} / ${image.height}` : '4 / 3';
  if (failed) {
    return (
      <div style={{ ...styles.imageBox, ...styles.imageFailed, aspectRatio: ratio }}>
        <span>사진을 불러오지 못했습니다.</span>
        <button type="button" onClick={load} style={styles.retry}>다시 시도</button>
      </div>
    );
  }
  return (
    <button ref={box} type="button" onClick={onOpen} disabled={!url} style={{ ...styles.imageBox, aspectRatio: ratio, cursor: url ? 'zoom-in' : 'default' }} aria-label={`${alt} 크게 보기`}>
      {url && <img src={url} alt={alt} style={styles.image} />}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  backBtn: {
    display: 'flex',
    padding: 4,
    border: 'none',
    borderRadius: 6,
    background: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  heading: {
    flex: 1,
    margin: 0,
    minWidth: 60,
    fontSize: 'var(--fs-subtitle)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '4px 10px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabs: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px 5px',
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  groupLabel: {
    marginLeft: 6,
    fontSize: 'var(--fs-label)',
    fontWeight: 700,
    color: 'var(--text-muted)',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 9px',
    border: '1px solid var(--border-color)',
    borderRadius: 999,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    border: '1px solid var(--accent)',
    background: 'var(--accent)',
    color: 'var(--on-accent)',
  },
  tabCount: {
    fontSize: 'var(--fs-label)',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--text-muted)',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '10px 12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  note: {
    margin: 0,
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
  },
  warn: {
    margin: 0,
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    fontWeight: 600,
    color: 'var(--warning)',
  },
  empty: {
    margin: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    textAlign: 'center',
  },
  emptyTitle: {
    margin: 0,
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    flexShrink: 0,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  cardTitle: {
    fontSize: 'var(--fs-control)',
    color: 'var(--text-primary)',
  },
  cardMeta: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-muted)',
  },
  iconBtn: {
    display: 'flex',
    flexShrink: 0,
    padding: 4,
    border: 'none',
    borderRadius: 6,
    background: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  imageBox: {
    display: 'block',
    width: '100%',
    padding: 0,
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  image: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#fff',
  },
  imageFailed: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  retry: {
    padding: '3px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    cursor: 'pointer',
  },
};

import { create } from 'zustand';
import {
  addDoc, Bytes, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query,
  serverTimestamp, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../utils/firebase';
import { assertOnline } from '../utils/online';
import { notifyAllUsers } from '../utils/notifications';
import type { PreparedBoardImage } from '../utils/boardImage';
import type { BoardGroup, BoardImageRef, BoardPost, School, User } from '@shared/types';

const POSTS = 'board_posts';
const IMAGES = 'board_images';
const POST_LIMIT = 300;

export const BOARD_GROUP_LABELS: Record<BoardGroup, string> = { dept: '부서', subject: '교과' };

export interface NewBoardPost {
  group: BoardGroup;
  tab: string;
  title: string;
  school: School | 'all';
}

export function canManageBoardPost(post: Pick<BoardPost, 'createdBy'>, user?: Pick<User, 'id' | 'role'> | null): boolean {
  if (!user) return false;
  return post.createdBy === user.id || user.role === 'admin' || user.role === 'super_admin';
}

function toPost(id: string, data: Record<string, any>): BoardPost {
  return {
    id,
    group: data.group === 'subject' ? 'subject' : 'dept',
    tab: data.tab || '',
    title: data.title || '',
    school: data.school || 'all',
    images: Array.isArray(data.images) ? data.images : [],
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
  };
}

// 한 번 받은 사진은 앱을 끌 때까지 다시 받지 않는다. 사진 한 장이 문서 읽기 한 번이다.
const imageUrls = new Map<string, Promise<string>>();

export function loadBoardImage(id: string): Promise<string> {
  const cached = imageUrls.get(id);
  if (cached) return cached;
  const load = (async () => {
    const snap = await getDoc(doc(db, IMAGES, id));
    if (!snap.exists()) throw new Error('사진이 없습니다');
    const data = snap.data();
    return URL.createObjectURL(new Blob([data.data.toUint8Array()], { type: data.mime }));
  })();
  // 실패는 기억하지 않는다. 다시 시도하면 새로 받는다
  load.catch(() => imageUrls.delete(id));
  imageUrls.set(id, load);
  return load;
}

function forgetImage(id: string): void {
  imageUrls.get(id)?.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  imageUrls.delete(id);
}

interface BoardState {
  posts: BoardPost[];
  loaded: boolean;
  denied: boolean;
  unsubscribe: (() => void) | null;
  subscribe: () => void;
  cleanup: () => void;
  addPost: (
    post: NewBoardPost,
    images: PreparedBoardImage[],
    author: Pick<User, 'id' | 'name'>,
    onProgress?: (done: number) => void,
  ) => Promise<void>;
  deletePost: (post: BoardPost) => Promise<void>;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  posts: [],
  loaded: false,
  denied: false,
  unsubscribe: null,

  subscribe: () => {
    get().unsubscribe?.();
    set({ denied: false });
    const q = query(collection(db, POSTS), orderBy('createdAt', 'desc'), limit(POST_LIMIT));
    const unsubscribe = onSnapshot(q, (snap) => {
      // 방금 올려 서버 시각이 아직 없는 글이 맨 위에 온다
      const time = (post: BoardPost) => post.createdAt?.getTime() ?? Infinity;
      const posts = snap.docs.map((d) => toPost(d.id, d.data())).sort((a, b) => time(b) - time(a));
      set({ posts, loaded: true, denied: false });
    }, (err) => {
      console.warn('[Board] subscription error:', err);
      set({ loaded: true, denied: true });
    });
    set({ unsubscribe });
  },

  cleanup: () => {
    get().unsubscribe?.();
    set({ unsubscribe: null });
  },

  addPost: async (post, images, author, onProgress) => {
    assertOnline();
    // 사진을 다 올린 뒤에 글을 만든다. 올리는 중인 글이 다른 선생님께 보이지 않는다
    const saved: BoardImageRef[] = [];
    try {
      for (const image of images) {
        const ref = await addDoc(collection(db, IMAGES), {
          data: Bytes.fromUint8Array(new Uint8Array(await image.blob.arrayBuffer())),
          mime: image.blob.type,
          width: image.width,
          height: image.height,
          createdBy: author.id,
          createdAt: serverTimestamp(),
        });
        saved.push({ id: ref.id, width: image.width, height: image.height });
        onProgress?.(saved.length);
      }
      await addDoc(collection(db, POSTS), {
        ...post,
        images: saved,
        createdBy: author.id,
        createdByName: author.name.slice(0, 50),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      // 올리다 끊기면 먼저 올라간 사진을 지운다. 글이 없는 사진은 볼 길이 없다
      await Promise.allSettled(saved.map(({ id }) => deleteDoc(doc(db, IMAGES, id))));
      throw err;
    }
    // 게시판 새 사진은 학교와 상관없이 모든 선생님께 알린다
    const where = post.title ? `"${post.title}" (${post.tab})` : post.tab;
    const school = post.school === 'taeseong_middle' ? '태성중 ' : post.school === 'taeseong_high' ? '태성고 ' : '';
    notifyAllUsers('board_post', `시험감독 게시판: ${school}${where} 사진 ${saved.length}장`, undefined, 'all');
  },

  deletePost: async (post) => {
    assertOnline();
    const batch = writeBatch(db);
    batch.delete(doc(db, POSTS, post.id));
    post.images.forEach(({ id }) => batch.delete(doc(db, IMAGES, id)));
    await batch.commit();
    post.images.forEach(({ id }) => forgetImage(id));
  },
}));

import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import type { User, UserRole, UserStatus, UserSettings, School } from '@shared/types';
import { DEFAULT_PROFILE_COLOR, SUPER_ADMIN_PROFILE_COLOR } from '@shared/types';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  /** 로그인·가입 요청을 보내는 중. 입력한 값을 지우지 않도록 화면은 그대로 둔다 */
  submitting: boolean;
  /** 로그인은 돼 있는데 계정 정보를 읽지 못했다 (네트워크 없음 등). 화면이 기다리며 다시 읽는다 */
  profileUnavailable: boolean;
  retryProfile: () => void;
  error: string | null;
  initialize: () => () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, school: School) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
  /** 본인 설정을 Firestore와 스토어에 함께 저장한다. 실패하면 스토어를 되돌리고 오류를 던진다. */
  saveSettings: (settings: Partial<UserSettings>, profileColor?: string) => Promise<void>;
}

const defaultSettings: UserSettings = {
  notificationSound: true,
  alwaysOnTop: true,
  clickThrough: false,
  defaultView: 'month',
  theme: 'light',
  syncInterval: 0.25, // 15초 — Google Calendar 거의 실시간 체감 (창 hidden 시 자동 일시정지)
  connectedCalendars: [],
  reminderDefault: '30min',
};

let signupInProgress = false;

const PROFILE_RETRY_MS = 5000;
let profileRetryTimer: ReturnType<typeof setTimeout> | null = null;
let profileLoad: { uid: string; promise: Promise<ProfileResult> } | null = null;

type ProfileResult = 'ok' | 'missing' | 'failed';

function cancelProfileRetry(): void {
  if (profileRetryTimer) clearTimeout(profileRetryTimer);
  profileRetryTimer = null;
}

/**
 * 계정 문서를 읽어 화면을 정한다.
 * 읽지 못한 것을 로그아웃처럼 다루면, 네트워크가 붙기 전에 자동 실행된 PC가 로그인 화면에 갇힌다.
 */
function loadProfile(firebaseUser: FirebaseUser): Promise<ProfileResult> {
  if (profileLoad?.uid === firebaseUser.uid) return profileLoad.promise;
  cancelProfileRetry();
  const promise = (async (): Promise<ProfileResult> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (auth.currentUser?.uid !== firebaseUser.uid) return 'failed'; // 읽는 사이 로그아웃함
      if (!userDoc.exists()) {
        useAuthStore.setState({ firebaseUser, user: null, loading: false, profileUnavailable: false });
        return 'missing';
      }
      const data = userDoc.data();
      useAuthStore.setState({
        firebaseUser,
        user: {
          id: firebaseUser.uid,
          email: data.email,
          name: data.name,
          role: data.role as UserRole,
          status: data.status as UserStatus,
          school: (data.school as School) || 'taeseong_middle',
          profileColor: data.profileColor,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLogin: new Date(),
          settings: { ...defaultSettings, ...data.settings },
        },
        loading: false,
        profileUnavailable: false,
        error: null,
      });
      updateDoc(doc(db, 'users', firebaseUser.uid), {
        lastLogin: serverTimestamp(),
      }).catch((err) => console.warn('[Auth] lastLogin update failed:', err));
      return 'ok';
    } catch (err) {
      console.error('[Auth] User data load failed:', err);
      if (auth.currentUser?.uid !== firebaseUser.uid) return 'failed';
      useAuthStore.setState({ firebaseUser, user: null, loading: false, profileUnavailable: true });
      profileRetryTimer = setTimeout(() => { loadProfile(firebaseUser); }, PROFILE_RETRY_MS);
      return 'failed';
    } finally {
      profileLoad = null;
    }
  })();
  profileLoad = { uid: firebaseUser.uid, promise };
  return promise;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  error: null,

  submitting: false,
  profileUnavailable: false,

  retryProfile: () => {
    const current = auth.currentUser;
    if (current && !get().user) loadProfile(current);
  },

  initialize: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (signupInProgress) return;

      if (!firebaseUser) {
        cancelProfileRetry();
        set({ firebaseUser: null, user: null, loading: false, profileUnavailable: false });
        return;
      }

      await loadProfile(firebaseUser);
    });
    // 연결이 돌아오면 기다리지 않고 바로 읽는다
    const onOnline = () => get().retryProfile();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      cancelProfileRetry();
      unsubscribe();
    };
  },

  login: async (email, password) => {
    set({ submitting: true, error: null });
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // 같은 계정으로 다시 로그인하면 onAuthStateChanged가 오지 않는다. 직접 읽어 화면이 멈추지 않게 한다
      const result = await loadProfile(cred.user);
      if (result === 'missing') set({ error: '계정 정보를 찾지 못했습니다. 관리자에게 문의해 주세요.' });
    } catch (err: any) {
      set({ error: getErrorMessage(err.code) });
    } finally {
      set({ submitting: false });
    }
  },

  signup: async (email, password, name, school) => {
    set({ submitting: true, error: null });
    signupInProgress = true;

    let role: UserRole = 'teacher';
    let status: UserStatus = 'pending';

    try {
      // 1. Create Auth account
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2. Check if first user — wrapped in try/catch, failure = not first user
      try {
        await cred.user.getIdToken(true);
        const metaSnap = await getDoc(doc(db, 'app_meta', 'initialized'));
        if (!metaSnap.exists()) {
          role = 'super_admin';
          status = 'active';
        }
      } catch {
        // Can't determine → default teacher+pending (safe fallback)
      }

      // 3. Create user document (반드시 완료 후 상태 설정 — race 방지)
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        name,
        role,
        status,
        school,
        profileColor: role === 'super_admin' ? SUPER_ADMIN_PROFILE_COLOR : DEFAULT_PROFILE_COLOR,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        settings: defaultSettings,
      });

      // 4. If first user, lock it down (app_meta는 signup 완료의 일부)
      if (role === 'super_admin') {
        await setDoc(doc(db, 'app_meta', 'initialized'), {
          createdAt: serverTimestamp(),
          adminUid: cred.user.uid,
        });
      }

      // 5. 모든 Firestore 쓰기가 완료된 후에만 상태 설정
      const user: User = {
        id: cred.user.uid,
        email,
        name,
        role,
        status,
        school,
        profileColor: role === 'super_admin' ? SUPER_ADMIN_PROFILE_COLOR : DEFAULT_PROFILE_COLOR,
        createdAt: new Date(),
        lastLogin: new Date(),
        settings: defaultSettings,
      };

      set({ firebaseUser: cred.user, user, loading: false, profileUnavailable: false, error: null });
    } catch (err: any) {
      set({ error: getErrorMessage(err.code) });
    } finally {
      set({ submitting: false });
      signupInProgress = false;
    }
  },

  logout: async () => {
    // Google 토큰을 반드시 함께 끊는다 — 안 끊으면 공용 교무실 PC에서 다음에 로그인한 교사의
    // 개인 일정이 이전 교사의 Google 캘린더로 푸시되고, 이전 교사의 Google 일정이 화면에 보임.
    // ("개인 일정은 절대 다른 사람과 공유되면 안 됨" 원칙 위반) — 동적 import로 순환 의존 회피.
    try {
      const { disconnectGoogle } = await import('../utils/calendarSync');
      disconnectGoogle();
    } catch (err) { console.warn('[Auth] Google disconnect on logout failed:', err); }
    try { await signOut(auth); } catch (err) { console.warn('[Auth] Signout failed:', err); }
    cancelProfileRetry();
    set({ firebaseUser: null, user: null, loading: false, profileUnavailable: false });
    window.electronAPI?.clearWebSessions?.()?.catch?.(() => {});
    // 공용 PC에서 다음 교사가 볼 수 없게 이 PC에 남은 개인 일정을 지운다
    try {
      const { clearPersonalCache } = await import('../utils/offlineCache');
      await clearPersonalCache();
    } catch (err) { console.warn('[Auth] Personal cache clear failed:', err); }
  },

  resetPassword: async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      throw new Error(getErrorMessage(err.code));
    }
  },

  clearError: () => set({ error: null }),

  saveSettings: async (settings, profileColor) => {
    const before = get().user;
    if (!before) return;
    // 점 표기로 바뀐 값만 보낸다. settings 전체를 보내면 다른 PC에서 바꾼 값까지 덮어쓴다.
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings)) fields[`settings.${key}`] = value;
    if (profileColor) fields.profileColor = profileColor;

    set({
      user: {
        ...before,
        profileColor: profileColor || before.profileColor,
        settings: { ...before.settings, ...settings },
      },
    });
    try {
      await updateDoc(doc(db, 'users', before.id), fields);
    } catch (err) {
      // 그 사이 로그아웃하거나 다른 계정으로 바뀌었으면 이전 사용자 정보를 되살리지 않는다
      if (get().user?.id === before.id) set({ user: before });
      throw err;
    }
  },
}));

function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/email-already-in-use':
      return '이미 사용 중인 이메일입니다.';
    case 'auth/weak-password':
      return '비밀번호는 최소 8자 이상이어야 합니다.';
    case 'auth/invalid-email':
      return '유효하지 않은 이메일 형식입니다.';
    case 'auth/too-many-requests':
      return '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.';
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인해주세요.';
    default:
      return `오류가 발생했습니다 (${code || 'unknown'}). 다시 시도해주세요.`;
  }
}

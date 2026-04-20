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
import type { User, UserRole, UserStatus, UserSettings } from '@shared/types';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

const defaultSettings: UserSettings = {
  notificationSound: true,
  notificationBadge: true,
  transparency: 80,
  alwaysOnTop: true,
  clickThrough: false,
  defaultView: 'month',
  theme: 'light',
  syncInterval: 5,
  connectedCalendars: [],
  reminderDefault: '30min',
};

let signupInProgress = false;

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (signupInProgress) return;

      if (!firebaseUser) {
        set({ firebaseUser: null, user: null, loading: false });
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          set({
            firebaseUser,
            user: {
              id: firebaseUser.uid,
              email: data.email,
              name: data.name,
              role: data.role as UserRole,
              status: data.status as UserStatus,
              profileColor: data.profileColor,
              createdAt: data.createdAt?.toDate() || new Date(),
              lastLogin: new Date(),
              settings: { ...defaultSettings, ...data.settings },
            },
            loading: false,
            error: null,
          });
          updateDoc(doc(db, 'users', firebaseUser.uid), {
            lastLogin: serverTimestamp(),
          }).catch((err) => console.warn('[Auth] lastLogin update failed:', err));
        } else {
          set({ firebaseUser, user: null, loading: false });
        }
      } catch (err) {
        console.error('[Auth] User data load failed:', err);
        set({ firebaseUser, user: null, loading: false });
      }
    });
    return unsubscribe;
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      set({ loading: false, error: getErrorMessage(err.code) });
    }
  },

  signup: async (email, password, name) => {
    set({ loading: true, error: null });
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

      // 3. Create user document
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        name,
        role,
        status,
        profileColor: role === 'super_admin' ? '#FF6B6B' : '#4A90E2',
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        settings: defaultSettings,
      });

      // 4. If first user, lock it down
      if (role === 'super_admin') {
        await setDoc(doc(db, 'app_meta', 'initialized'), {
          createdAt: serverTimestamp(),
          adminUid: cred.user.uid,
        });
      }

      // 5. Set state directly
      const user: User = {
        id: cred.user.uid,
        email,
        name,
        role,
        status,
        profileColor: role === 'super_admin' ? '#FF6B6B' : '#4A90E2',
        createdAt: new Date(),
        lastLogin: new Date(),
        settings: defaultSettings,
      };

      set({ firebaseUser: cred.user, user, loading: false, error: null });
    } catch (err: any) {
      set({ loading: false, error: getErrorMessage(err.code) });
    } finally {
      signupInProgress = false;
    }
  },

  logout: async () => {
    try { await signOut(auth); } catch (err) { console.warn('[Auth] Signout failed:', err); }
    set({ firebaseUser: null, user: null, loading: false });
  },

  resetPassword: async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      throw new Error(getErrorMessage(err.code));
    }
  },

  clearError: () => set({ error: null }),
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

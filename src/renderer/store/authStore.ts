import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
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

// During signup, onAuthStateChanged fires before Firestore doc is ready.
// We use this flag to tell initialize() to wait for signup to finish.
let signupInProgress = false;

export const useAuthStore = create<AuthState>((set, _get) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // If signup is in progress, skip — signup() will set state itself
      if (signupInProgress) return;

      if (!firebaseUser) {
        set({ firebaseUser: null, user: null, loading: false });
        return;
      }

      // User is logged in — try to read their Firestore profile
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const user: User = {
            id: firebaseUser.uid,
            email: data.email,
            name: data.name,
            role: data.role as UserRole,
            status: data.status as UserStatus,
            profileColor: data.profileColor,
            createdAt: data.createdAt?.toDate() || new Date(),
            lastLogin: new Date(),
            settings: { ...defaultSettings, ...data.settings },
          };
          // Update lastLogin (non-blocking)
          updateDoc(doc(db, 'users', firebaseUser.uid), {
            lastLogin: serverTimestamp(),
          }).catch(() => {});

          set({ firebaseUser, user, loading: false, error: null });
        } else {
          // Auth account exists but no Firestore profile — back to login
          set({ firebaseUser, user: null, loading: false, error: null });
        }
      } catch {
        // Firestore read failed
        set({ firebaseUser, user: null, loading: false, error: null });
      }
    });
    return unsubscribe;
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the rest
    } catch (err: any) {
      set({ loading: false, error: getErrorMessage(err.code) });
    }
  },

  signup: async (email, password, name) => {
    set({ loading: true, error: null });
    signupInProgress = true;

    try {
      // 1. Create Auth account
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2. Force ID token to be ready for Firestore operations
      await cred.user.getIdToken(true);

      // 3. Check if this is the first user (app_meta/initialized doesn't exist)
      let isFirstUser = false;
      try {
        const metaSnap = await getDoc(doc(db, 'app_meta', 'initialized'));
        isFirstUser = !metaSnap.exists();
      } catch {
        // Can't read → assume not first user (safe default)
      }

      // 4. Create user document
      let role: UserRole;
      let status: UserStatus;

      if (isFirstUser) {
        role = 'super_admin';
        status = 'active';
        await setDoc(doc(db, 'users', cred.user.uid), {
          email,
          name,
          role,
          status,
          profileColor: '#FF6B6B',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          settings: defaultSettings,
        });
        // 5. Mark app as initialized so next user can't become admin
        await setDoc(doc(db, 'app_meta', 'initialized'), {
          createdAt: serverTimestamp(),
          adminUid: cred.user.uid,
        });
      } else {
        role = 'teacher';
        status = 'pending';
        await setDoc(doc(db, 'users', cred.user.uid), {
          email,
          name,
          role,
          status,
          profileColor: '#4A90E2',
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          settings: defaultSettings,
        });
      }

      // 4. Send verification email (non-blocking)
      sendEmailVerification(cred.user).catch(() => {});

      // 5. Set state directly (don't rely on onAuthStateChanged)
      const user: User = {
        id: cred.user.uid,
        email,
        name,
        role,
        status,
        profileColor: isFirstUser ? '#FF6B6B' : '#4A90E2',
        createdAt: new Date(),
        lastLogin: new Date(),
        settings: defaultSettings,
      };

      signupInProgress = false;
      set({ firebaseUser: cred.user, user, loading: false, error: null });
    } catch (err: any) {
      signupInProgress = false;
      set({ loading: false, error: getErrorMessage(err.code) });
    }
  },

  logout: async () => {
    try {
      await signOut(auth);
    } catch {
      // force clear state even if signOut fails
    }
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

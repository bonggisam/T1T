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
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, limit, query } from 'firebase/firestore';
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

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
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
            try {
              await updateDoc(doc(db, 'users', firebaseUser.uid), {
                lastLogin: serverTimestamp(),
              });
            } catch {
              // Non-blocking: lastLogin update may fail offline
            }
            set({ firebaseUser, user, loading: false, error: null });
          } else {
            set({ firebaseUser, user: null, loading: false });
          }
        } catch {
          set({ firebaseUser, user: null, loading: false });
        }
      } else {
        set({ firebaseUser: null, user: null, loading: false });
      }
    });
    return unsubscribe;
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      const message = getErrorMessage(err.code);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  signup: async (email, password, name) => {
    set({ loading: true, error: null });
    try {
      // Check if this is the very first user (= becomes super_admin)
      let isFirstUser = false;
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
        isFirstUser = usersSnap.empty;
      } catch {
        // If we can't check, default to normal teacher
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);

      const role: UserRole = isFirstUser ? 'super_admin' : 'teacher';
      const status: UserStatus = isFirstUser ? 'active' : 'pending';

      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        name,
        role,
        status,
        profileColor: isFirstUser ? '#FF6B6B' : undefined,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        settings: defaultSettings,
      });
      set({ loading: false });
    } catch (err: any) {
      const message = getErrorMessage(err.code);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  logout: async () => {
    await signOut(auth);
    set({ firebaseUser: null, user: null });
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
      return '등록되지 않은 이메일입니다.';
    case 'auth/wrong-password':
      return '비밀번호가 올바르지 않습니다.';
    case 'auth/email-already-in-use':
      return '이미 사용 중인 이메일입니다.';
    case 'auth/weak-password':
      return '비밀번호는 최소 8자 이상이어야 합니다.';
    case 'auth/invalid-email':
      return '유효하지 않은 이메일 형식입니다.';
    case 'auth/too-many-requests':
      return '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.';
    default:
      return '오류가 발생했습니다. 다시 시도해주세요.';
  }
}

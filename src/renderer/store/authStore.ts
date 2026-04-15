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

// Flag: skip next onAuthStateChanged (signup handles its own flow)
let skipNextAuthChange = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // During signup, we handle state manually to avoid race conditions
      if (skipNextAuthChange) {
        skipNextAuthChange = false;
        return;
      }

      if (firebaseUser) {
        // Retry reading user doc (may not exist immediately after signup)
        let attempts = 0;
        while (attempts < 3) {
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
                // Non-blocking
              }
              set({ firebaseUser, user, loading: false, error: null });
              return;
            }
          } catch {
            // Firestore read failed
          }
          attempts++;
          if (attempts < 3) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        // After retries, still no doc
        set({ firebaseUser, user: null, loading: false });
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
      // Check if this is the very first user via app_meta doc
      let isFirstUser = false;
      try {
        const metaDoc = await getDoc(doc(db, 'app_meta', 'initialized'));
        isFirstUser = !metaDoc.exists();
      } catch {
        // If we can't check, default to normal teacher
      }

      // Prevent onAuthStateChanged race condition
      skipNextAuthChange = true;

      const cred = await createUserWithEmailAndPassword(auth, email, password);

      const role: UserRole = isFirstUser ? 'super_admin' : 'teacher';
      const status: UserStatus = isFirstUser ? 'active' : 'pending';

      // Create user doc FIRST, before onAuthStateChanged can read it
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        name,
        role,
        status,
        profileColor: isFirstUser ? '#FF6B6B' : '#4A90E2',
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        settings: defaultSettings,
      });

      // Mark app as initialized (so next user won't become admin)
      if (isFirstUser) {
        try {
          await setDoc(doc(db, 'app_meta', 'initialized'), {
            createdAt: serverTimestamp(),
            adminUid: cred.user.uid,
          });
        } catch {
          // Non-blocking
        }
      }

      // Send verification email (non-blocking)
      sendEmailVerification(cred.user).catch(() => {});

      // Now manually set the user state (since we skipped onAuthStateChanged)
      const user: User = {
        id: cred.user.uid,
        email: email,
        name: name,
        role,
        status,
        profileColor: isFirstUser ? '#FF6B6B' : '#4A90E2',
        createdAt: new Date(),
        lastLogin: new Date(),
        settings: defaultSettings,
      };
      set({ firebaseUser: cred.user, user, loading: false, error: null });
    } catch (err: any) {
      skipNextAuthChange = false;
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
    case 'auth/invalid-credential':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인해주세요.';
    default:
      return `오류가 발생했습니다 (${code || 'unknown'}). 다시 시도해주세요.`;
  }
}

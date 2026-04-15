import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

// Debug: expose to window for console access
if (import.meta.env.DEV) {
  (window as any).__fb_auth = auth;
  (window as any).__fb_db = db;

  // Helper to create admin doc for current user
  (window as any).__createAdminDoc = async () => {
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const user = auth.currentUser;
    if (!user) { console.log('No user'); return; }
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      name: '관리자',
      role: 'super_admin',
      status: 'active',
      profileColor: '#FF6B6B',
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      settings: {
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
      },
    });
    console.log('Admin doc created for', user.uid);
    location.reload();
  };
}

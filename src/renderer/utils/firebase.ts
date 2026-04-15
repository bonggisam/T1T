import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase client config (safe to expose — protected by Firestore security rules)
const firebaseConfig = {
  apiKey: 'AIzaSyAKi1354TZ92-qMUD-QNAklFSfGmcRHgmA',
  authDomain: 'tonet-4813d.firebaseapp.com',
  projectId: 'tonet-4813d',
  storageBucket: 'tonet-4813d.firebasestorage.app',
  messagingSenderId: '607193357118',
  appId: '1:607193357118:web:03d0f1027ba31f3fa36a6f',
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

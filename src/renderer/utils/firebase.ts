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

// 보안: 이전 버전의 __createAdminDoc/__fb_auth/__fb_db 디버그 코드 제거됨.
// 관리자는 Firestore Console 또는 gh CLI로 직접 관리.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// ใช้ localStorage เป็น persistence เดียวของ Auth — ต้องประกาศตั้งแต่ init
// ไม่ใช่ setPersistence ทีหลัง: getAuth() เริ่ม init ด้วย IndexedDB เป็นตัวแรก
// เสมอ และบน iOS Safari การ open IDB ที่มี database เดิมอยู่แขวนเงียบได้
// (ไม่ success ไม่ error) ทำให้ onAuthStateChanged ไม่ emit เลยสักครั้ง —
// ฝั่งแอปไรเดอร์อาการคือ <LoadingSpinner /> ค้างถาวร เพราะ setAuthChecked
// ถูกเรียกในคอลแบ็กที่ไม่มีวันมาถึง (ดู App.tsx). การ setPersistence
// หลังจากนั้นมาช้าเกินไปเพราะต่อคิวหลัง init ที่แตะ IDB ไปแล้ว
// initializeAuth แบบนี้คือทางเดียวที่ไม่เปิด IDB เลย
//
// ยกมาจาก bkk-frontend-next/lib/firebase.ts (fix 22 ส.ค. 2569) ทั้งรูป —
// **ห้ามใส่ indexedDBLocalPersistence กลับเข้ามาใน array นี้** ไม่ว่าจะไว้
// ลำดับไหน เพราะ SDK จะลองตัวแรกที่ใช้ได้เสมอ = เปิด IDB = บั๊กเดิมกลับมา
//
// popupRedirectResolver ยกมาด้วยเพื่อให้รูปตรงกับต้นทาง: ค่า default ของ
// getAuth หายไปเมื่อใช้ initializeAuth วันนี้แอปไรเดอร์ยังไม่มี
// signInWithRedirect/Popup (ยืนยันด้วย grep แล้ว) แต่ถ้าวันหนึ่งมี จะได้ไม่
// พังเงียบแบบที่ CLAUDE.md ของ repo นั้นเตือนไว้
try {
  initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  // already-initialized (เช่น dev fast refresh ที่ app ตัวเดิมถูก reuse) —
  // instance เดิมใช้ต่อได้ผ่าน getAuth(app) ตามปกติ
}

export const auth = getAuth(app);
export const storage = getStorage(app);
// region ต้องตรงกับฝั่ง functions (asia-southeast1) ไม่งั้น callable หา endpoint ไม่เจอ
export const functions = getFunctions(app, "asia-southeast1");

// FCM - initialize only if supported (not in all browsers)
export const getFirebaseMessaging = async () => {
  const supported = await isSupported();
  if (supported) return getMessaging(app);
  return null;
};

// src/hooks/useAutoLogout.ts
import { useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../api/firebase';
import { logAuthEvent } from '../utils/authEvents';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const useAutoLogout = (isLoggedIn: boolean) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        // NOTE (PR 1): hook ตัวนี้ยังล้างการลงทะเบียนเครื่องอยู่ ซึ่งขัดกับ
        // หลักการข้อ 2 — การถอดมันทิ้งแล้วแทนด้วย usePinLock เป็นงานของ PR 2
        // (ข้อ 2.1) จงใจไม่แตะพฤติกรรมในนี้เพื่อให้ PR 1 อยู่ในขอบเขต
        logAuthEvent(localStorage.getItem('rider_id'), 'auto_logout_timeout', {
          idleMinutes: TIMEOUT_MS / 60000,
        });
        await signOut(auth);
        localStorage.removeItem('rider_id');
        localStorage.removeItem('device_pin');
        window.location.reload();
      }, TIMEOUT_MS);
    };

    const events = ['mousedown', 'touchstart', 'keydown', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [isLoggedIn]);
};

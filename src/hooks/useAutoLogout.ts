// src/hooks/useAutoLogout.ts
import { useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../api/firebase';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const useAutoLogout = (isLoggedIn: boolean) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
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

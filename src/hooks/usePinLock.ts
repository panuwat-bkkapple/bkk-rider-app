// src/hooks/usePinLock.ts
//
// แทน useAutoLogout (ลบทิ้งแล้วใน PR นี้) — เวลาเป็นตัวสั่ง **ล็อก** เท่านั้น
// ไม่มี signOut ที่ไหนในไฟล์นี้ และจะต้องไม่มีตลอดไป (หลักการข้อ 3)
//
// ต่างจากของเดิมสามอย่าง:
//   1. อ่านนาฬิกาจริงจาก timestamp ที่ประทับตอนแอปถูกซ่อน ไม่ใช่ setTimeout
//      ที่ iOS แช่/ฆ่าทิ้งได้ (ดู utils/pinLock.ts)
//   2. ทำงานตอน cold start ด้วย — แอปที่ถูก iOS ฆ่าแล้วเปิดใหม่วันรุ่งขึ้นจะ
//      ขอ PIN ซึ่งของเดิมไม่เคยทำ (timer ตายไปกับหน้าเว็บ)
//   3. ไม่แตะ rider_id / device_pin / Firebase session เลย — ปลดกลอนแล้ว
//      ไรเดอร์อยู่ที่เดิม งานยังโหลดต่อ ไม่ต้องกรอกอีเมลหรือตั้ง PIN ใหม่

import { useState, useEffect, useCallback } from 'react';
import { shouldLock, LAST_HIDDEN_KEY } from '../utils/pinLock';

const stamp = () => {
  try {
    localStorage.setItem(LAST_HIDDEN_KEY, String(Date.now()));
  } catch {
    // storage เต็ม / โหมดที่เขียนไม่ได้ — กลอนเป็นความสะดวก ไม่ใช่ด่านสิทธิ์
    // ปล่อยผ่านดีกว่าทำให้แอปพัง (Firebase session ยังคุมสิทธิ์จริงอยู่)
  }
};

const readLastHidden = (): string | null => {
  try {
    return localStorage.getItem(LAST_HIDDEN_KEY);
  } catch {
    return null;
  }
};

/**
 * @param enabled ล็อกได้ก็ต่อเมื่อเครื่องมี PIN ให้ปลด และไรเดอร์เข้าใช้งานอยู่
 *   ถ้าไม่มี device_pin การล็อกจะกลายเป็นจอที่ไม่มีทางผ่าน
 */
export const usePinLock = (enabled: boolean) => {
  // ประเมินตั้งแต่ mount — นี่คือเส้นทาง cold start ที่ของเดิมไม่มี
  const [locked, setLocked] = useState(() =>
    enabled ? shouldLock(readLastHidden(), Date.now()) : false
  );

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }

    const onHidden = () => stamp();

    const onVisible = () => {
      if (shouldLock(readLastHidden(), Date.now())) setLocked(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onHidden();
      else onVisible();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    // pagehide ด้วย เพราะ iOS ไม่ยิง visibilitychange เสมอไปตอนแอปถูกสลับออก
    // หรือถูกฆ่า — ถ้าไม่ประทับเวลาไว้ cold start ครั้งถัดไปจะไม่รู้ว่าห่างไปนานแค่ไหน
    window.addEventListener('pagehide', onHidden);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onHidden);
    };
  }, [enabled]);

  // ปลดกลอน = ประทับเวลาใหม่ ไม่ใช่ลบทิ้ง — ถ้าลบแล้วแอปถูกฆ่าโดยไม่ทัน
  // ยิง pagehide การเปิดครั้งถัดไปจะไม่มี timestamp ให้เทียบเลยแล้วไม่ล็อก
  // ทั้งที่ควรล็อก
  const unlock = useCallback(() => {
    stamp();
    setLocked(false);
  }, []);

  return { locked, unlock };
};

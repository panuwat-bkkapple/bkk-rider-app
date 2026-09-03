// src/utils/sessionState.ts
//
// ทางเดียวที่โค้ดชั้นล่าง (RTDB listener, callable) บอกชั้นบนว่า
// "session ใช้ไม่ได้แล้ว" — หลักการข้อ 4: ความล้มเหลวเรื่อง auth ต้องมองเห็นได้
// และกดต่อได้ ห้ามแสดงออกมาเป็น "ไม่มีงาน" หรือ "กรุณาลองใหม่"
//
// ทำไมเป็น module-level bus ไม่ใช่ prop/context: `useDatabase` เป็น hook ทั่วไป
// ที่ถูกเรียกจากหลายที่ (models, condition_sets, jobs) และ error handler ของมัน
// อยู่ลึกกว่า App หลายชั้น การร้อย callback ลงไปทุกชั้นแปลว่าทุก call site ต้อง
// รู้เรื่อง auth ซึ่งไม่ใช่เรื่องของมัน
//
// **dedupe เป็นคุณสมบัติที่ขาดไม่ได้ ไม่ใช่การปรับแต่ง** — ตอน token ตาย
// listener ทุกตัวจะ error พร้อมกัน (jobs, transactions, withdrawals,
// condition_sets) ถ้ายิงทุกครั้งจะได้ log ท่วมและ setState ซ้ำเป็นสิบรอบ

import { logAuthEvent, type AuthEventReason } from './authEvents';

type Listener = (reason: AuthEventReason) => void;

const listeners = new Set<Listener>();

// ยิงไปแล้วหรือยังในรอบนี้ — ล้างเมื่อ session กลับมาใช้ได้ (resetSessionLost)
let alreadyLost = false;

/** subscribe จาก App — คืนฟังก์ชัน unsubscribe */
export function onSessionLost(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * ประกาศว่า session ใช้ไม่ได้แล้ว — เขียน log หนึ่งแถวแล้วปลุก App
 * เรียกซ้ำระหว่างที่ยังไม่ถูก reset = ไม่ทำอะไร
 */
export function notifySessionLost(
  riderId: string | null | undefined,
  reason: AuthEventReason,
  extra?: Record<string, unknown>
): void {
  if (alreadyLost) return;
  alreadyLost = true;
  logAuthEvent(riderId, reason, extra);
  listeners.forEach((fn) => {
    try {
      fn(reason);
    } catch (err) {
      console.warn('[auth] session-lost listener threw:', (err as Error)?.message);
    }
  });
}

/** session กลับมาใช้ได้ (ล็อกอินสำเร็จ / auth ยิง user ออกมา) */
export function resetSessionLost(): void {
  alreadyLost = false;
}

/**
 * RTDB ปฏิเสธเพราะไม่มีสิทธิ์
 *
 * token ที่หมดอายุหรือถูกเพิกถอนทำให้ listener ทุกตัวได้ error ตัวนี้ ซึ่งเดิม
 * ถูกกลืนเป็น `setData([])` = จอบอก "ไม่มีงาน" ทั้งที่ความจริงคือหมดสิทธิ์
 */
export function isPermissionDenied(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '');
  return (
    code === 'PERMISSION_DENIED' ||
    code === 'permission-denied' ||
    message.includes('PERMISSION_DENIED') ||
    message.toLowerCase().includes('permission_denied')
  );
}

/**
 * callable ปฏิเสธที่ชั้น auth
 *
 * error แบบนี้ **ไม่มี `details`** ที่ engine ใส่มา `engineErrorCode` จึงคืน
 * null แล้วข้อความตกไปที่ "เกิดข้อผิดพลาด กรุณาลองใหม่" — คำแนะนำที่ไม่มีวัน
 * สำเร็จ ต้องดักก่อนถึงตรงนั้น
 */
export function isUnauthenticatedError(error: unknown): boolean {
  const err = error as { code?: unknown } | null;
  const code = String(err?.code ?? '');
  return code === 'unauthenticated' || code === 'functions/unauthenticated';
}

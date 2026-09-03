// src/utils/authEvents.ts
//
// บันทึกทุกครั้งที่ session หลุด พร้อม "เหตุผล" — หลักการข้อ 5 ของงานนี้
// (ทุกการเสีย session ต้องมี log ที่บอกเหตุ เพื่อเลิกเดา)
//
// ทำไมต้องมี: ก่อนหน้านี้ทั้งการกดออกจากระบบเอง การหมดเวลา และการที่ Firebase
// ยิง null ออกมา ให้ผลลัพธ์ปลายทางเหมือนกันหมด (กลับไปจอกรอกอีเมล) และเขียน
// console.warn บรรทัดเดียวกัน — ไล่ย้อนหลังจาก log จึงแยกสามกรณีนี้ไม่ออกเลย
//
// กฎเหล็กของไฟล์นี้: **ห้าม throw และห้าม block อะไรทั้งสิ้น** ทุก call site
// เป็นเส้นทางที่กำลังจะพาไรเดอร์ออกจากระบบอยู่แล้ว ถ้าการเขียน log ล้ม
// (ออฟไลน์ / rules ยังไม่ deploy / token ตายไปแล้ว ซึ่งเป็นเคสที่พบบ่อยที่สุด
// ของฟังก์ชันนี้พอดี) การหลุดต้องเดินต่อตามปกติ

import { ref, push, set } from 'firebase/database';
import { db } from '../api/firebase';

export type AuthEventReason =
  // Firebase ยิง null ออกมาเองขณะที่แอปคิดว่ายังล็อกอินอยู่
  | 'firebase_session_lost'
  // onAuthStateChanged ไม่ยิงเลยจนครบเพดานเวลา (อาการของ IDB แขวนบน iOS)
  | 'auth_check_timeout'
  // ไรเดอร์ล็อกอินผ่านจอ "เซสชันหมดอายุ" สำเร็จ — ปิดวงของเหตุการณ์ข้างบน
  | 'session_recovered'
  // ไรเดอร์กดออกจากระบบเอง
  | 'explicit_logout'
  // ตัวจับเวลา 30 นาทีของ useAutoLogout (PR 2 จะถอดออก)
  | 'auto_logout_timeout'
  // listener บน riders/{id} เห็น approval_status === 'Suspended'
  | 'account_suspended'
  // ล็อกอินอีเมลผ่าน แต่บัญชียังรออนุมัติ
  | 'login_rejected_pending'
  // ล็อกอินอีเมลผ่าน แต่ไม่มีแถวไรเดอร์ในฐานข้อมูล
  | 'login_rejected_no_profile'
  // ไรเดอร์กดปุ่ม "สลับบัญชี" ที่จอ PIN
  | 'device_reset';

// อ่านจาก build ถ้ามี ไม่มีก็ 'dev' — มีไว้ตอบคำถาม "ไรเดอร์คนนี้ค้างอยู่ที่
// บันเดิลรุ่นไหน" ซึ่งเป็นคำถามที่ต้องถามอยู่แล้วเพราะ service worker
// cache-first อาจตรึงเขาไว้กับ JS เก่า (ดูรายงานสำรวจ 3 ก.ย. 2569 ข้อ 5)
const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev';

/**
 * เขียน 1 แถวลง `rider_auth_events/{riderId}/{pushId}`
 *
 * @param riderId ไรเดอร์ที่เพิ่งเสีย session — ต้องส่งมาเอง ไม่อ่านจาก
 *   auth.currentUser เพราะ ณ จุดที่เรียกฟังก์ชันนี้ currentUser มักเป็น null
 *   ไปแล้ว (นั่นคือเหตุผลที่เรากำลังเขียน log อยู่)
 */
export function logAuthEvent(
  riderId: string | null | undefined,
  reason: AuthEventReason,
  extra?: Record<string, unknown>
): void {
  // console ก่อนเสมอ และไม่ขึ้นกับผลของ RTDB — เป็นคนอ่านคนที่สองที่ยังใช้ได้
  // ตอน rules ยังไม่ deploy หรือตอนไรเดอร์ออฟไลน์
  console.warn(`[auth] ${reason}`, { riderId: riderId || null, ...extra });

  if (!riderId) return;

  try {
    const row = push(ref(db, `rider_auth_events/${riderId}`));
    void set(row, {
      reason,
      at: Date.now(),
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      appVersion: APP_VERSION,
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      ...(extra || {}),
    }).catch((err) => {
      console.warn('[auth] logAuthEvent write failed:', (err as Error)?.message);
    });
  } catch (err) {
    console.warn('[auth] logAuthEvent threw:', (err as Error)?.message);
  }
}

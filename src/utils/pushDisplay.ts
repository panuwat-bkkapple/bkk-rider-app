// สิ่งที่ต้องแสดงเมื่อ push มาถึงขณะแอปเปิดค้างอยู่ (foreground)
//
// **ทำไมต้องมีไฟล์นี้ — บั๊กที่มันปิด:**
// ฝั่ง `bkk-rider-app/functions` ส่ง push แบบ data-only โดยตั้งใจ (คอมเมนต์ที่
// `functions/src/index.ts` อธิบายว่าถอด `notification` ออกเพื่อกัน iOS เด้งซ้ำ
// กับใบที่ Service Worker สร้างเอง) **แต่ตอนถอดไม่ได้แก้ฝั่งรับตาม** —
// `onMessage` ยังขึ้นต้นด้วย `if (payload.notification)` ซึ่งกลายเป็นกิ่งที่
// ไม่มีวันเข้าอีกเลย ผลคือ **งานใหม่ · broadcast · แชท เงียบสนิทเมื่อแอปเปิดอยู่**
// ซึ่งคือสภาพของไรเดอร์ที่กำลังนั่งรองานพอดี (ดู
// docs/reports/2026-09-03-rider-push-delivery-survey.md ข้อ A)
//
// กติกาของ SDK ที่ทำให้ foreground เป็นความรับผิดชอบของหน้าเว็บล้วนๆ — อ่านจาก
// ซอร์สที่ติดตั้งจริง `@firebase/messaging@0.12.12`
// (`dist/index.sw.cjs` ในฟังก์ชัน `onPush`):
//
//   ถ้ามี client ที่ visible อยู่ → SW ส่ง payload เข้าหน้าเว็บแล้ว **return**
//   (SW ไม่แสดงอะไรเลย ไม่ว่าข้อความจะมี `notification` หรือไม่)
//
// แปลว่าเมื่อแอปเปิดอยู่ ไม่มีใครแสดงให้นอกจากโค้ดตรงนี้
//
// **ผู้ส่งมีสองรายและส่งคนละรูป ต้องรับให้ได้ทั้งคู่:**
//   bkk-rider-app/functions → data-only: `data.title` / `data.body`
//   bkk-system/functions    → `notification: {title, body}` โดย `data` ไม่มี title/body
// `data` มาก่อนเพราะเป็นรูปที่ตั้งใจให้เป็นมาตรฐาน ส่วน `notification` เป็น
// fallback ของฝั่งที่ยังไม่ย้าย

export interface ForegroundAlert {
  title: string;
  body: string;
  /** ยุบใบซ้ำของงานเดียวกัน — รูปเดียวกับที่ SW ใช้ใน onBackgroundMessage */
  tag: string;
  /** ส่งต่อให้ notificationclick ของ SW ใช้เปิดแชทได้ */
  data: Record<string, string>;
}

interface IncomingPayload {
  data?: Record<string, string> | undefined;
  notification?: { title?: string | null; body?: string | null } | undefined;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** แปลง payload ที่ได้จาก onMessage เป็นสิ่งที่ต้องแสดง
 *
 *  คืน `null` เมื่อไม่มีทั้งหัวเรื่องและเนื้อความจากทั้งสองรูป — ใบเปล่าที่ขึ้นว่า
 *  "BKK Rider" เฉยๆ ไม่ได้บอกอะไรไรเดอร์เลย และการโชว์มันคือการสอนให้เลิกอ่าน
 *  (อาการนี้มีอยู่จริงบนเครื่องตอนนี้ — ดูข้อ D ของรายงานสำรวจ) */
export function foregroundAlert(payload: IncomingPayload | null | undefined): ForegroundAlert | null {
  if (!payload) return null;
  const data = payload.data || {};

  const title = str(data.title) || str(payload.notification?.title);
  const body = str(data.body) || str(payload.notification?.body);
  if (!title && !body) return null;

  const jobId = str(data.jobId);
  const type = str(data.type);

  return {
    title: title || 'BKK Rider',
    body,
    tag: jobId ? `${type || 'rider'}-${jobId}` : 'bkk-rider',
    data,
  };
}

/** ข้อความบรรทัดเดียวสำหรับ toast ในแอป — ใช้ตอนที่ระบบปฏิบัติการไม่ยอมแสดง
 *  notification ให้ (ดูเหตุผลที่ต้องมีสองทางในคอมเมนต์ของ usePushNotifications) */
export function alertLine(alert: ForegroundAlert): string {
  return alert.body ? `${alert.title} · ${alert.body}` : alert.title;
}

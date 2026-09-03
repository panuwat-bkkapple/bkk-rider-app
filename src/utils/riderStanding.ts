// src/utils/riderStanding.ts
//
// "ไรเดอร์คนนี้เข้าใช้งานได้ไหม" — คำตอบเดียวของแอปไรเดอร์
//
// MIRROR ของ `bkk-system/functions/actor.js` (`effectiveApprovalStatus` +
// `riderStanding`) และของ `normalizeRider` ใน
// `bkk-system/src/pages/fleet/RiderManagement.tsx:87-94` — **แก้ที่หนึ่งต้องแก้
// ทุกที่** ไรเดอร์ที่ UI เรียกว่า Active ขณะที่ server เรียกว่า Pending คือรูป
// ของบั๊กที่พื้นที่นี้ผลิตซ้ำมาตลอด (คอมเมนต์เดียวกันอยู่ที่ actor.js:101-104)
//
// ทำไมต้องมีไฟล์นี้แทนที่จะเทียบสตริงตรงๆ ที่ Login (รายงาน Task 3, 3 ก.ย. 2569):
//
//   `status` แบกสองความหมายในฟิลด์เดียว — สถานะอนุมัติ (Pending/Active/
//   Rejected/Suspended) และสถานะออนไลน์ (Online/Offline/Busy) — และผู้เขียนที่
//   ถี่ที่สุดคือ **แอปไรเดอร์เอง** (useRiderData เขียน presence ทุก ~10 วินาที)
//   เพราะ rules ไม่มี `.validate` ใต้ `riders/$uid/status` ต่างจาก
//   `approval_status` ที่ถูกตรึงไว้ ดังนั้นค่าอนุมัติที่ admin เขียนลง `status`
//   ถูกทับหายภายในสิบวินาที ส่วน `approval_status` อยู่ครบ
//
//   `database.rules.json` เองก็ gate การเข้าถึง `jobs` ด้วย `approval_status`
//   ทั้ง 4 จุด (:48, :64, :830, :831) และไม่เคยอ้าง `status` เลย
//
// **แต่เทียบ `approval_status` ตรงๆ อย่างเดียวไม่ได้** — `Register.tsx` เขียน
// `status: 'Pending'` โดยไม่เขียน `approval_status` เลย ผู้สมัครใหม่จึงมี
// `approval_status === undefined` ถ้าเทียบ `=== 'Pending'` เฉยๆ จะได้ false
// แล้ว **คนที่ยังไม่ได้รับอนุมัติจะล็อกอินผ่าน** ซึ่งแย่กว่าบั๊กเดิม
// fallback ไป `status` จึงเป็นของจำเป็น ไม่ใช่ของเผื่อ

export const STANDING = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  BLOCKED: 'BLOCKED',
} as const;

export type RiderStanding = (typeof STANDING)[keyof typeof STANDING];

/** ค่าที่ประกาศว่า `status` กำลังแบก presence อยู่ ไม่ใช่สถานะอนุมัติ */
const PRESENCE_VALUES = ['Online', 'Offline', 'Busy'];

/**
 * สถานะอนุมัติที่ใช้ได้จริง — `approval_status` มาก่อนเสมอ, `status` เป็น
 * fallback สำหรับแถวเก่าที่ถูกสร้างก่อนจะมีฟิลด์นั้น
 */
export function effectiveApprovalStatus(
  rider: { approval_status?: unknown; status?: unknown } | null | undefined
): string {
  if (!rider) return 'Pending';
  if (rider.approval_status) return String(rider.approval_status);
  const status = String(rider.status || '');
  // presence ตอบคำถามเรื่องการอนุมัติไม่ได้ แต่การที่ไรเดอร์เคยออนไลน์แปลว่า
  // เขาเคยผ่านการอนุมัติมาแล้ว (แถวเก่าที่ไม่มี approval_status)
  if (PRESENCE_VALUES.includes(status)) return 'Active';
  return status || 'Pending';
}

/**
 * อะไรก็ตามที่ไม่ใช่ Active หรือ Pending = BLOCKED **รวมถึงค่าที่โค้ดนี้ไม่รู้จัก**
 * fail closed: สถานะที่ถูกคิดขึ้นทีหลังจะบล็อกไว้ก่อนจนกว่าจะมีคน map
 * ไม่ใช่อนุญาตเงียบๆ (กฎเดียวกับ actor.js:113-123)
 */
export function riderStanding(
  rider: { approval_status?: unknown; status?: unknown } | null | undefined
): RiderStanding {
  const state = effectiveApprovalStatus(rider);
  if (state === 'Active') return STANDING.ACTIVE;
  if (state === 'Pending') return STANDING.PENDING;
  return STANDING.BLOCKED;
}

/** ไรเดอร์ถูกระงับอยู่หรือไม่ — ใช้ที่ listener ของ useRiderData */
export function isSuspended(
  rider: { approval_status?: unknown; status?: unknown } | null | undefined
): boolean {
  return effectiveApprovalStatus(rider) === 'Suspended';
}

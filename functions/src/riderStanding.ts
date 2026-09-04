// functions/src/riderStanding.ts
//
// MIRROR ของ `src/utils/riderStanding.ts` (ฝั่งแอป) — functions มี rootDir ของ
// ตัวเอง import จาก `src/` ไม่ได้ จึงต้องมีสำเนา **แก้ที่หนึ่งต้องแก้ทั้งคู่**
// ด่านที่กันไม่ให้สองสำเนาเดินห่างกัน: `src/utils/riderStandingParity.test.ts`
// import ทั้งสองไฟล์มารันบน fixture ชุดเดียวกันแล้วเทียบผล (ไฟล์นี้ pure ไม่แตะ
// firebase จึง import ได้ตรงๆ ต่างจาก index.ts ที่ initializeApp ตอนโหลด)
//
// ต้นทางของกฎทั้งชุดคือ `bkk-system/functions/actor.js` (`effectiveApprovalStatus`
// + `riderStanding`) — สำเนานี้เป็นตัวที่ 3
//
// ทำไม onBroadcastJob ต้องใช้ตัวนี้แทน `riderData.status === 'Online' | 'Busy'`
// (รายงานสำรวจ docs/reports/2026-09-03-rider-push-delivery-survey.md ข้อ C):
//
//   `status` แบกสองความหมาย — สถานะอนุมัติ (Pending/Active/...) กับ presence
//   (Online/Busy) — และ presence ถูกเขียนก็ต่อเมื่อไรเดอร์กดสวิตช์ "รับงาน"
//   แล้ว GPS ยิงพิกัดกลับมา (useRiderData) ส่วนคนที่ยังไม่เคยกดจะถือค่าอนุมัติ
//   `Active` อยู่ในฟิลด์นั้น → ถูกกรองออกจาก broadcast **ทุกใบ** ทั้งที่เป็น
//   ไรเดอร์ที่อนุมัติแล้วและควรได้รู้ว่ามีงาน. ข้อมูล production (3 ก.ย. 2569):
//   `status: Busy 1 · Active 1` = ไรเดอร์หนึ่งในสองคนไม่เคยได้ push broadcast
//
//   และในทางกลับกัน ไรเดอร์ที่ถูกระงับ (`approval_status: Suspended`) แต่ `status`
//   ยังค้างเป็น `Busy` จากกะสุดท้าย **ยังได้ push งานใหม่อยู่** — กรองด้วยฟิลด์
//   ผิดจึงผิดทั้งสองทิศ
//
// **ทำไมไม่กรอง presence เลย ไม่ใช่แค่ย้ายไปอ่านฟิลด์อื่น:** ไม่มีใครในทั้ง 3 รีโป
// เขียน `Offline` (grep แล้ว) การกด "ปิดรับ" แค่หยุดเขียน GPS ค่าเดิมค้างอยู่
// ในฐานข้อมูล presence ในฐานข้อมูลจึงแปลว่า "เคยเปิดรับงานสักครั้ง" ไม่ใช่
// "กำลังเปิดรับอยู่" — ใช้กรองอะไรไม่ได้ และเงื่อนไข `status !== 'Offline'` ก็เป็น
// ด่านที่ไม่มีทางไปถึง (ไม่มี writer) ซึ่ง CLAUDE.md บอกให้ลบ ไม่ใช่ ship.
// การให้ "ปิดรับ" มีผลจริงต้องมี writer ของ Offline ก่อน ซึ่งกระทบ DispatcherPage
// ของแอดมิน (กรอง `status !== 'Offline'` ออกจากรายชื่อจ่ายงาน) = การตัดสินใจ
// product แยกต่างหาก ไม่ทำในใบนี้

export const STANDING = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  BLOCKED: "BLOCKED",
} as const;

export type RiderStanding = (typeof STANDING)[keyof typeof STANDING];

type RiderLike = { approval_status?: unknown; status?: unknown } | null | undefined;

/** ค่าที่ประกาศว่า `status` กำลังแบก presence อยู่ ไม่ใช่สถานะอนุมัติ */
const PRESENCE_VALUES = ["Online", "Offline", "Busy"];

export function effectiveApprovalStatus(rider: RiderLike): string {
  if (!rider) return "Pending";
  if (rider.approval_status) return String(rider.approval_status);
  const status = String(rider.status || "");
  if (PRESENCE_VALUES.includes(status)) return "Active";
  return status || "Pending";
}

export function riderStanding(rider: RiderLike): RiderStanding {
  const state = effectiveApprovalStatus(rider);
  if (state === "Active") return STANDING.ACTIVE;
  if (state === "Pending") return STANDING.PENDING;
  return STANDING.BLOCKED;
}

/** ไรเดอร์คนนี้ควรได้ push งาน broadcast ไหม — คือ "อนุมัติแล้ว" เท่านั้น
 *  (เหตุผลที่ไม่ดู presence อยู่ในคอมเมนต์หัวไฟล์) */
export function isBroadcastRecipient(rider: RiderLike): boolean {
  return riderStanding(rider) === STANDING.ACTIVE;
}

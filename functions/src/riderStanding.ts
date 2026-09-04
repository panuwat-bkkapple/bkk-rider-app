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
// **presence กรองได้แค่ทางเดียว: `Offline` = ไม่ส่ง** (เจ้าของงานเคาะ 4 ก.ย. 2569)
// ตอน #152 ไม่มีใครในทั้ง 3 รีโปเขียน `Offline` เงื่อนไขนี้จึงเป็นด่านที่ไม่มีทาง
// ไปถึงและถูกลบ — ตอนนี้แอปเขียน Offline เมื่อไรเดอร์กด "ปิดรับ" (useRiderData +
// utils/presence.ts) ด่านจึงมีทางไปถึงแล้ว. **ห้ามกลับไปกรองด้วย Online/Busy**:
// ค่าเหล่านั้นยังค้างได้เมื่อไรเดอร์ปิดแอปโดยไม่กดปิดรับ และคนที่อนุมัติแล้วแต่
// ยังไม่เคยกดรับงานเลยถือค่าอนุมัติอยู่ในฟิลด์นี้ — สองกลุ่มนั้นต้องได้ push

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

/** ค่าที่แอปเขียนเมื่อไรเดอร์กด "ปิดรับ" — MIRROR ของ PRESENCE_OFFLINE ใน
 *  src/utils/presence.ts */
const PRESENCE_OFFLINE = "Offline";

/** ไรเดอร์คนนี้ควรได้ push งาน broadcast ไหม — อนุมัติแล้ว **และ** ไม่ได้กดปิดรับ
 *  (เหตุผลที่กรองได้แค่ทาง Offline อยู่ในคอมเมนต์หัวไฟล์) */
export function isBroadcastRecipient(rider: RiderLike): boolean {
  if (riderStanding(rider) !== STANDING.ACTIVE) return false;
  return rider?.status !== PRESENCE_OFFLINE;
}

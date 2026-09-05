// src/utils/riderJobLists.ts
//
// กติกาเดียวว่างานของไรเดอร์ใบหนึ่ง "ยังต้องทำ" (active) หรือ "จบแล้ว" (history)
// — ผู้อ่านสองคน: useRiderData (แท็บหน้าหลัก/ประวัติ) และ ChatModal (ปิดช่องพิมพ์
// เมื่อจบงาน) ต้องถามที่นี่ที่เดียว ห้ามพิมพ์เซ็ตสถานะเองอีก
//
// ที่มา (5 ก.ย. 2569): แอดมินกด "ผ่าน QC → ส่ง QC Lab" แล้วงานหายจากจอไรเดอร์ทันที
// เพราะลิสต์ประวัติเดิมพิมพ์มือ (Pending QC / In Stock / Paid / Completed / ...)
// และ **ไม่มี Sent To QC Lab, Ready To Sell, Reserved, Sold** งานที่เดินต่อในคลัง
// จึงไม่เข้าเงื่อนไขของทั้งสองลิสต์ ไม่มี error ไม่มีอะไรบอก — ChatModal มีลิสต์
// ของตัวเองอีกชุดที่ขาดตัวเดียวกัน (กฎมีสองคนอ่านแต่ติดตั้งไว้คนละที่)
//
// กติกาใหม่ตัดสินด้วย *phase* ของสถานะ (STATUS_TO_PHASE ใน job-statuses.ts ซึ่ง
// exhaustive — เพิ่มสถานะใหม่โดยไม่จัด phase คอมไพล์ไม่ผ่าน) ไม่ใช่ลิสต์ชื่อ:
//   - INVENTORY / TERMINAL / PENDING_CLOSE / EXCEPTION = เครื่องอยู่กับร้านหรือ
//     งานปิดแล้ว ส่วนของไรเดอร์จบ → history **โดยไม่ต้องมี completed_at** (แอดมิน
//     รับเครื่องเข้าคลังผ่าน engine ได้โดยไรเดอร์ไม่ได้กดส่งมอบ ซึ่งไม่ประทับ
//     completed_at — ของเดิมงานแบบนั้นหายจากทั้งสองลิสต์เหมือนกัน)
//   - สถานะที่ไรเดอร์ยังมีปุ่มให้กด (ACTIVE_LIST_STATUSES) → active จนกว่าจะมี
//     completed_at (ไรเดอร์ประทับตอนส่งมอบ) แล้วค่อยเป็น history — เหมือนเดิม
//   - ที่เหลือ (กองงานที่ยังไม่รับ / สถานะที่ไรเดอร์ไม่เกี่ยว) → null
import { JOB_STATUS, PHASE, getPhase, normalizeStatus } from '../types/job-statuses';
import type { AnyJobStatus, Phase } from '../types/job-statuses';

export type RiderJobBucket = 'active' | 'history' | null;

type ListJob = {
  status?: string | null;
  receive_method?: string | null;
  completed_at?: number | null;
  updated_at?: number | null;
  created_at?: number | null;
} | null | undefined;

// สถานะที่ไรเดอร์ยังมีอะไรต้องทำ — canonical เท่านั้น (ค่าดิบผ่าน normalizeStatus
// ก่อนเสมอ เพราะ DB ยังถือสะกดเก่า "Accepted", "In-Transit", "PAID")
// `AnyJobStatus` เพราะ normalizeStatus คืนได้ทั้งสาย B2C/B2B — สมาชิกมีแต่ B2C
// สถานะ B2B จึงตอบ false ซึ่งถูกแล้ว (ไรเดอร์ไม่แตะงาน B2B)
const ACTIVE_LIST_STATUSES = new Set<AnyJobStatus>([
  JOB_STATUS.RIDER_ACCEPTED,
  JOB_STATUS.RIDER_EN_ROUTE,
  JOB_STATUS.RIDER_ARRIVED,
  JOB_STATUS.BEING_INSPECTED,
  JOB_STATUS.QC_REVIEW,
  JOB_STATUS.PRICE_ACCEPTED,
  JOB_STATUS.REVISED_OFFER,
  JOB_STATUS.PAYOUT_PROCESSING,
  JOB_STATUS.RIDER_RETURNING, // legacy "In-Transit" on Pickup
  JOB_STATUS.WAITING_FOR_HANDOVER,
  JOB_STATUS.PAID,
]);

// phase ที่แปลว่า "ส่วนของไรเดอร์จบแล้ว" ไม่ว่าสถานะจะเดินต่อไปไหนในคลัง
const DONE_PHASES = new Set<Phase>([
  PHASE.INVENTORY,
  PHASE.TERMINAL,
  PHASE.PENDING_CLOSE, // Cancelled — ไรเดอร์ต้องเห็นว่าเกิดอะไรขึ้น (historyStats แยกให้)
  PHASE.EXCEPTION,
]);

export const classifyRiderJob = (job: ListJob): RiderJobBucket => {
  const canonical = normalizeStatus(job?.status, job?.receive_method);
  if (!canonical) return null;
  if (DONE_PHASES.has(getPhase(canonical))) return 'history';
  if (ACTIVE_LIST_STATUSES.has(canonical)) return job?.completed_at ? 'history' : 'active';
  return null;
};

export const isActiveRiderJob = (job: ListJob): boolean => classifyRiderJob(job) === 'active';

/** งานจบแล้วสำหรับไรเดอร์ — แชทของงานปิดช่องพิมพ์ด้วยกติกานี้ */
export const isRiderJobDone = (job: ListJob): boolean => classifyRiderJob(job) === 'history';

/** เวลาที่ใช้เรียง/กรองประวัติ — งานที่เข้าคลังโดยไม่ผ่านการส่งมอบไม่มี completed_at */
export const historyTimeOf = (job: ListJob): number =>
  job?.completed_at || job?.updated_at || job?.created_at || 0;

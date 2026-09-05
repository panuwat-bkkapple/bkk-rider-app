// ค่าของ `jobs/{id}/rider_fee_status` — สำเนาของแอปไรเดอร์
//
// ต้นทาง = bkk-system/src/types/riderFeeStatus.ts (+ functions/rider-fee-status.js ที่นั่น)
// ด่าน: src/types/riderFeeStatusParity.test.ts อ่านไฟล์ต้นทางมาเทียบตัวอักษร (CI sparse-checkout
// มาให้ — ดู .github/workflows/ci.yml) และฝั่ง bkk-system ก็อ่านไฟล์นี้กลับเมื่อ checkout ข้างกัน
//
//   Pending = ค่ารอบคำนวณแล้ว รออนุมัติเข้ากระเป๋า
//   Paid    = อนุมัติแล้ว มีแถว JOB_PAYOUT ในกระเป๋า
//   Waived  = แอดมินตัดสินใจไม่จ่าย (บัญชีเจ้าของ / ไม่มีไรเดอร์ / เหตุผลที่ระบุ)
//
// **Paid กับ Waived เป็นปลายทาง** — แอปนี้เป็นตัวเขียน 'Pending' ตอนส่งมอบ (useJobActions
// handleCompleteJob) และก่อน 5 ก.ย. 2569 เขียนทับทุกครั้งโดยไม่ดูค่าเดิม ใบที่ waive ไปแล้วจึง
// กลับมานั่งในคิวอนุมัติได้เงียบๆ ตัวเขียนต้องผ่าน pendingFeeStatusPatch เท่านั้น
// PAID อยู่ท้ายโดยไม่มี trailing comma โดยตั้งใจ — statusLiteralCensus นับ `'Paid',` เป็นการเทียบ
// สถานะงาน (Paid เป็นทั้งสถานะงานและสถานะค่ารอบ ตัวจำแนกแยกไม่ออก) ลำดับต้องตรงกันทุกสำเนา
export const RIDER_FEE_STATUS = {
  PENDING: 'Pending',
  WAIVED: 'Waived',
  PAID: 'Paid'
} as const;

export type RiderFeeStatus = (typeof RIDER_FEE_STATUS)[keyof typeof RIDER_FEE_STATUS];

export const RIDER_FEE_STATUS_VALUES: readonly RiderFeeStatus[] = Object.values(RIDER_FEE_STATUS);

/** ปลายทาง — ตัวเขียน Pending (ส่งมอบ / trigger / แย้งหมุด) ต้องไม่ทับ */
export const TERMINAL_RIDER_FEE_STATUSES: readonly RiderFeeStatus[] = [
  RIDER_FEE_STATUS.PAID,
  RIDER_FEE_STATUS.WAIVED,
];

export const isTerminalRiderFeeStatus = (value: unknown): boolean =>
  TERMINAL_RIDER_FEE_STATUSES.includes(value as RiderFeeStatus);

/**
 * patch ที่ตัวเขียน "Pending" ต้องใช้ — คืน {} เมื่อสถานะปัจจุบันเป็นปลายทาง (หรือเป็น
 * Pending อยู่แล้ว) มิฉะนั้น { rider_fee_status: 'Pending' }. MIRROR ของ pendingFeeStatusPatch
 * ใน bkk-system/functions/rider-fee-status.js
 */
export const pendingFeeStatusPatch = (current: unknown): { rider_fee_status?: RiderFeeStatus } =>
  isTerminalRiderFeeStatus(current) || current === RIDER_FEE_STATUS.PENDING
    ? {}
    : { rider_fee_status: RIDER_FEE_STATUS.PENDING };

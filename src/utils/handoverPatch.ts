// patch ที่แอปส่งไปกับ event ส่งมอบเครื่องเข้าสาขา (RETURN_ARRIVED) — pure เพื่อให้เทสได้
//
// ก่อน 5 ก.ย. 2569 handleCompleteJob ส่ง `{ completed_at, rider_fee_status: 'Pending' }` ตายตัว
// = เขียน Pending ทับทุกครั้ง ไม่ดูว่างานถูกจ่าย (Paid) หรือถูกยกเว้น (Waived) ไปแล้วหรือยัง
// ใบที่แอดมิน waive แล้วจึงกลับมานั่งในคิวอนุมัติได้ถ้าไรเดอร์กดส่งมอบซ้ำ (บทเรียน
// "กฎมีกี่คนอ่าน" — ตัวเขียน Pending มี 4 ที่ใน 2 repo แอปนี้เป็นตัวเดียวที่ไม่เช็คค่าเดิม)
//
// ค่ารอบ (rider_fee) ไม่เขียนที่นี่ — onJobHandedOverCalcRiderFee ฝั่ง bkk-system คำนวณเอง
import { pendingFeeStatusPatch } from '../types/riderFeeStatus';

/** index signature เพราะ runTransition รับ patch เป็น Record<string, unknown> */
export type HandoverPatch = { completed_at: number; rider_fee_status?: 'Pending'; [key: string]: unknown };

export const handoverPatch = (job: { rider_fee_status?: unknown } | null | undefined, now: number): HandoverPatch => ({
  completed_at: now,
  ...(pendingFeeStatusPatch(job?.rider_fee_status) as { rider_fee_status?: 'Pending' }),
});

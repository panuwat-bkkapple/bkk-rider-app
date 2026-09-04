// ตัวตัดสินของ push "โอนเงินให้ลูกค้าแล้ว" ใน onJobStatusChanged (rider-notifications)
//
// ทำไมต้องมี (4 ก.ย. 2569): กิ่ง payout ใน switch เดิม list `Waiting for Handover`
// / `Waiting For Handover` / `Payment Completed` ส่วน `Paid`/`PAID` อยู่กิ่ง
// "งานเสร็จสมบูรณ์". ล็อต B2B ที่บัญชีโอนเงินเคยไปที่ `Payment Completed` (writer
// ฝั่งไคลเอนต์) แต่พอ writer ย้ายไป engine (`b2b_payment_confirmed`) ปลายทางเป็น
// canonical `Paid` — ถ้าไม่มีตัวนี้ push ของล็อตนั้นจะเปลี่ยนถ้อยคำและหาย
// `event: payment_transferred` โดยไม่มีใครตั้งใจ (รายงาน bkk-system
// docs/reports/2026-09-04-status-literal-compare-survey-cross-repo.md ข้อ 1)
//
// `Paid` เป็นปลายทางของสามทางที่ความหมายต่างกัน จึงตัดสินจากคู่ before→after
// ไม่ใช่จาก after อย่างเดียว:
//   Pending Finance Approval → Paid   บัญชีโอนค่าล็อต B2B     = payout
//   Waiting For Handover → Paid       ไรเดอร์ส่งมอบเสร็จ (B2C) = จบงาน (เงินออกไปแล้ว
//                                     ตอน Waiting For Handover ซึ่ง push ไปแล้ว)
//   Payout Processing → Paid          ปุ่ม "จ่ายเงินแล้ว" บนมือถือแอดมิน = จบงาน
//                                     (พฤติกรรมเดิม ไม่แตะในรอบนี้ — เป็นการตัดสินใจ
//                                     ว่าจะให้ทางลัดนั้นนับเป็น payout ไหม)
//
// สะกดเก่า (Waiting for Handover / Payment Completed / PAID) ถูก canonicalStatus
// (./statusMatch.ts) พามาที่ canonical ก่อนเทียบ — ไม่ list ซ้ำที่นี่
import { JOB_STATUS, canonicalStatus } from "./statusMatch";

/** สถานะที่เปลี่ยนมานี้คือ "บัญชีโอนเงินให้ลูกค้าแล้ว" ไหม */
export function isPayoutTransition(before: unknown, after: unknown): boolean {
  const to = canonicalStatus(after);
  if (to === JOB_STATUS.WAITING_FOR_HANDOVER) return true;
  return to === JOB_STATUS.PAID && canonicalStatus(before) === JOB_STATUS.PENDING_FINANCE_APPROVAL;
}

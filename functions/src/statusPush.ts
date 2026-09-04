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
// functions/src import enum จาก src/types ไม่ได้ (rootDir) จึงเขียนคู่สะกดตรงนี้
// เหมือน case อื่นในไฟล์เดียวกัน; สถานะ B2B ตัวนี้มีสะกดเดียวใน DB

const PAYOUT_STATUSES = new Set(["Waiting for Handover", "Waiting For Handover", "Payment Completed"]);
const PAID_SPELLINGS = new Set(["Paid", "PAID"]);
const B2B_AWAITING_FINANCE = "Pending Finance Approval";

/** สถานะที่เปลี่ยนมานี้คือ "บัญชีโอนเงินให้ลูกค้าแล้ว" ไหม */
export function isPayoutTransition(before: unknown, after: unknown): boolean {
  if (typeof after !== "string") return false;
  if (PAYOUT_STATUSES.has(after)) return true;
  return PAID_SPELLINGS.has(after) && before === B2B_AWAITING_FINANCE;
}

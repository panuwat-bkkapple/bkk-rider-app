// สิ่งที่ไรเดอร์ "ทำ" ไม่ใช่สถานะที่ไรเดอร์ "เลือก"
//
// ก่อนหน้านี้ทุกปุ่มในแอปส่งชื่อสถานะปลายทางเข้า `update(jobs/{id})` ตรงๆ —
// แปลว่ากติกาว่าสถานะไหนไปสถานะไหนได้ กระจายอยู่ใน onClick ของทุกปุ่ม และ
// RTDB rules ไม่ได้ตรวจฟิลด์ `status` เลย ไรเดอร์จึงเขียน "Paid" ทับ "New Lead"
// ได้ตามใจ สิ่งเดียวที่กันอยู่คือไม่มีปุ่มไหน render ให้กด
//
// ตอนนี้ปุ่มส่ง **event** ("ฉันออกเดินทางแล้ว") ปลายทางเป็นเรื่องของ
// `TRANSITIONS` ใน bkk-system/functions/status-engine.js ที่เดียว
//
// ไฟล์นี้ตั้งใจให้ pure (ไม่ import firebase) เพื่อให้เทสได้โดยไม่ต้องมี DB

import type { CheckpointStage } from './jobTimeline';

/** event ที่แอปไรเดอร์ยิงได้ — ต้องมีชื่อตรงกับคีย์ใน status-engine.js เป๊ะ */
export const RIDER_EVENT = {
  // การรับงาน — เป็น event เดียวในชุดนี้ที่ "สร้างความเป็นเจ้าของ" ไม่ใช่
  // เดินหน้างานที่ถืออยู่แล้ว. ฝั่ง callable มี CLAIMING_EVENTS กำกับไว้ว่า
  // event นี้ยิงได้ตอนงานยังไม่มีเจ้าของ ส่วน event อื่นต้องเป็นของเราก่อน
  ACCEPTED: 'rider_accepted',
  DEPARTED: 'rider_departed',
  ARRIVED: 'rider_arrived',
  INSPECTION_STARTED: 'inspection_started',
  // ส่งผลตรวจ — ราคาที่คิดใหม่ (final_price / net_payout / devices) ไปกับ patch
  // จึงถูกเขียนใน transaction เดียวกับสถานะ ไม่ใช่ write แยกที่อาจสำเร็จครึ่งเดียว
  INSPECTION_SUBMITTED: 'inspection_submitted',
  // ย้อนกลับไปแก้ผลตรวจ — engine กัน blockedWhenPaid ไว้ ปุ่มนี้จึงเปิดงานที่
  // จ่ายเงินไปแล้วไม่ได้ ซึ่งเดิมไม่มีอะไรกันเลยนอกจากปุ่มไม่ render
  INSPECTION_REVERTED: 'inspection_reverted',
  RETURN_STARTED: 'rider_return_started',
  RETURN_ARRIVED: 'rider_return_arrived',
  // ลูกค้าตัดสินใจกับข้อเสนอที่ปรับใหม่ "ต่อหน้าไรเดอร์" — ไรเดอร์เป็นคนกดแทน
  // แต่เจ้าของการตัดสินใจคือลูกค้า ซึ่งเป็นสิ่งที่ audit trail ต้องบันทึก
  //
  // ขา "ยอมรับ" ไป Payout Processing ไม่ใช่ Price Accepted (เจ้าของงานเคาะ
  // 1 ก.ย. 2569 ให้คงพฤติกรรมวันนี้ไว้ — ตกลงราคากันจบหน้างานแล้ว ไม่มีขั้น
  // รอลูกค้ายืนยันคั่นอีกชั้น). รายละเอียดอยู่ที่ revised_offer_accepted ใน
  // bkk-system/functions/status-engine.js
  REVISED_OFFER_ACCEPTED: 'revised_offer_accepted',
  // ใช้ event กลางของการยกเลิก ไม่ใช่ event เฉพาะของการ์ดนี้ — engine บังคับ
  // taxonomy (cancel_category / cancelled_by / cancelled_at) ผ่าน `requires`
  // ให้เอง ซึ่งเดิมเป็นกติกาที่ฝากไว้กับความจำของแต่ละ call site และมีช่องทาง
  // ที่ลืมจริงจนงานค้างเป็น soft-cancel ถาวรเพราะ finaliser หยิบไม่ได้
  CANCELLED: 'cancelled',
  // ไรเดอร์คืนงานกลางทาง — **ไม่ใช่การยกเลิกดีล** งานกลับเข้าคิว sales ให้แอดมิน
  // ตัดสินว่าจะ re-broadcast โทรหาลูกค้า หรือปิดจริง
  //
  // engine ประทับ withdrawn_at/withdrawn_by ให้เอง (bkk-system #644) แทนที่จะ
  // ให้ไคลเอนต์เขียน cancel_* แบบเดิม — ฟิลด์ยกเลิกบนงานที่ยังวิ่งอยู่ทำให้
  // finalizeCancelledJobs เห็นเวลาเก่าแล้วปิดงานทันทีในวันที่แอดมินยกเลิกจริง
  WITHDREW: 'rider_withdrew',
} as const;

export type RiderEvent = (typeof RIDER_EVENT)[keyof typeof RIDER_EVENT];

/**
 * จุดเช็คอินของแต่ละ event
 *
 * เดิม map ด้วย "สถานะปลายทาง" ซึ่งอ่านแล้วเหมือนถูก แต่ผูกแอปไว้กับการรู้
 * ปลายทางล่วงหน้า — ซึ่งคือสิ่งที่ย้ายไป engine ไปแล้ว. stage เป็นชื่อของ
 * **เหตุการณ์** อยู่แล้ว (`customer_left`, `branch_handover`) การ map จาก event
 * จึงตรงกว่า และทำให้แอปถามระยะห่าง (เพื่อขอยืนยันก่อนเขียน) ได้โดยไม่ต้องเดา
 * ว่า engine จะพาไปสถานะอะไร
 *
 * event ที่ไม่มีจุดเช็คอิน (inspection_started) ไม่ต้องมีในตารางนี้
 */
export const EVENT_CHECKPOINT_STAGE: Partial<Record<RiderEvent, CheckpointStage>> = {
  // จุดเริ่มนับเวลาของทั้งงาน — `totalJobMs()` ใน jobTimeline วัดจากแถวนี้เสมอ
  // ไม่มีมัน = คืน null ทั้งใบ แถว "รวม X นาที" หายจากหน้าประวัติ และไทม์ไลน์
  // ใน /rider-performance ของแอดมินขาดขั้นแรกทุกงาน
  [RIDER_EVENT.ACCEPTED]: 'rider_accepted',
  [RIDER_EVENT.DEPARTED]: 'rider_en_route',
  [RIDER_EVENT.ARRIVED]: 'rider_arrived',
  [RIDER_EVENT.RETURN_STARTED]: 'customer_left',
  [RIDER_EVENT.RETURN_ARRIVED]: 'branch_handover',
};

/**
 * แปลคำปฏิเสธของ engine เป็นภาษาที่ไรเดอร์ทำอะไรต่อได้
 *
 * ทำไมต้องแปลเอง ไม่ใช้ข้อความจาก server ตรงๆ: ข้อความฝั่ง engine เขียนไว้ให้
 * คนอ่าน log ("event rider_departed ใช้กับสถานะ Rider Arrived ไม่ได้") ซึ่งบอก
 * ไรเดอร์ที่ยืนอยู่หน้าบ้านลูกค้าไม่ได้ว่าต้องทำอะไรต่อ
 *
 * `illegal_from` เป็นเคสที่เจอบ่อยที่สุดและมีสาเหตุเดียวเสมอ: แอดมินหรืออีก
 * อุปกรณ์เปลี่ยนสถานะไปแล้ว หน้าจอในมือจึงเก่า — บอกให้ดึงรีเฟรช ไม่ใช่บอกว่า
 * "ผิดพลาด"
 */
export function transitionErrorMessage(code: string | null | undefined, fallback?: string): string {
  switch (code) {
    case 'illegal_from':
      return 'สถานะงานนี้เปลี่ยนไปแล้ว (แอดมินหรืออีกเครื่องอาจเพิ่งอัปเดต) — ดึงหน้าจอลงเพื่อรีเฟรชแล้วลองใหม่';
    case 'not_job_owner':
      return 'งานนี้ไม่ได้อยู่ในมือคุณแล้ว กรุณารีเฟรชหน้าจอ';
    case 'wrong_actor':
      return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
    case 'job_not_found':
      return 'ไม่พบงานนี้แล้ว (อาจถูกลบหรือย้ายไปประวัติ)';
    case 'wrong_receive_method':
      return 'งานนี้ไม่ใช่งานรับถึงบ้าน จึงไม่มีขั้นตอนนี้ — ติดต่อแอดมิน';
    case 'already_paid':
      return 'งานนี้จ่ายเงินไปแล้ว ทำรายการนี้ไม่ได้';
    case 'not_paid':
      return 'ต้องรอโอนเงินให้ลูกค้าก่อนจึงจะดำเนินการต่อได้';
    case 'missing_field':
      return 'ข้อมูลงานยังไม่ครบสำหรับขั้นตอนนี้ — ติดต่อแอดมิน';
    case 'write_contended':
      return 'มีคนแก้ไขงานนี้พร้อมกัน กรุณาลองใหม่อีกครั้ง';
    case 'unreadable_status':
      return 'สถานะงานนี้อ่านไม่ออก กรุณาแจ้งแอดมิน';
    default:
      return fallback || 'เกิดข้อผิดพลาดในการอัปเดตสถานะ กรุณาลองใหม่';
  }
}

/**
 * ดึงรหัสข้อผิดพลาดของ engine ออกจาก error ของ callable
 *
 * `httpsCallable` ห่อ `details` ที่ server ใส่มาไว้ที่ `error.details` — engine
 * ใส่ `{ code }` ไว้ตรงนั้น ส่วน `error.code` เป็นรหัส gRPC ("permission-denied")
 * ซึ่งหยาบเกินกว่าจะบอกไรเดอร์ได้ว่าเกิดอะไร
 */
export function engineErrorCode(error: unknown): string | null {
  const details = (error as { details?: unknown } | null)?.details;
  if (details && typeof details === 'object' && typeof (details as { code?: unknown }).code === 'string') {
    return (details as { code: string }).code;
  }
  return null;
}

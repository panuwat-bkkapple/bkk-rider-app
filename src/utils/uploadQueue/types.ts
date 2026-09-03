// โครงของงานในคิวอัปโหลด — ดู docs/reports/2026-09-01-rider-upload-offline-queue-plan.md
//
// คิวนี้มีไว้เพื่อกรณีเดียว: ไรเดอร์ถ่ายสลิปค่าทางด่วน/ค่าจอดรถตอนอยู่ใต้ลาน
// จอดที่ไม่มีสัญญาณ แล้วรายการต้องไม่หายไปกับความมืด
//
// **ทุกฟิลด์ที่เป็น "ที่อยู่ปลายทาง" ถูกคำนวณตอน enqueue ไม่ใช่ตอนส่ง** —
// `storage_path` กับ `target.key` คงที่ตลอดชีพของงาน ทำให้การ retry เขียนทับ
// ที่เดิมเสมอ = idempotent **โดยโครงสร้าง** ไม่ใช่ด้วยการเช็คก่อนเขียน
// (การเช็คก่อนเขียนแพ้ race ได้ การเขียนทับที่เดิมไม่แพ้)

export type QueueState =
  /** รอส่ง */
  | 'pending'
  /** กำลังส่งอยู่รอบนี้ — มี leased_until กันสองรอบวิ่งชนกัน */
  | 'uploading'
  /** rules ปฏิเสธ / payload ไม่ผ่าน — ต้องมีคนทำอะไรสักอย่าง ไม่ retry ต่อ */
  | 'failed_permanent'
  /** Blob หายจาก IndexedDB — ต้องถ่ายใหม่ */
  | 'evidence_lost'
  /** ขึ้นระบบแล้ว เก็บไว้ให้ไรเดอร์เห็นว่าสำเร็จ */
  | 'done';

export interface QueuedFile {
  blob: Blob;
  /** ประกาศชัด ส่งต่อให้ uploadBytes — ปล่อยว่างแล้ว rules ปฏิเสธ */
  content_type: string;
  /** riders/{uid}/expenses/{id}/{uuid}.jpg — คงที่ตลอดชีพของงาน */
  storage_path: string;
  /** มีค่า = ขึ้นแล้ว ห้ามอัปซ้ำ (retry ไฟล์ที่เหลือเท่านั้น) */
  url?: string;
}

export interface QueuedUpload {
  /** สร้างฝั่ง client = idempotency key ของทั้งงาน และเป็น id ของแถวปลายทาง */
  id: string;
  /** เจ้าของงานตอน enqueue — สลับบัญชีแล้วงานเก่าต้องไม่ถูกส่งในนามคนใหม่ */
  uid: string;
  /** เวลาที่ไรเดอร์กดส่ง ไม่ใช่เวลาที่แถวขึ้นระบบ (คนละฟิลด์โดยตั้งใจ) */
  created_at: number;
  kind: 'expense_evidence';

  files: QueuedFile[];

  /** สิ่งที่จะส่งให้ callable — **แก้ได้ขณะ state === 'pending' เท่านั้น** */
  payload: {
    category: string;
    amount_thb: number;
    note: string;
    occurred_at: number;
    job_id: string | null;
  };

  state: QueueState;
  attempts: number;
  next_attempt_at: number;
  /** ข้อความภาษาคน ไม่ใช่ error code ดิบ — ไรเดอร์เป็นคนอ่าน */
  last_error?: string;
  /** กัน flush ซ้อน: งานที่ยัง lease ไม่หมดอายุ ห้ามหยิบไปทำซ้ำ */
  leased_until?: number;
}

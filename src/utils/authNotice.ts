// src/utils/authNotice.ts
//
// ข้อความหนึ่งบรรทัดที่ต้องรอดข้าม `window.location.reload()` ไปถึงจอล็อกอิน
//
// ที่มา: เส้นทางระงับบัญชีเรียก toast แล้ว reload ทันที — toast ตายไปกับหน้าเก่า
// ไรเดอร์เห็นแค่จอกรอกอีเมลเปล่าๆ โดยไม่รู้ว่าเพิ่งเกิดอะไรขึ้น ซึ่งขัดหลักการ
// ข้อ 4 (ความล้มเหลวเรื่อง auth ต้องมองเห็นได้และกดต่อได้)
//
// sessionStorage ไม่ใช่ localStorage โดยตั้งใจ — ข้อความนี้เป็นของ "รอบนี้"
// ไม่ควรโผล่ขึ้นมาอีกในอีกสามวันข้างหน้า และ **อ่านครั้งเดียวแล้วลบ**

const KEY = 'auth_notice';

export function setAuthNotice(message: string): void {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    // อ่านไม่ได้/เขียนไม่ได้ = เสียแค่ข้อความ ไม่ใช่เสียการทำงาน
  }
}

/** อ่านแล้วลบทันที — ข้อความเดิมต้องไม่ค้างข้ามการล็อกอินครั้งถัดไป */
export function takeAuthNotice(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

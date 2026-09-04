// ผู้สมัครใหม่ต้องมี approval_status ตั้งแต่แถวแรก — ตรวจจาก SOURCE ของ Register
//
// ที่มา (#145 follow-up): Register.tsx เคยเขียนแค่ status: 'Pending' ผู้สมัครใหม่
// จึงมี approval_status === undefined และทุกด่านต้องพึ่ง fallback ไป status ซึ่ง
// เป็นฟิลด์ที่ presence เขียนทับภายในสิบวินาทีหลังกดรับงาน. เทสอ่านไฟล์ตรงๆ
// เพราะสิ่งที่ต้องกันคือ "มีคนลบบรรทัด approval_status ออก" ซึ่งเป็นบรรทัดในไฟล์
// ไม่ใช่ค่าที่ฟังก์ชันคืน (Register เป็น component ที่เรียก set() ของ firebase)
//
// rules ฝั่ง bkk-frontend-next (riders/$uid/approval_status .validate) อนุญาตให้
// เจ้าของแถวเขียน 'Pending' ได้เฉพาะตอนสร้าง — ค่าอื่นยังเป็นแอดมินเท่านั้น
// ห้ามเปลี่ยนค่าตรงนี้เป็นอย่างอื่นโดยไม่แก้ rules ก่อน ไม่งั้นสมัครไม่ผ่านเงียบๆ

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, 'Register.tsx'), 'utf-8');
const start = src.indexOf('set(ref(db, `riders/${uid}`)');
const block = src.slice(start, src.indexOf('});', start));

describe('Register เขียนแถวไรเดอร์', () => {
  it('หาบล็อก set(riders/{uid}) เจอ', () => {
    expect(start).toBeGreaterThan(0);
  });

  it("เขียน approval_status: 'Pending' — ค่านี้เท่านั้นที่ rules ให้เจ้าของเขียนตอนสร้าง", () => {
    expect(block).toMatch(/approval_status:\s*'Pending'/);
  });

  it("ยังเขียน status: 'Pending' ด้วย — ตัวอ่านเก่าที่ fallback ยังต้องเห็น", () => {
    expect(block).toMatch(/\bstatus:\s*'Pending'/);
  });
});

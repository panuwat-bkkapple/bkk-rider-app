// ผลการทำ injection บน shouldLock:
//   1. `return true` เสมอ                        → แดง 4/6
//   2. `return false` เสมอ                       → แดง 2/6
//   3. ถอด guard เวลาติดลบ (นาฬิกาถอยหลัง)       → **ไม่แดง** → **ลบ guard ทิ้งแล้ว**
//   4. ถอด guard ค่าที่ parse ไม่ได้              → แดง 1/6
//   5. เปลี่ยน `>` เป็น `>=`                      → **ไม่แดง** และตั้งใจไม่เขียน
//      fixture มาดักขอบพอดีมิลลิวินาที เพราะเส้นแบ่ง 30 นาที ±1 ms ไม่มี
//      ความหมายเชิงพฤติกรรม การแต่งเทสให้ดูเหมือนมีด่านตรงนั้นจะหลอกคนอ่านรอบหน้า
//
// ข้อ 3 คือของจริงที่ injection จับได้ในรอบนี้: `if (elapsed < 0) return false;`
// **ไม่มีอินพุตไหนไปถึงมันได้เลย** เพราะ elapsed ที่ติดลบเทียบกับ LOCK_AFTER_MS
// ที่เป็นบวกได้ false อยู่แล้ว — ตัดสินโดยกลไกที่อยู่ *ก่อน* กฎที่ตั้งใจทดสอบ
// (กับดักข้อ 2 ใน CLAUDE.md) จึงลบ guard ทิ้งตามกฎ "ด่านที่ไปไม่ถึง ให้ลบ
// ไม่ใช่ ship" ส่วนเทสของเคสนี้เก็บไว้ เพราะมันตรึง**พฤติกรรม** ที่ยังถูกอยู่

import { describe, it, expect } from 'vitest';
import { shouldLock, LOCK_AFTER_MS } from './pinLock';

const NOW = 1_756_900_000_000;

describe('shouldLock', () => {
  it('ไม่มี timestamp = ไม่ล็อก (เพิ่งติดตั้ง / ยังไม่เคยถูกซ่อน)', () => {
    expect(shouldLock(null, NOW)).toBe(false);
  });

  it('ซ่อนไปไม่นาน = ไม่ล็อก', () => {
    expect(shouldLock(String(NOW - 60_000), NOW)).toBe(false);
    expect(shouldLock(String(NOW - LOCK_AFTER_MS + 60_000), NOW)).toBe(false);
  });

  it('เกิน 30 นาที = ล็อก', () => {
    expect(shouldLock(String(NOW - LOCK_AFTER_MS - 1000), NOW)).toBe(true);
  });

  it('cold start วันรุ่งขึ้น = ล็อก (เคสที่ setTimeout เดิมทำไม่ได้)', () => {
    expect(shouldLock(String(NOW - 24 * 60 * 60 * 1000), NOW)).toBe(true);
  });

  it('ค่าที่อ่านไม่ออก = ไม่ล็อก', () => {
    expect(shouldLock('abc', NOW)).toBe(false);
    expect(shouldLock('', NOW)).toBe(false);
    expect(shouldLock('0', NOW)).toBe(false);
  });

  it('นาฬิกาเครื่องถูกปรับถอยหลัง = ไม่ล็อก', () => {
    expect(shouldLock(String(NOW + 60 * 60 * 1000), NOW)).toBe(false);
  });
});

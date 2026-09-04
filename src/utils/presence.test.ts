// กติกาการเขียน Offline — เขียนจากทางเดินจริงของสวิตช์ ไม่ใช่จาก spec
//
// ผล injection — วัดจริงหลังรันทีละตัว (รันคู่กับ riderStandingParity.test.ts รวม 31):
//   เขียน Offline ทุกครั้งที่ next=false รวมตอน mount       → แดง 2
//   ไม่เขียนเลย                                         → แดง 1
//   presenceIsOn นับ Offline ว่าเปิด                       → แดง 1
//   broadcast (functions) ไม่ดู Offline — ย้อนเป็น #152      → แดง 2
//   broadcast กลับไปกรองด้วย Online/Busy                    → แดง 2

import { describe, it, expect } from 'vitest';
import { offlineWriteNeeded, presenceIsOn, PRESENCE_OFFLINE } from './presence';

describe('offlineWriteNeeded — เขียนเฉพาะตอนเปิด→ปิด', () => {
  it('กดปิดรับขณะเปิดอยู่ = เขียน', () => {
    expect(offlineWriteNeeded(true, false)).toBe(true);
  });

  it('ตอน mount (prev ยังไม่มี, next=false) = ห้ามเขียน — ไม่งั้นแค่เปิดแอปก็ทับกะที่ยังไม่จบ', () => {
    expect(offlineWriteNeeded(undefined, false)).toBe(false);
  });

  it('false→false (render ซ้ำ) = ไม่เขียน', () => {
    expect(offlineWriteNeeded(false, false)).toBe(false);
  });

  it('กดเปิดรับ = ไม่เขียน Offline (GPS จะเขียน Online เอง)', () => {
    expect(offlineWriteNeeded(false, true)).toBe(false);
    expect(offlineWriteNeeded(true, true)).toBe(false);
  });
});

describe('presenceIsOn — สวิตช์ตอนเปิดแอปตามฐานข้อมูล', () => {
  it('Online / Busy = เปิด', () => {
    expect(presenceIsOn('Online')).toBe(true);
    expect(presenceIsOn('Busy')).toBe(true);
  });

  it('Offline / ค่าอนุมัติ / ว่าง = ปิด', () => {
    expect(presenceIsOn(PRESENCE_OFFLINE)).toBe(false);
    expect(presenceIsOn('Active')).toBe(false);
    expect(presenceIsOn('Pending')).toBe(false);
    expect(presenceIsOn(undefined)).toBe(false);
    expect(presenceIsOn(null)).toBe(false);
  });
});

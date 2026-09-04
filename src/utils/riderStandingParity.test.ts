// สำเนาของ riderStanding มี 2 ที่ในรีโปนี้ (แอป + functions) และต้องให้คำตอบ
// เดียวกันทุกอินพุต — ไม่งั้นจอล็อกอินจะบอกว่า "ผ่าน" ขณะที่ push บอกว่า
// "ไม่ส่ง" หรือกลับกัน ซึ่งเป็นรูปบั๊กที่พื้นที่นี้ผลิตซ้ำมาตลอด
//
// ต่างจาก walletCategoryParity ที่ต้องเทียบข้อความในไฟล์ (เพราะ functions/src/
// index.ts เรียก initializeApp ตอนโหลด) — riderStanding ฝั่ง functions แยกเป็น
// ไฟล์ pure จึง import มารันจริงได้ทั้งคู่ เทสพฤติกรรม ไม่ใช่เทสตัวอักษร
//
// สำเนาที่ 3 อยู่คนละรีโป (bkk-system/functions/actor.js) ไม่ได้เทียบที่นี่
//
// ผล injection — วัดจริงหลังรันทีละตัวบนไฟล์ฝั่ง functions (ร่างแรกเขียน 3+1/3
// จากการเดา ผิด):
//   ทิ้ง fallback presence→Active                       → แดง 4 จาก 22
//   isBroadcastRecipient กลับไปดู status Online/Busy      → แดง 2
//   ค่าที่ไม่รู้จักกลายเป็น ACTIVE (fail open)            → แดง 5
//   rider เป็น null ให้ Active                           → แดง 2
//   index.ts กลับไปกรอง status เดิม (ตรวจจาก SOURCE)      → แดง 2
//   approval_status ว่างสตริงถือว่ามีค่า                   → แดง 1

import { describe, it, expect } from 'vitest';
import * as app from './riderStanding';
import * as fn from '../../functions/src/riderStanding';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// รูปแถวที่มีอยู่จริง + รูปที่กลัว — ไม่ใช่แค่ค่าที่นึกออก
const FIXTURES: Array<[string, { approval_status?: unknown; status?: unknown } | null | undefined]> = [
  ['production: อนุมัติแล้ว presence ทับแล้ว', { approval_status: 'Active', status: 'Busy' }],
  ['production: อนุมัติแล้ว ไม่เคยกดรับงาน (status ยังเป็นค่าอนุมัติ)', { approval_status: 'Active', status: 'Active' }],
  ['Register.tsx: ผู้สมัครใหม่ มีแต่ status', { status: 'Pending' }],
  ['ระงับแต่ presence ค้าง', { approval_status: 'Suspended', status: 'Busy' }],
  ['ปฏิเสธ', { approval_status: 'Rejected', status: 'Pending' }],
  ['แถวเก่า: ไม่มี approval_status เคยออนไลน์', { status: 'Online' }],
  ['แถวเก่า: ไม่มี approval_status เคยออฟไลน์', { status: 'Offline' }],
  ['แถวเก่า: ไม่มีอะไรเลย', {}],
  ['null', null],
  ['undefined', undefined],
  ['ค่าที่ไม่รู้จัก (fail closed)', { approval_status: 'Frozen' }],
  ['approval_status ว่างสตริง ตกไป status', { approval_status: '', status: 'Busy' }],
];

describe('riderStanding — สำเนาแอปกับสำเนา functions ต้องตอบเหมือนกัน', () => {
  it.each(FIXTURES)('%s', (_label, rider) => {
    expect(fn.effectiveApprovalStatus(rider)).toBe(app.effectiveApprovalStatus(rider));
    expect(fn.riderStanding(rider)).toBe(app.riderStanding(rider));
  });

  it('ค่าคงที่ STANDING ตรงกัน', () => {
    expect(fn.STANDING).toEqual(app.STANDING);
  });
});

describe('isBroadcastRecipient — ใครได้ push งาน broadcast', () => {
  it('อนุมัติแล้วแต่ไม่เคยกดรับงาน = ได้ (เคสจริงที่ของเดิมกรองทิ้ง)', () => {
    expect(fn.isBroadcastRecipient({ approval_status: 'Active', status: 'Active' })).toBe(true);
  });

  it('อนุมัติแล้ว presence Busy = ได้ (เหมือนเดิม)', () => {
    expect(fn.isBroadcastRecipient({ approval_status: 'Active', status: 'Busy' })).toBe(true);
  });

  it('ระงับแต่ presence ค้างเป็น Busy = ไม่ได้ (ของเดิมส่งให้)', () => {
    expect(fn.isBroadcastRecipient({ approval_status: 'Suspended', status: 'Busy' })).toBe(false);
  });

  it('ผู้สมัครที่ยังไม่อนุมัติ = ไม่ได้', () => {
    expect(fn.isBroadcastRecipient({ status: 'Pending' })).toBe(false);
  });

  it('แถวเก่าที่เคยออนไลน์ (ไม่มี approval_status) = ได้', () => {
    expect(fn.isBroadcastRecipient({ status: 'Online' })).toBe(true);
  });

  it('ค่าที่ไม่รู้จัก = ไม่ได้ (fail closed)', () => {
    expect(fn.isBroadcastRecipient({ approval_status: 'Frozen' })).toBe(false);
  });

  // ปิดรับมีผลจริงตั้งแต่มี writer ของ Offline (utils/presence.ts)
  it('อนุมัติแล้วแต่กดปิดรับ (status Offline) = ไม่ได้', () => {
    expect(fn.isBroadcastRecipient({ approval_status: 'Active', status: 'Offline' })).toBe(false);
  });

  it('แถวเก่าไม่มี approval_status และ status เป็น Offline = ไม่ได้ (เคยอนุมัติ แต่ปิดรับอยู่)', () => {
    expect(fn.isBroadcastRecipient({ status: 'Offline' })).toBe(false);
  });

  it('Online = ได้ — และต้องไม่กลับไปกรองด้วย Online/Busy (คนที่ยังไม่เคยกดรับงานถือค่า Active)', () => {
    expect(fn.isBroadcastRecipient({ approval_status: 'Active', status: 'Online' })).toBe(true);
    expect(fn.isBroadcastRecipient({ approval_status: 'Active', status: 'Active' })).toBe(true);
    expect(fn.isBroadcastRecipient({ approval_status: 'Active' })).toBe(true);
  });
});

describe('onBroadcastJob ต้องกรองผ่าน isBroadcastRecipient — ตรวจจาก SOURCE', () => {
  // การแก้กลับที่กลัวคือ "เอา status === Online/Busy กลับมาที่ index.ts" ซึ่งเป็น
  // บรรทัดในไฟล์ ไม่ใช่ค่าที่ฟังก์ชันคืน (index.ts import มารันไม่ได้ เพราะ
  // initializeApp ตอนโหลด — รูปเดียวกับ walletCategoryParity)
  const src = readFileSync(resolve(__dirname, '../../functions/src/index.ts'), 'utf-8');
  const start = src.indexOf('export const onBroadcastJob');
  const body = src.slice(start, src.indexOf('\n// ====', start + 1));

  it('หา onBroadcastJob เจอ', () => {
    expect(start).toBeGreaterThan(0);
  });

  it('เรียก isBroadcastRecipient(riderData)', () => {
    expect(body).toContain('isBroadcastRecipient(riderData)');
  });

  it('ไม่มีการเทียบ status กับ Online/Busy หลงเหลือ', () => {
    expect(body).not.toMatch(/status !== "Online"|status === "Online"|status !== "Busy"|status === "Busy"/);
  });
});

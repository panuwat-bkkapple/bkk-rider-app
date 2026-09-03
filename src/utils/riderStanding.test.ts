// เทสของด่านล็อกอิน — ก่อน PR นี้ **ไม่มีอะไรคุ้มมันเลย**
//
// ผลการทำ injection (ทำลายกฎทีละข้อในโค้ดแล้วรันชุดนี้ ตามวินัยใน
// bkk-frontend-next/CLAUDE.md — commit checkpoint ก่อนเริ่มทุกครั้ง):
//
//   1. `effectiveApprovalStatus` คืน `'Active'` เสมอ           → แดง 9/12
//   2. ถอด fallback ไป `status`                                → แดง 2/12
//      (จับเคสผู้สมัครใหม่ที่ Register เขียนแค่ status — ถ้าไม่แดงแปลว่า
//       fixture ไม่มีแถวรูปนั้น ซึ่งเป็นรูปที่มีอยู่จริงบน production)
//   3. ถอด PRESENCE_VALUES (ให้ Online/Busy ตกไป default)      → แดง 1/12
//   4. `riderStanding` คืน ACTIVE เมื่อเจอค่าที่ไม่รู้จัก
//      (ยกเลิก fail-closed)                                    → แดง 2/12
//   5. ให้ `status` ชนะ `approval_status`                       → แดง 7/12
//      ← ข้อนี้คือบั๊กที่ Task 3 หาเจอ
//
// บันทึกไว้เพราะเกือบพลาด: injection ข้อ 5 รอบแรกเขียนแบบ "ให้ status ชนะเฉพาะ
// เมื่อไม่ใช่ค่า presence" ซึ่ง**แดงแค่ 1 ตัว** เพราะเคสสำคัญ
// ({approval_status:'Suspended', status:'Online'}) มี status เป็น presence จึง
// ตกกลับไปอ่าน approval_status แล้วได้คำตอบถูกโดยบังเอิญ — injection ที่อ่อน
// เกินไปรายงานว่าเทส "ไม่คุ้ม" ทั้งที่จริงๆ คุ้ม ต้องทำลายกฎให้ถึงแก่นเสมอ

import { describe, it, expect } from 'vitest';
import { effectiveApprovalStatus, riderStanding, isSuspended, STANDING } from './riderStanding';

describe('effectiveApprovalStatus', () => {
  it('approval_status ชนะ status เสมอ', () => {
    expect(effectiveApprovalStatus({ approval_status: 'Active', status: 'Pending' })).toBe('Active');
    expect(effectiveApprovalStatus({ approval_status: 'Suspended', status: 'Online' })).toBe('Suspended');
  });

  it('ไม่มี approval_status → อ่านจาก status (แถวเก่าก่อนมีฟิลด์นี้)', () => {
    expect(effectiveApprovalStatus({ status: 'Pending' })).toBe('Pending');
    expect(effectiveApprovalStatus({ status: 'Rejected' })).toBe('Rejected');
  });

  it('presence ใน status แปลว่าเคยผ่านการอนุมัติ', () => {
    expect(effectiveApprovalStatus({ status: 'Online' })).toBe('Active');
    expect(effectiveApprovalStatus({ status: 'Busy' })).toBe('Active');
    expect(effectiveApprovalStatus({ status: 'Offline' })).toBe('Active');
  });

  it('ไม่มีอะไรเลย → Pending (fail closed)', () => {
    expect(effectiveApprovalStatus({})).toBe('Pending');
    expect(effectiveApprovalStatus(null)).toBe('Pending');
    expect(effectiveApprovalStatus({ status: '' })).toBe('Pending');
  });
});

describe('ด่านล็อกอิน (Login.tsx) — ใครผ่าน ใครไม่ผ่าน', () => {
  // เคสนี้คือเหตุผลที่เทียบ `approval_status === 'Pending'` ตรงๆ ไม่ได้:
  // Register.tsx เขียนแค่ `status: 'Pending'` ไม่เขียน approval_status เลย
  it('ผู้สมัครใหม่จาก Register (มีแค่ status: Pending) ต้องถูกบล็อก', () => {
    const brandNewApplicant = { status: 'Pending', email: 'a@b.c', name: 'สมชาย' };
    expect(riderStanding(brandNewApplicant)).toBe(STANDING.PENDING);
    expect(riderStanding(brandNewApplicant)).not.toBe(STANDING.ACTIVE);
  });

  it('รออนุมัติแบบมี approval_status ก็ต้องถูกบล็อก', () => {
    expect(riderStanding({ approval_status: 'Pending', status: 'Pending' })).toBe(STANDING.PENDING);
  });

  it('ไรเดอร์ที่อนุมัติแล้วผ่านได้', () => {
    expect(riderStanding({ approval_status: 'Active', status: 'Active' })).toBe(STANDING.ACTIVE);
  });

  it('ค่าที่ไม่รู้จักถูกบล็อก ไม่ใช่ปล่อยผ่าน (fail closed)', () => {
    expect(riderStanding({ approval_status: 'Quarantined' })).toBe(STANDING.BLOCKED);
    expect(riderStanding({ approval_status: 'Rejected' })).toBe(STANDING.BLOCKED);
    expect(riderStanding({ approval_status: 'Suspended' })).toBe(STANDING.BLOCKED);
  });
});

describe('presence ที่แอปไรเดอร์เขียนทับ ต้องไม่ขยับด่าน (บั๊กจาก Task 3)', () => {
  // useRiderData เขียน `status: 'Online' | 'Busy'` ทุก ~10 วินาทีขณะเปิดรับงาน
  // และ rules ไม่มี .validate ใต้ riders/$uid/status จึงเขียนได้จริง
  // ค่าอนุมัติที่ admin เขียนลง `status` จึงถูกทับหายภายในสิบวินาที

  it('ไรเดอร์ที่ถูกระงับแต่ presence เขียนทับ status เป็น Online → ยังถูกบล็อก', () => {
    const suspendedButOnline = { approval_status: 'Suspended', status: 'Online' };
    expect(riderStanding(suspendedButOnline)).toBe(STANDING.BLOCKED);
    expect(isSuspended(suspendedButOnline)).toBe(true);
  });

  it('ไรเดอร์ที่ถูกระงับแต่ presence เขียนทับเป็น Busy → ยังถูกบล็อก', () => {
    expect(isSuspended({ approval_status: 'Suspended', status: 'Busy' })).toBe(true);
  });

  it('ไรเดอร์ปกติที่ presence เป็น Online/Busy ยังผ่านตามเดิม', () => {
    expect(riderStanding({ approval_status: 'Active', status: 'Online' })).toBe(STANDING.ACTIVE);
    expect(riderStanding({ approval_status: 'Active', status: 'Busy' })).toBe(STANDING.ACTIVE);
    expect(isSuspended({ approval_status: 'Active', status: 'Busy' })).toBe(false);
  });

  it('ด่านเดิมที่อ่าน status ตรงๆ จะพลาดเคสระงับ — บันทึกไว้ว่าทำไมถึงย้าย', () => {
    const suspendedButOnline = { approval_status: 'Suspended', status: 'Online' };
    // สิ่งที่โค้ดเดิมทำ:
    expect(suspendedButOnline.status === 'Suspended').toBe(false); // ← ปล่อยผ่าน
    // สิ่งที่โค้ดใหม่ทำ:
    expect(isSuspended(suspendedButOnline)).toBe(true);            // ← บล็อก
  });
});

// เทสของ classifyRiderJob — เขียนจากเคสจริง 5 ก.ย. 2569: แอดมินกด "ผ่าน QC →
// ส่ง QC Lab" บนงานที่ไรเดอร์ส่งมอบแล้ว งานหายจากแท็บประวัติของไรเดอร์ทันที
// (สถานะ Sent To QC Lab ไม่อยู่ในลิสต์ที่พิมพ์มือ) ไม่ใช่จาก spec
//
// INJECTION (วัดจริง 5 ก.ย. 2569 — ตัวเลขหลังวัด ไม่ใช่ก่อน):
//   1. DONE_PHASES → เทียบลิสต์ชื่อเดิม (Pending QC/In Stock/Paid/Completed/
//      Return Confirmed/Closed (Lost)) แทน phase                          → แดง 6
//   2. history ในคลังกลับไปบังคับ completed_at                             → แดง 4
//   3. ถอด PENDING_CLOSE ออกจาก DONE_PHASES (Cancelled หาย)                 → แดง 2
//   4. Paid ที่มี completed_at ยังเป็น active                                → แดง 1
//   5. ChatModal / useRiderData กลับไปพิมพ์เซ็ตของตัวเอง                     → แดง 1
//      (เทสสแกน source — ไม่มี render test ในรีโปนี้)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyRiderJob, historyTimeOf, isActiveRiderJob, isRiderJobDone } from './riderJobLists';
import { JOB_STATUS, PHASE, getPhase } from '../types/job-statuses';
import type { Phase } from '../types/job-statuses';

const T = 1_757_050_000_000;
const pickup = (status: string, extra: Record<string, unknown> = {}) => ({
  status,
  receive_method: 'Pickup',
  rider_id: 'R1',
  ...extra,
});

describe('classifyRiderJob — งานที่แอดมินเดินต่อในคลังหลังไรเดอร์ส่งมอบ', () => {
  it('ส่ง QC Lab แล้วยังอยู่ในประวัติ (เคสจริง — ทั้งสะกด canonical และสะกดเก่าของแอดมิน)', () => {
    expect(classifyRiderJob(pickup(JOB_STATUS.SENT_TO_QC_LAB, { completed_at: T }))).toBe('history');
    expect(classifyRiderJob(pickup('Sent to QC Lab', { completed_at: T }))).toBe('history');
  });

  it('ทุกขั้นของคลังจนถึงขายและปิดงาน = ประวัติ', () => {
    for (const status of [
      JOB_STATUS.PENDING_QC,
      JOB_STATUS.IN_STOCK,
      JOB_STATUS.READY_TO_SELL,
      JOB_STATUS.RESERVED,
      JOB_STATUS.SOLD,
      JOB_STATUS.COMPLETED,
    ]) {
      expect(classifyRiderJob(pickup(status, { completed_at: T })), status).toBe('history');
    }
  });

  it('เข้าคลังโดยแอดมินรับเครื่องเอง (ไม่มี completed_at) ก็ยังเป็นประวัติ ไม่หายจากทั้งสองลิสต์', () => {
    expect(classifyRiderJob(pickup(JOB_STATUS.PENDING_QC))).toBe('history');
    expect(classifyRiderJob(pickup(JOB_STATUS.IN_STOCK))).toBe('history');
  });

  it('ยกเลิกหลังกดรับ = ประวัติ แม้ไม่มี completed_at (ไรเดอร์ต้องเห็นว่าเกิดอะไรขึ้น)', () => {
    expect(classifyRiderJob(pickup(JOB_STATUS.CANCELLED, { cancelled_at: T }))).toBe('history');
    expect(classifyRiderJob(pickup(JOB_STATUS.CLOSED_LOST))).toBe('history');
  });

  it('ไม่มีสถานะไหนใน phase ที่ส่วนของไรเดอร์จบแล้วถูกทิ้ง — กติกาโตตาม job-statuses.ts เอง', () => {
    const done = new Set<Phase>([PHASE.INVENTORY, PHASE.TERMINAL, PHASE.PENDING_CLOSE, PHASE.EXCEPTION]);
    for (const status of Object.values(JOB_STATUS)) {
      if (!done.has(getPhase(status))) continue;
      expect(classifyRiderJob(pickup(status)), `${status} without completed_at`).toBe('history');
      expect(classifyRiderJob(pickup(status, { completed_at: T })), `${status} with completed_at`).toBe('history');
    }
  });
});

describe('classifyRiderJob — งานที่ไรเดอร์ยังต้องทำ', () => {
  it('ระหว่างทางและตรวจสภาพ = active (รวมสะกดเก่า)', () => {
    expect(classifyRiderJob(pickup(JOB_STATUS.RIDER_ACCEPTED))).toBe('active');
    expect(classifyRiderJob(pickup('Accepted'))).toBe('active');
    expect(classifyRiderJob(pickup(JOB_STATUS.RIDER_EN_ROUTE))).toBe('active');
    expect(classifyRiderJob(pickup(JOB_STATUS.QC_REVIEW))).toBe('active');
    expect(classifyRiderJob(pickup('In-Transit'))).toBe('active'); // Pickup → Rider Returning
    expect(isActiveRiderJob(pickup(JOB_STATUS.WAITING_FOR_HANDOVER))).toBe(true);
  });

  it('จ่ายเงินแล้วแต่ยังไม่ส่งมอบ = active · ส่งมอบแล้ว (completed_at) = ประวัติ', () => {
    expect(classifyRiderJob(pickup(JOB_STATUS.PAID))).toBe('active');
    expect(classifyRiderJob(pickup('PAID'))).toBe('active');
    expect(classifyRiderJob(pickup(JOB_STATUS.PAID, { completed_at: T }))).toBe('history');
  });

  it('กองงานที่ยังไม่รับ / สถานะที่ไรเดอร์ไม่เกี่ยว / อ่านไม่ออก = ไม่อยู่ในลิสต์ไหน', () => {
    expect(classifyRiderJob(pickup(JOB_STATUS.RIDER_ASSIGNED))).toBeNull();
    expect(classifyRiderJob(pickup(JOB_STATUS.FOLLOWING_UP))).toBeNull();
    expect(classifyRiderJob(pickup('Something New'))).toBeNull();
    expect(classifyRiderJob(null)).toBeNull();
    expect(classifyRiderJob({})).toBeNull();
  });
});

describe('isRiderJobDone / historyTimeOf', () => {
  it('แชทปิดด้วยกติกาเดียวกับประวัติ', () => {
    expect(isRiderJobDone(pickup(JOB_STATUS.SENT_TO_QC_LAB, { completed_at: T }))).toBe(true);
    expect(isRiderJobDone(pickup(JOB_STATUS.SOLD))).toBe(true);
    expect(isRiderJobDone(pickup(JOB_STATUS.RIDER_ARRIVED))).toBe(false);
  });

  it('เวลาเรียงประวัติ: completed_at → updated_at → created_at → 0', () => {
    expect(historyTimeOf({ completed_at: 3, updated_at: 2, created_at: 1 })).toBe(3);
    expect(historyTimeOf({ updated_at: 2, created_at: 1 })).toBe(2);
    expect(historyTimeOf({ created_at: 1 })).toBe(1);
    expect(historyTimeOf({})).toBe(0);
  });
});

// กฎมีสองคนอ่าน (ประวัติ + แชท) — ด่านนี้บังคับว่าทั้งคู่ถามที่เดียว ไม่พิมพ์เซ็ตเอง
describe('ผู้อ่านทุกคนใช้ riderJobLists ไม่พิมพ์เซ็ตสถานะเอง', () => {
  const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
  const readers: Array<[string, RegExp]> = [
    ['hooks/useRiderData.ts', /from '\.\.\/utils\/riderJobLists'/],
    ['components/chat/ChatModal.tsx', /from '\.\.\/\.\.\/utils\/riderJobLists'/],
  ];
  for (const [rel, importRe] of readers) {
    it(rel, () => {
      const text = src(rel);
      expect(text, `${rel} must import from riderJobLists`).toMatch(importRe);
      expect(text, `${rel} must not build its own status Set`).not.toMatch(/new Set<[^>]*>\(\s*\[\s*JOB_STATUS\./);
      expect(text, `${rel} must not build its own status Set`).not.toMatch(/new Set<[^>]*>\(\s*\[\n\s*JOB_STATUS\./);
    });
  }
});

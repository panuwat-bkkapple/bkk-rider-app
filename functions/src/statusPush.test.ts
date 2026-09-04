// เขียนจากสามทางที่ลง 'Paid' จริงในตาราง engine ของ bkk-system (status-engine.js)
// ไม่ใช่จาก spec — คู่ before→after คือสิ่งที่ trigger เห็น
//
// injection (ทำทีละตัว วัดหลังรัน):
//   1. ตัดเงื่อนไข before ออก (Paid = payout เสมอ)     -> แดง 2 (handover done + ทางลัดมือถือ)
//   2. ตัด Paid ออก (คืนเฉพาะ PAYOUT_STATUSES)          -> แดง 1 (B2B)
//   3. เทียบ 'Payment Completed' หายไปจากเซ็ต          -> แดง 1
import { describe, it, expect } from 'vitest';
import { isPayoutTransition } from './statusPush';

describe('isPayoutTransition', () => {
  it('ขา B2C: Payout Processing / Price Accepted -> Waiting For Handover ทั้งสองสะกด', () => {
    for (const after of ['Waiting For Handover', 'Waiting for Handover']) {
      expect(isPayoutTransition('Payout Processing', after)).toBe(true);
      expect(isPayoutTransition('Price Accepted', after)).toBe(true);
    }
  });

  it('ขา B2B: Pending Finance Approval -> Paid (engine) และ -> Payment Completed (writer เก่า) เท่ากัน', () => {
    expect(isPayoutTransition('Pending Finance Approval', 'Paid')).toBe(true);
    expect(isPayoutTransition('Pending Finance Approval', 'PAID')).toBe(true);
    expect(isPayoutTransition('Pending Finance Approval', 'Payment Completed')).toBe(true);
  });

  it('ไรเดอร์ส่งมอบเสร็จ (Waiting For Handover -> Paid) ไม่ใช่ payout — เงินออกไปแล้วตอนก่อนหน้า', () => {
    expect(isPayoutTransition('Waiting For Handover', 'Paid')).toBe(false);
    expect(isPayoutTransition('Rider Returning', 'Paid')).toBe(false);
  });

  it('ทางลัด "จ่ายเงินแล้ว" บนมือถือ (Payout Processing -> Paid) คงพฤติกรรมเดิม = ไม่ใช่ payout', () => {
    expect(isPayoutTransition('Payout Processing', 'Paid')).toBe(false);
  });

  it('ค่าอื่น / ค่าว่าง', () => {
    expect(isPayoutTransition('Pending QC', 'In Stock')).toBe(false);
    expect(isPayoutTransition(null, null)).toBe(false);
    expect(isPayoutTransition(undefined, 'Completed')).toBe(false);
  });
});

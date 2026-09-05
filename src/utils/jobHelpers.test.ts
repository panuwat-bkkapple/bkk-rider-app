// เทสของ getRiderPayout / sumRiderPayout — เขียนจากรูปข้อมูลจริงที่ trigger
// ฝั่ง bkk-system เขียนลง jobs/{id} (rider_fee, rider_fee_estimate,
// rider_fee_estimate_meta.fee_by_vehicle) ไม่ใช่จาก spec
//
// สิ่งที่ชุดนี้ตรึงไว้คือ "ห้ามมีค่า default ที่แต่งขึ้น" — ถ้ามีใครใส่เลข
// fallback กลับเข้ามา (เช่น 150 ที่เคยอยู่ในหน้าประวัติ) เคส
// "ไม่มีทั้ง fee และ estimate" จะแดงทันที
//
// INJECTION (วัดจริง 5 ก.ย. 2569 — ตัวเลขหลังวัด ไม่ใช่ก่อน):
//   1. earnedRiderFee คืนยอดที่ตรึงบนงานที่ยกเลิกโดยไม่ดู rider_fee_status → แดง 2
//   2. getRiderPayout ให้งานที่ยกเลิกตกไปหาประมาณการ                        → แดง 3
//   3. historyStats นับงานที่ยกเลิกเป็นจำนวนงาน                              → แดง 2
//   4. riderFeeQueued รับเฉพาะ Paid ไม่รับ Pending (ค่าเสียเวลาหาย)          → แดง 2
//   5. isCancelledJob เทียบ status ดิบแทน normalizeStatus                     → เขียว
//      — ไม่มีสะกด legacy ของ Cancelled ใน LEGACY_ALIAS วันนี้ สองทางจึงเท่ากันบน
//      ข้อมูลจริง นี่คือกฎขอบเขต (เทียบสถานะผ่าน normalize เสมอ) ไม่ใช่ด่าน
//      ห้ามแต่ง fixture สะกดปลอมมาให้ดูเหมือนมีด่าน
//   6. HistoryJobSheet กลับไปอ่าน job.rider_fee ตรง                          → เขียว
//      — รีโปนี้ไม่มี render test (ไม่มี testing-library) ด่านของ sheet คือ
//      การเปิดดูบน preview ก่อน merge: งานที่ยกเลิกต้องไม่มี "+฿" และไม่มีกล่อง
//      "ค่ารอบรอเข้ากระเป๋า"
import { describe, it, expect } from 'vitest';
import { cancelSourceLabel, earnedRiderFee, getRiderPayout, historyStats, sumRiderPayout } from './jobHelpers';

describe('getRiderPayout', () => {
  it('ค่ารอบที่ประทับแล้วชนะทุกอย่าง', () => {
    const job = {
      rider_fee: 240,
      rider_fee_estimate: 180,
      rider_fee_estimate_meta: { fee_by_vehicle: { motorcycle: 180, car: 300 } },
    };
    expect(getRiderPayout(job, 'car')).toBe(240);
  });

  it('ยังไม่ประทับ = ใช้ค่าของยานพาหนะคนที่ดูอยู่', () => {
    const job = {
      rider_fee_estimate: 180,
      rider_fee_estimate_meta: { fee_by_vehicle: { motorcycle: 180, car: 300 } },
    };
    expect(getRiderPayout(job, 'car')).toBe(300);
    expect(getRiderPayout(job, 'motorcycle')).toBe(180);
  });

  it('ไม่รู้ยานพาหนะ = ใช้ตัวเลขกลางที่เก็บไว้ ไม่เดา', () => {
    const job = {
      rider_fee_estimate: 180,
      rider_fee_estimate_meta: { fee_by_vehicle: { motorcycle: 180, car: 300 } },
    };
    expect(getRiderPayout(job, null)).toBe(180);
  });

  it('ไม่มีทั้ง fee และ estimate = 0 ห้ามเป็นเลขที่แต่งขึ้น', () => {
    expect(getRiderPayout({}, 'motorcycle')).toBe(0);
    expect(getRiderPayout({ rider_fee: 0 }, 'motorcycle')).toBe(0);
    expect(getRiderPayout(null, 'motorcycle')).toBe(0);
  });
});

describe('sumRiderPayout', () => {
  it('ยอดรวมเท่ากับผลรวมของเลขที่การ์ดแต่ละใบโชว์', () => {
    const jobs = [
      { rider_fee: 240 },
      { rider_fee_estimate: 180, rider_fee_estimate_meta: { fee_by_vehicle: { motorcycle: 180, car: 300 } } },
      {},
    ];
    const cards = jobs.map((j) => getRiderPayout(j, 'car'));
    expect(sumRiderPayout(jobs, 'car')).toBe(cards.reduce((a, b) => a + b, 0));
    expect(sumRiderPayout(jobs, 'car')).toBe(540);
  });

  it('งานที่ยังไม่มีตัวเลขไม่ดันยอดรวมขึ้น (กันเลข default กลับมา)', () => {
    expect(sumRiderPayout([{}, {}, {}], 'motorcycle')).toBe(0);
  });

  it('ลิสต์ว่าง / ไม่ใช่ array = 0', () => {
    expect(sumRiderPayout([], 'motorcycle')).toBe(0);
    expect(sumRiderPayout(undefined as any, 'motorcycle')).toBe(0);
  });
});

// ── งานที่ยกเลิก ─────────────────────────────────────────────────────────────
// รูปข้อมูลจริง (5 ก.ย. 2569): กดรับ → onRiderAssignedRecalcEstimate ตรึง
// rider_fee=324 (frozen_source='accepted') → ลูกค้ายกเลิกจากเว็บ → status
// 'Cancelled' + cancelled_by 'customer' โดย rider_id/rider_fee ยังอยู่ และ
// rider_fee_status ไม่มี (ไม่เคยเข้าคิวจ่ายเงิน)
const frozenThenCancelled = {
  status: 'Cancelled',
  receive_method: 'Pickup',
  rider_id: 'R1',
  cancelled_by: 'customer',
  rider_fee: 324,
  rider_fee_meta: { frozen_source: 'accepted', frozen_for_rider_id: 'R1' },
  rider_fee_estimate: 324,
  rider_fee_estimate_meta: { fee_by_vehicle: { motorcycle: 324, car: 420 } },
};

// ค่าเสียเวลา — reviewAmendment (customer_request_cancel) ฝั่ง bkk-system เขียน
// rider_fee + rider_fee_status='Pending' คู่กัน เมื่อลูกค้ายกเลิกหลังออกเดินทาง
const cancelledWithTimeLoss = {
  status: 'Cancelled',
  receive_method: 'Pickup',
  rider_id: 'R1',
  rider_fee: 100,
  rider_fee_status: 'Pending',
  rider_fee_breakdown: { type: 'time_loss_customer_cancel', amount: 100 },
};

describe('earnedRiderFee / getRiderPayout กับงานที่ยกเลิก', () => {
  it('ยอดที่ตรึงตอนกดรับบนงานที่ยกเลิก = ไม่ใช่เงิน (บั๊ก +฿324 บนการ์ด)', () => {
    expect(earnedRiderFee(frozenThenCancelled)).toBeNull();
    expect(getRiderPayout(frozenThenCancelled, 'motorcycle')).toBe(0);
    expect(getRiderPayout(frozenThenCancelled, 'car')).toBe(0);
    expect(getRiderPayout(frozenThenCancelled, null)).toBe(0);
  });

  it('งานที่ยกเลิกไม่ตกไปหาประมาณการ แม้ไม่มี rider_fee เลย', () => {
    const job = { status: 'Cancelled', receive_method: 'Pickup', rider_fee_estimate: 180 };
    expect(getRiderPayout(job, 'motorcycle')).toBe(0);
  });

  it('ค่าเสียเวลาที่เข้าคิวจ่ายแล้ว (Pending) ยังเป็นเงินของไรเดอร์', () => {
    expect(earnedRiderFee(cancelledWithTimeLoss)).toBe(100);
    expect(getRiderPayout(cancelledWithTimeLoss, 'motorcycle')).toBe(100);
    expect(earnedRiderFee({ ...cancelledWithTimeLoss, rider_fee_status: 'Paid' })).toBe(100);
  });

  it('งานที่ไม่ได้ยกเลิก ยอดที่ตรึงไว้ยังนับเหมือนเดิม แม้ยังไม่มี rider_fee_status', () => {
    const job = { ...frozenThenCancelled, status: 'Rider Accepted' };
    expect(earnedRiderFee(job)).toBe(324);
    expect(getRiderPayout(job, 'car')).toBe(324);
  });
});

describe('historyStats', () => {
  it('งานที่ยกเลิกอยู่ในลิสต์ได้ แต่ไม่นับเป็นงานและไม่เป็นรายได้', () => {
    const done = { status: 'Completed', receive_method: 'Pickup', rider_fee: 324, rider_fee_status: 'Paid' };
    const stats = historyStats([done, frozenThenCancelled], 'motorcycle');
    expect(stats).toEqual({ income: 324, count: 1, cancelled: 1 });
  });

  it('ค่าเสียเวลาของงานที่ยกเลิกเข้ายอดรวม แต่ยังไม่นับเป็นงานที่ทำจบ', () => {
    const stats = historyStats([cancelledWithTimeLoss], 'motorcycle');
    expect(stats).toEqual({ income: 100, count: 0, cancelled: 1 });
  });

  it('ลิสต์ว่าง / ไม่ใช่ array', () => {
    expect(historyStats([], 'motorcycle')).toEqual({ income: 0, count: 0, cancelled: 0 });
    expect(historyStats(undefined as any, 'motorcycle')).toEqual({ income: 0, count: 0, cancelled: 0 });
  });
});

describe('cancelSourceLabel', () => {
  it('อ่านรูป cancelled_by ที่ระบบเขียนจริง', () => {
    expect(cancelSourceLabel('customer')).toBe('ลูกค้ายกเลิกงาน');
    expect(cancelSourceLabel('customer:self')).toBe('ลูกค้ายกเลิกงาน');
    expect(cancelSourceLabel('admin:S01')).toBe('แอดมินยกเลิกงาน');
    expect(cancelSourceLabel('system')).toBe('ระบบยกเลิกงานอัตโนมัติ');
    expect(cancelSourceLabel('rider:R1')).toBe('คุณยกเลิกงานนี้');
  });

  it('ไม่รู้จัก/ไม่มี = บอกแค่ว่ายกเลิก ไม่เดาว่าใคร', () => {
    expect(cancelSourceLabel(undefined)).toBe('งานถูกยกเลิก');
    expect(cancelSourceLabel('')).toBe('งานถูกยกเลิก');
    expect(cancelSourceLabel('someone_new')).toBe('งานถูกยกเลิก');
  });
});

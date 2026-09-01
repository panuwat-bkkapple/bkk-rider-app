// เทสของ getRiderPayout / sumRiderPayout — เขียนจากรูปข้อมูลจริงที่ trigger
// ฝั่ง bkk-system เขียนลง jobs/{id} (rider_fee, rider_fee_estimate,
// rider_fee_estimate_meta.fee_by_vehicle) ไม่ใช่จาก spec
//
// สิ่งที่ชุดนี้ตรึงไว้คือ "ห้ามมีค่า default ที่แต่งขึ้น" — ถ้ามีใครใส่เลข
// fallback กลับเข้ามา (เช่น 150 ที่เคยอยู่ในหน้าประวัติ) เคส
// "ไม่มีทั้ง fee และ estimate" จะแดงทันที
import { describe, it, expect } from 'vitest';
import { getRiderPayout, sumRiderPayout } from './jobHelpers';

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

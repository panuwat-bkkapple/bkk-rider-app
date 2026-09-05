// ตัวเขียน Pending ของแอปไรเดอร์ต้องไม่ทับปลายทาง (Paid / Waived)
//
// INJECTION (วัดจริง 5 ก.ย. 2569): handoverPatch คืน rider_fee_status:'Pending' ตายตัว -> แดง 2
import { describe, it, expect } from 'vitest';
import { handoverPatch } from './handoverPatch';
import { RIDER_FEE_STATUS } from '../types/riderFeeStatus';

const NOW = 1_757_000_000_000;

describe('handoverPatch', () => {
  it('ยังไม่มีสถานะ (งานปกติที่เพิ่งส่งมอบ) = ตั้ง Pending เข้าคิวอนุมัติ', () => {
    expect(handoverPatch({}, NOW)).toEqual({ completed_at: NOW, rider_fee_status: RIDER_FEE_STATUS.PENDING });
    expect(handoverPatch({ rider_fee_status: '' }, NOW)).toEqual({ completed_at: NOW, rider_fee_status: RIDER_FEE_STATUS.PENDING });
    expect(handoverPatch(null, NOW)).toEqual({ completed_at: NOW, rider_fee_status: RIDER_FEE_STATUS.PENDING });
  });

  it('Paid / Waived เป็นปลายทาง — ส่งมอบซ้ำต้องไม่ดึงกลับเป็น Pending', () => {
    expect(handoverPatch({ rider_fee_status: RIDER_FEE_STATUS.PAID }, NOW)).toEqual({ completed_at: NOW });
    expect(handoverPatch({ rider_fee_status: RIDER_FEE_STATUS.WAIVED }, NOW)).toEqual({ completed_at: NOW });
  });

  it('Pending อยู่แล้ว = ไม่เขียนซ้ำ (patch เล็กที่สุด)', () => {
    expect(handoverPatch({ rider_fee_status: RIDER_FEE_STATUS.PENDING }, NOW)).toEqual({ completed_at: NOW });
  });
});

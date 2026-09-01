// เทสตามรูปข้อมูลจริงบน production: งานใหม่มี checkpoints ครบ 5 จุด,
// งานยุคเก่า (รวม 121 ใบที่ settle ย้อนหลัง) ไม่มี checkpoints เลย —
// กติกาสำคัญคือข้อมูลหาย = null ไม่ใช่ 0
import { describe, it, expect } from 'vitest';
import {
  buildJobTimeline,
  checkpointAt,
  formatDurationTh,
  jobDistanceKm,
  totalJobMs,
  travelToCustomerMs,
} from './jobTimeline';

const T0 = 1_756_600_000_000;
const min = (n: number) => n * 60000;

const fullJob = {
  completed_at: T0 + min(70),
  rider_fee_meta: { distance_km: 6.4 },
  checkpoints: {
    rider_accepted: { at: T0 },
    rider_en_route: { at: T0 + min(3) },
    rider_arrived: { at: T0 + min(21), distance_m: 24, target: { label: 'พิกัดลูกค้า' } },
    customer_left: { at: T0 + min(37) },
    branch_handover: { at: T0 + min(65), distance_m: 80, target: { label: 'สาขาลาดพร้าว' } },
  },
};

describe('buildJobTimeline', () => {
  it('งานครบ 5 จุด: เรียงตามลำดับ พร้อมช่วงเวลาจากจุดก่อนหน้า', () => {
    const tl = buildJobTimeline(fullJob);
    expect(tl.map((e) => e.stage)).toEqual([
      'rider_accepted', 'rider_en_route', 'rider_arrived', 'customer_left', 'branch_handover',
    ]);
    expect(tl[0].sincePrevMs).toBeNull();
    expect(tl[2].sincePrevMs).toBe(min(18));
    expect(tl[2].distanceM).toBe(24);
    expect(tl[4].targetLabel).toBe('สาขาลาดพร้าว');
  });

  it('จุดที่ขาดหาย = ไม่มีแถว และช่วงเวลาข้ามจุดที่หายยังคำนวณจากจุดก่อนหน้าที่มีจริง', () => {
    const job = {
      checkpoints: {
        rider_accepted: { at: T0 },
        rider_arrived: { at: T0 + min(20) },
      },
    };
    const tl = buildJobTimeline(job);
    expect(tl).toHaveLength(2);
    expect(tl[1].sincePrevMs).toBe(min(20));
  });

  it('งานเก่าไม่มี checkpoints = ว่างเปล่า ไม่ throw', () => {
    expect(buildJobTimeline({})).toEqual([]);
    expect(buildJobTimeline({ checkpoints: null })).toEqual([]);
  });

  it('at ที่ไม่ใช่เลขจริงถูกข้ามทั้งจุด (กับดัก Number(null) === 0)', () => {
    const job = { checkpoints: { rider_accepted: { at: null }, rider_en_route: { at: 'x' } } };
    expect(buildJobTimeline(job)).toEqual([]);
    expect(checkpointAt(job, 'rider_accepted')).toBeNull();
  });
});

describe('ช่วงเวลาสรุป', () => {
  it('เดินทางไปหาลูกค้า = ถึงลูกค้า − ออกเดินทาง', () => {
    expect(travelToCustomerMs(fullJob)).toBe(min(18));
    expect(travelToCustomerMs({})).toBeNull();
  });

  it('เวลารวม = รับงาน → ส่งมอบสาขา และ fallback completed_at เมื่อไม่มีจุดปลาย', () => {
    expect(totalJobMs(fullJob)).toBe(min(65));
    const noHandover = {
      completed_at: T0 + min(50),
      checkpoints: { rider_accepted: { at: T0 } },
    };
    expect(totalJobMs(noHandover)).toBe(min(50));
    expect(totalJobMs({ completed_at: T0 })).toBeNull(); // ไม่มีจุดเริ่ม = ไม่เดา
  });
});

describe('jobDistanceKm', () => {
  it('meta ตัวจริงมาก่อน estimate และไม่มีทั้งคู่ = null', () => {
    expect(jobDistanceKm(fullJob)).toBe(6.4);
    expect(jobDistanceKm({ rider_fee_estimate_meta: { distance_km: 8.1 } })).toBe(8.1);
    expect(jobDistanceKm({})).toBeNull();
  });
});

describe('formatDurationTh', () => {
  it('นาทีล้วน / ชั่วโมง+นาที / ชั่วโมงถ้วน / ต่ำกว่านาที', () => {
    expect(formatDurationTh(min(18))).toBe('18 นาที');
    expect(formatDurationTh(min(65))).toBe('1 ชม. 5 น.');
    expect(formatDurationTh(min(120))).toBe('2 ชม.');
    expect(formatDurationTh(20000)).toBe('< 1 นาที');
  });
});

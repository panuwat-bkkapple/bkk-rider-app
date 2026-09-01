// เทสของการประกอบแถว checkpoint — เขียนจากเคสจริงที่ทำให้แถวหาย:
// ไรเดอร์ปฏิเสธสิทธิ์ตำแหน่ง, GPS หาสัญญาณไม่ทัน, เครื่องไม่รองรับ
//
// กฎที่ชุดนี้ตรึงไว้ (ตามที่ jobTimeline.ts บรรทัด 7-9 กำหนด: ข้อมูลขาด = null
// ห้ามตีเป็น 0):
//   - ไม่มีพิกัด ต้องยังมีแถว และแถวนั้นต้องไม่มี lat/lng
//   - ห้ามมี 0,0 และห้ามหยิบพิกัดเป้า (สาขา/ลูกค้า) มาใส่แทนพิกัดของเรา
//   - ไม่มีพิกัด = ไม่มี distance_m / is_within_zone (ไม่ใช่ 0 และไม่ใช่ true)
import { describe, it, expect } from 'vitest';
import { buildCheckpointRow, distanceMeters } from './checkpointPayload';
import { gpsStatusFromError } from './geolocation';

const BRANCH = { lat: 13.8481527, lng: 100.6123554, label: 'สาขาหลัก' };

describe('buildCheckpointRow — มีพิกัด', () => {
  it('เก็บพิกัด ความแม่น และผลเทียบระยะครบ', () => {
    const { row, distanceM, withinZone } = buildCheckpointRow({
      riderId: 'R1',
      at: 1_700_000_000_000,
      gps: { lat: 13.8481527, lng: 100.6123554, accuracy: 12 },
      gpsStatus: 'ok',
      target: BRANCH,
      thresholdM: 300,
    });
    expect(row.at).toBe(1_700_000_000_000);
    expect(row.rider_id).toBe('R1');
    expect(row.gps_status).toBe('ok');
    expect(row.lat).toBe(13.8481527);
    expect(row.accuracy).toBe(12);
    expect(distanceM).toBe(0);
    expect(withinZone).toBe(true);
    expect(row.zone_m).toBe(300);
  });

  it('อยู่นอกเขตยังเขียนแถว แค่ is_within_zone เป็น false', () => {
    const { row, withinZone } = buildCheckpointRow({
      riderId: 'R1', at: 1, gps: { lat: 13.7563, lng: 100.5018 }, gpsStatus: 'ok',
      target: BRANCH, thresholdM: 300,
    });
    expect(withinZone).toBe(false);
    expect(row.is_within_zone).toBe(false);
    expect(row.distance_m).toBeGreaterThan(300);
  });
});

describe('buildCheckpointRow — ไม่มีพิกัด (หัวใจของบั๊กนี้)', () => {
  const noGps = (gpsStatus: 'denied' | 'timeout' | 'unavailable' | 'unsupported') =>
    buildCheckpointRow({
      riderId: 'R1', at: 1_700_000_000_000, gps: null, gpsStatus,
      target: BRANCH, thresholdM: 300,
    });

  it('ยังเขียนแถว พร้อมเวลาและเหตุผล', () => {
    for (const st of ['denied', 'timeout', 'unavailable', 'unsupported'] as const) {
      const { row } = noGps(st);
      expect(row.at).toBe(1_700_000_000_000);
      expect(row.rider_id).toBe('R1');
      expect(row.gps_status).toBe(st);
    }
  });

  it('ไม่มีคีย์ lat/lng เลย — ห้ามเป็น 0,0', () => {
    const { row } = noGps('denied');
    expect('lat' in row).toBe(false);
    expect('lng' in row).toBe(false);
    expect(row.lat).toBeUndefined();
    expect(row.lng).toBeUndefined();
  });

  it('ห้ามหยิบพิกัดเป้ามาใส่แทนพิกัดของเรา', () => {
    const { row } = noGps('timeout');
    expect(row.lat).not.toBe(BRANCH.lat);
    expect(row.lng).not.toBe(BRANCH.lng);
  });

  it('ไม่มี distance_m / is_within_zone — ไม่ใช่ 0 และไม่ใช่ "ผ่าน"', () => {
    const { row, distanceM, withinZone } = noGps('denied');
    expect(distanceM).toBeNull();
    expect(withinZone).toBeNull();
    expect('distance_m' in row).toBe(false);
    expect('is_within_zone' in row).toBe(false);
    expect('zone_m' in row).toBe(false);
  });

  it('ไม่เก็บ target ลอยๆ ที่ไม่เคยถูกใช้เทียบ', () => {
    const { row } = noGps('denied');
    expect('target' in row).toBe(false);
  });
});

describe('buildCheckpointRow — จุดที่ไม่ต้อง verify', () => {
  it('มีพิกัดแต่ไม่มีเป้า = เก็บพิกัดไว้ ไม่มีผลเทียบ', () => {
    const { row, distanceM } = buildCheckpointRow({
      riderId: 'R1', at: 1, gps: { lat: 13.75, lng: 100.5 }, gpsStatus: 'ok',
      target: null, thresholdM: 0,
    });
    expect(row.lat).toBe(13.75);
    expect(distanceM).toBeNull();
    expect('distance_m' in row).toBe(false);
  });
});

describe('gpsStatusFromError', () => {
  it('แปลง code ของเบราว์เซอร์เป็นเหตุผลที่เก็บลง DB ได้', () => {
    expect(gpsStatusFromError(1)).toBe('denied');
    expect(gpsStatusFromError(2)).toBe('unavailable');
    expect(gpsStatusFromError(3)).toBe('timeout');
    expect(gpsStatusFromError(undefined)).toBe('unavailable');
  });
});

describe('distanceMeters', () => {
  it('จุดเดียวกัน = 0', () => {
    expect(distanceMeters(13.75, 100.5, 13.75, 100.5)).toBe(0);
  });
  it('คืนเมตรเป็นจำนวนเต็ม', () => {
    const d = distanceMeters(13.7563, 100.5018, 13.8481527, 100.6123554);
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBeGreaterThan(10_000);
  });
});

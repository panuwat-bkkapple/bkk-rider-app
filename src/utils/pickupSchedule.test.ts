// เทสของการอ่านนัดหมาย — เขียนจาก **รูปที่ผู้เขียนแต่ละรายเขียนจริง**
// ไม่ใช่จาก type ที่แอปนี้ประกาศ (type เดิมประกาศไม่ครบ ซึ่งคือบั๊กที่ชุดนี้ตรึง)
//
//   checkout ลูกค้า   { type: 'schedule', date, time }  ← ไม่มี structured
//   แอดมิน            { type: 'scheduled', ..., time_start, time_end }
//   รับด่วน            { type: 'instant', date: 'Instant', time: 'Instant' }
//
// กฎที่ชุดนี้ตรึงไว้:
//   - structured (time_start/time_end) ต้องมาก่อนสตริงรวม
//   - `'scheduled'` ของแอดมินต้องไม่ถูกอ่านเป็นงานรับด่วน
//   - เวลาที่ parse ไม่ผ่านต้องไม่ถูกกลืนทิ้ง (rawTime)
//   - appointmentStartAt คืน null เมื่อบอกไม่ได้ ห้ามเป็น 0 หรือเวลาปัจจุบัน
import { describe, it, expect } from 'vitest';
import {
  parseAppointmentWindow,
  appointmentStartAt,
  formatWindow,
  compareByAppointment,
} from './pickupSchedule';
import { getAppointmentDisplay, getAppointmentDateKey } from './jobHelpers';

const checkoutJob = { pickup_schedule: { type: 'schedule', date: '2026-09-10', time: '12:00 - 14:00' } };
const adminJob = {
  pickup_schedule: {
    type: 'scheduled',
    date: '2026-09-10',
    time: '09:00 - 11:00',
    time_start: '09:00',
    time_end: '11:00',
  },
};
const instantJob = { pickup_schedule: { type: 'instant', date: 'Instant', time: 'Instant' } };

describe('parseAppointmentWindow — สามรูปจากผู้เขียนสามราย', () => {
  it('checkout: แยกช่วงเวลาออกจากสตริงรวมได้', () => {
    const w = parseAppointmentWindow(checkoutJob);
    expect(w).toMatchObject({ date: '2026-09-10', start: '12:00', end: '14:00', instant: false });
  });

  it("แอดมิน: type 'scheduled' ไม่ใช่งานรับด่วน และอ่าน structured ได้", () => {
    const w = parseAppointmentWindow(adminJob);
    expect(w?.instant).toBe(false);
    expect(w?.start).toBe('09:00');
    expect(w?.end).toBe('11:00');
  });

  it('structured ชนะสตริงรวมเมื่อสองค่าไม่ตรงกัน', () => {
    // เกิดจริงได้เมื่อแอดมินแก้ time_start แล้วสตริงรวมค้างค่าเก่า
    const w = parseAppointmentWindow({
      pickup_schedule: { type: 'scheduled', date: '2026-09-10', time: '12:00 - 14:00', time_start: '09:00', time_end: '11:00' },
    });
    expect(w?.start).toBe('09:00');
    expect(w?.end).toBe('11:00');
  });

  it('รับด่วน: ไม่มีวันนัดของตัวเอง', () => {
    const w = parseAppointmentWindow(instantJob);
    expect(w?.instant).toBe(true);
    expect(w?.date).toBeNull();
  });

  it('รับ en dash / em dash เป็นตัวคั่นเหมือนฝั่งแอดมิน', () => {
    expect(parseAppointmentWindow({ pickup_schedule: { date: '2026-09-10', time: '12:00 – 14:00' } })?.end).toBe('14:00');
    expect(parseAppointmentWindow({ pickup_schedule: { date: '2026-09-10', time: '12:00 — 14:00' } })?.end).toBe('14:00');
  });

  it('เวลาที่ไม่ใช่รูป HH:MM ไม่ถูกกลืนทิ้ง — ไปอยู่ที่ rawTime', () => {
    const w = parseAppointmentWindow({ pickup_schedule: { date: '2026-09-10', time: 'บ่ายๆ' } });
    expect(w?.start).toBeNull();
    expect(w?.rawTime).toBe('บ่ายๆ');
  });

  it('ไม่มี pickup_schedule = null (ไม่ใช่ window เปล่า)', () => {
    expect(parseAppointmentWindow({})).toBeNull();
    expect(parseAppointmentWindow({ pickup_schedule: null })).toBeNull();
  });

  it('rescheduled_at ต้องอ่านออก — ไรเดอร์ต้องรู้ว่านัดถูกเลื่อน', () => {
    expect(parseAppointmentWindow(adminJob)?.rescheduled).toBe(false);
    expect(
      parseAppointmentWindow({ pickup_schedule: { ...adminJob.pickup_schedule, rescheduled_at: 1756700000000 } })?.rescheduled
    ).toBe(true);
  });
});

describe('คิวเช้า — type instant ที่มีช่วงเวลาจริง', () => {
  // เขียนจากผู้เขียนจริง: ลูกค้ากดก่อนร้านเปิด/หลังร้านปิด checkout เขียน
  // type 'instant' พร้อม date + "HH:00 - HH:00" จริง
  // (bkk-frontend-next/functions/src/index.ts — validateAndCreateOrder)
  const express = { id: 'express', pickup_schedule: { type: 'instant', date: '2026-09-10', time: '08:00 - 09:00' } };

  it('ต้องไม่ถูกกลืนเป็น "รับด่วน" — ช่วงเวลาที่ฝั่งโน้นส่งมาต้องถึงไรเดอร์', () => {
    const w = parseAppointmentWindow(express);
    expect(w?.instant).toBe(false);
    expect(w?.date).toBe('2026-09-10');
    expect(w?.start).toBe('08:00');
    expect(getAppointmentDisplay(express)).toContain('08:00 - 09:00');
    expect(getAppointmentDisplay(express)).not.toContain('รับด่วน');
  });

  it('เรียงตามเวลาจริงของมัน ไม่ใช่ถูกดันขึ้นหัวแถวเพราะชื่อ type', () => {
    const dawn = { id: 'dawn', pickup_schedule: { type: 'scheduled', date: '2026-09-10', time_start: '07:00' } };
    expect(compareByAppointment(express, dawn)).toBeGreaterThan(0);
  });
});

describe('appointmentStartAt', () => {
  it('คืน epoch ของเวลาเริ่มนัด', () => {
    expect(appointmentStartAt(adminJob)).toBe(new Date(2026, 8, 10, 9, 0, 0, 0).getTime());
  });

  it('งานรับด่วนคืน null — ห้ามเป็น 0 หรือเวลาปัจจุบัน', () => {
    expect(appointmentStartAt(instantJob)).toBeNull();
  });

  it('อ่านเวลาไม่ได้คืน null ไม่ใช่ต้นยุค', () => {
    expect(appointmentStartAt({ pickup_schedule: { date: '2026-09-10', time: 'บ่ายๆ' } })).toBeNull();
    expect(appointmentStartAt({})).toBeNull();
  });
});

describe('formatWindow', () => {
  it('มีปลายช่วง = แสดงเป็นช่วง / ไม่มี = แสดงเวลาเดียว', () => {
    expect(formatWindow(parseAppointmentWindow(adminJob))).toBe('09:00 - 11:00');
    expect(formatWindow(parseAppointmentWindow({ pickup_schedule: { date: '2026-09-10', time: '09:00' } }))).toBe('09:00');
  });

  it('อ่านเวลาไม่ได้ = null (ให้คนเรียกตัดสินใจ ไม่แต่งข้อความให้)', () => {
    expect(formatWindow(parseAppointmentWindow({ pickup_schedule: { date: '2026-09-10', time: 'บ่ายๆ' } }))).toBeNull();
    expect(formatWindow(null)).toBeNull();
  });
});

describe('compareByAppointment — ลำดับกองงาน', () => {
  const late = { id: 'late', pickup_schedule: { type: 'scheduled', date: '2026-09-10', time_start: '16:00' } };
  const soon = { id: 'soon', pickup_schedule: { type: 'scheduled', date: '2026-09-10', time_start: '09:00' } };
  const noTime = { id: 'noTime' };

  it('รับด่วนขึ้นก่อนนัดที่ระบุเวลา', () => {
    // ถามตัวเปรียบเทียบตรงๆ ไม่ผ่าน .sort — เมื่อกฎนี้ถูกทำลาย ทั้งคู่จะได้
    // อันดับเท่ากันแล้วผลลัพธ์ไปขึ้นกับพฤติกรรมการเรียงของ engine กับ NaN
    // ซึ่งบังเอิญออกด้านที่ถูก (พิสูจน์แล้วด้วย injection: เทสที่ผ่าน .sort
    // เขียวทั้งตอนกฎทำงานและตอนกฎถูกถอด)
    expect(compareByAppointment(instantJob, soon)).toBeLessThan(0);
    expect(compareByAppointment(soon, instantJob)).toBeGreaterThan(0);
  });

  it('นัดใกล้กว่าขึ้นก่อน', () => {
    expect([late, soon].slice().sort(compareByAppointment).map((j: any) => j.id)).toEqual(['soon', 'late']);
  });

  it('งานที่อ่านเวลานัดไม่ได้อยู่ท้าย ไม่ใช่ต้นแถว', () => {
    expect([noTime, late, soon].slice().sort(compareByAppointment).map((j: any) => j.id)).toEqual([
      'soon',
      'late',
      'noTime',
    ]);
  });

  it('ลำดับไม่ขึ้นกับลำดับตั้งต้น (กองมาจากคีย์ Firebase ซึ่งไม่มีความหมาย)', () => {
    const ids = (arr: any[]) => arr.slice().sort(compareByAppointment).map((j: any) => j.id);
    expect(ids([soon, late, noTime])).toEqual(ids([noTime, soon, late]));
  });
});

describe('ตัวแสดงผลบนการ์ดไรเดอร์', () => {
  it('อ่านเวลาจาก structured ของแอดมินได้ (เดิมอ่านได้แค่สตริงรวม)', () => {
    expect(getAppointmentDisplay({
      pickup_schedule: { type: 'scheduled', date: '2026-09-10', time_start: '09:00', time_end: '11:00' },
    })).toContain('09:00 - 11:00');
  });

  it('นัดที่ถูกเลื่อนต้องบอกบนการ์ด', () => {
    expect(getAppointmentDisplay({
      pickup_schedule: { ...adminJob.pickup_schedule, rescheduled_at: 1756700000000 },
    })).toContain('เลื่อนนัดแล้ว');
    expect(getAppointmentDisplay(adminJob)).not.toContain('เลื่อนนัดแล้ว');
  });

  it('เวลาที่ parse ไม่ผ่านยังถูกแสดง ไม่หายไปจากการ์ด', () => {
    expect(getAppointmentDisplay({ pickup_schedule: { date: '2026-09-10', time: 'บ่ายๆ' } })).toContain('บ่ายๆ');
  });

  it('ไม่มีนัดเลย = null (การ์ดไม่ขึ้นบรรทัดนัดหมาย)', () => {
    expect(getAppointmentDisplay({})).toBeNull();
  });

  it('ตัวกรองวันยังอ่านวันนัดของทั้งสามรูปได้', () => {
    expect(getAppointmentDateKey(checkoutJob)).toBe('2026-09-10');
    expect(getAppointmentDateKey(adminJob)).toBe('2026-09-10');
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(getAppointmentDateKey(instantJob)).toBe(today);
  });
});

// src/utils/jobHelpers.ts
import type { Job, Device } from '../types';
import { parseAppointmentWindow, formatWindow } from './pickupSchedule';

export const getDisplayPrice = (job: any): number => {
  if (job.net_payout !== undefined && job.net_payout !== null) return Number(job.net_payout);
  return Number(job.final_price || job.price || 0);
};

export const getCustomerName = (job: any): string => {
  return job.cust_name || job.customerName || job.customer_name || job.customer || 'ไม่ระบุชื่อลูกค้า';
};

export const getPaymentSlip = (job: any): string | undefined =>
  job.slip_url || job.payment_slip || job.slipUrl || job.payment_info?.slip_url;

const parseScheduleDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr === 'Instant') return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

export const getAppointmentDisplay = (job: any): string | null => {
  const w = parseAppointmentWindow(job);
  if (w) {
    // แอดมินเลื่อนนัดแล้วไรเดอร์ไม่เคยเห็นบนการ์ดเลย เห็นแต่เวลาใหม่เฉยๆ
    // ซึ่งอ่านไม่ออกว่าเปลี่ยนไปจากที่จำไว้หรือจำผิดเอง
    const suffix = w.rescheduled ? ' · เลื่อนนัดแล้ว' : '';
    if (w.instant) return `รับด่วน (1-2 ชม.)${suffix}`;
    // formatWindow อ่าน time_start/time_end ก่อน แล้วค่อยตกมาที่สตริงรวม
    // rawTime เป็นทางออกสุดท้ายเมื่อเวลาไม่ใช่รูป HH:MM (ห้ามกลืนทิ้ง)
    const time = formatWindow(w) ?? w.rawTime;
    const dt = w.date ? parseScheduleDate(w.date) : null;
    if (!dt) return `${w.date ?? '-'} · ${time ?? '-'}${suffix}`;
    const dateStr = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    return `${dateStr} · ${time ?? '-'}${suffix}`;
  }
  if (job?.appointment_time) {
    const dt = new Date(job.appointment_time);
    return dt.toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }
  return null;
};

export const getAppointmentDateKey = (job: any): string | null => {
  const w = parseAppointmentWindow(job);
  if (w?.date) return w.date;
  // งานรับด่วนไม่มีวันนัดของตัวเอง — ตัวกรอง "วันนี้" จึงนับมันเป็นของวันนี้
  // ตามความหมายของบริการ (ออกภายใน 1-2 ชม.) ไม่ใช่การเดาวันที่จากข้อมูลที่ไม่มี
  if (w?.instant) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  if (job?.appointment_time) {
    const dt = new Date(job.appointment_time);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return null;
};

// อุปกรณ์เสริมที่ขายพ่วง (iPad + Apple Pencil/Keyboard) — มูลค่ารวมอยู่ใน
// price/final_price ของ job แล้ว ห้ามนำไปบวกกับ getDisplayPrice ซ้ำ
export const getAccessoryItems = (job: any): { id: string; model_id: string; model_name: string; price: number; serial?: string }[] =>
  Array.isArray(job?.accessory_items) ? job.accessory_items.filter(Boolean) : [];

export const sumAccessoryItems = (job: any): number =>
  getAccessoryItems(job).reduce((sum, it) => sum + (Number(it?.price) || 0), 0);

export const getDevicesList = (job: any): Device[] => {
  if (!job) return [];
  if (job.devices && Array.isArray(job.devices) && job.devices.length > 0) return job.devices;
  return [{
    device_id: 'old_item_1',
    model: job.model,
    estimated_price: job.price,
    isNewDevice: job.assessment_details?.isNewDevice || false,
    rawConditions: job.assessment_details?.rawConditions || {},
    customer_conditions: job.customer_conditions || []
  }];
};

// ─── ค่าจ้างไรเดอร์ที่ "คนนี้" จะได้ ────────────────────────────────────────
// อัตราค่าวิ่งแยกตามยานพาหนะได้ (settings/logistics_rates/by_vehicle) เพราะ
// ต้นทุนจริงคนละราคา แต่ตอนงานอยู่ในกองยังไม่มีใครถือ ค่า rider_fee_estimate
// ที่เก็บไว้จึงเป็นของยานพาหนะเดียว (มอเตอร์ไซค์ = ค่าเริ่มต้น) — คนขับรถยนต์
// จะเห็นเลขที่ไม่ใช่ของตัวเอง. bkk-system เก็บทั้งสองค่าไว้ที่
// rider_fee_estimate_meta.fee_by_vehicle จากระยะทางชุดเดียวกัน ตัวนี้เลือกให้ตรงคน
export const normalizeVehicleType = (value: unknown): 'motorcycle' | 'car' | null => {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'car') return 'car';
  if (v === 'motorcycle') return 'motorcycle';
  return null;
};

export const getRiderPayout = (job: any, vehicleType?: 'motorcycle' | 'car' | null): number => {
  // จ่ายจริง/คิดปิดงานแล้ว = เลขนั้นคือคำตอบ ไม่ใช่ประมาณการอีกต่อไป
  const settled = Number(job?.rider_fee);
  if (Number.isFinite(settled) && settled > 0) return settled;

  // ยังไม่รู้ยานพาหนะ (แอดมินไม่ได้ตั้ง) = ใช้ตัวเลขกลางที่เก็บไว้ ไม่เดา
  const byVehicle = job?.rider_fee_estimate_meta?.fee_by_vehicle;
  if (vehicleType && byVehicle) {
    const mine = Number(byVehicle[vehicleType]);
    if (Number.isFinite(mine) && mine > 0) return mine;
  }
  return Number(job?.rider_fee_estimate) || 0;
};

// ยอดรวมค่ารอบของงานหลายใบ — ต้องเดินผ่าน getRiderPayout ทุกใบ ห้ามอ่าน
// `rider_fee` ตรงๆ และห้ามมีค่า default ของตัวเอง
//
// เดิมสรุป "รายได้" ในหน้าประวัติคำนวณด้วย `Number(j.rider_fee) || 150` ซึ่ง
// ผิดสองชั้น: (1) เลข 150 ไม่มีที่มาจากที่ไหนในระบบเลย — ไม่ใช่ `min_fee`
// (ค่าเริ่มต้น 100 ที่ settings/logistics_rates) ไม่ใช่ค่าเฉลี่ย มันคือเลขที่
// เคยถูกฮาร์ดโค้ดในเส้นทาง "เขียน" ค่ารอบแล้วถูกถอดออกไปแล้วเพราะทำให้ทุกงาน
// ได้ 150 เท่ากันหมด (ดูคอมเมนต์ใน useJobActions.handleCompleteJob) —
// เหลือค้างเฉพาะเส้นทางแสดงผล (2) มันข้าม `fee_by_vehicle` ทำให้ยอดรวมไม่ตรง
// กับเลขบนการ์ดของงานใบเดียวกัน
//
// งานที่ยังไม่มีทั้ง `rider_fee` และ `rider_fee_estimate` ให้เป็น 0 —
// ศูนย์แปลว่า "ยังไม่มีตัวเลข" ซึ่งเป็นความจริง ส่วน 150 คือคำตอบที่แต่งขึ้น
export const sumRiderPayout = (
  jobs: any[],
  vehicleType?: 'motorcycle' | 'car' | null,
): number =>
  (Array.isArray(jobs) ? jobs : []).reduce(
    (sum, job) => sum + getRiderPayout(job, vehicleType),
    0,
  );

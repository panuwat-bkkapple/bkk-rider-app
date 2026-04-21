// src/utils/jobHelpers.ts
import type { Job, Device } from '../types';

export const getDisplayPrice = (job: any): number => {
  if (job.net_payout !== undefined && job.net_payout !== null) return Number(job.net_payout);
  return Number(job.final_price || job.price || 0);
};

export const getCustomerName = (job: any): string => {
  return job.cust_name || job.customerName || job.customer_name || job.customer || 'ไม่ระบุชื่อลูกค้า';
};

export const getPaymentSlip = (job: any): string | undefined =>
  job.slip_url || job.payment_slip || job.slipUrl || job.payment_info?.slip_url;

export const getRiderFee = (job: any): number =>
  Number(job?.pickup_fee ?? job?.rider_fee ?? 0);

const parseScheduleDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr === 'Instant') return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

export const getAppointmentDisplay = (job: any): string | null => {
  const ps = job?.pickup_schedule;
  if (ps) {
    if (ps.type === 'instant' || ps.date === 'Instant') return 'รับด่วน (1-2 ชม.)';
    const dt = parseScheduleDate(ps.date);
    if (!dt) return `${ps.date} · ${ps.time}`;
    const dateStr = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    return `${dateStr} · ${ps.time}`;
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
  const ps = job?.pickup_schedule;
  if (ps?.date && ps.date !== 'Instant') return ps.date;
  if (ps?.type === 'instant' || ps?.date === 'Instant') {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  if (job?.appointment_time) {
    const dt = new Date(job.appointment_time);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return null;
};

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

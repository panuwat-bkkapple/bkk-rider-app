// src/utils/jobHelpers.ts
import type { Job, Device } from '../types';

export const getDisplayPrice = (job: any): number => {
  if (job.net_payout !== undefined && job.net_payout !== null) return Number(job.net_payout);
  return Number(job.final_price || job.price || 0);
};

export const getCustomerName = (job: any): string => {
  return job.cust_name || job.customerName || job.customer_name || job.customer || 'ไม่ระบุชื่อลูกค้า';
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

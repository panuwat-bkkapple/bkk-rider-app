// src/types/index.ts

export interface RiderInfo {
  name: string;
  id: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  idCardImg: string | null;
  licenseImg: string | null;
}

export interface Job {
  id: string;
  model: string;
  status: string;
  rider_id?: string;
  uid?: string;
  OID?: string;
  ref_no?: string;
  receive_method?: string;
  cust_name?: string;
  customerName?: string;
  customer_name?: string;
  customer?: string;
  cust_phone?: string;
  customer_phone?: string;
  phone?: string;
  cust_address?: string;
  address?: string;
  address_detail?: string;
  note?: string;
  remark?: string;
  cust_notes?: string;
  price?: number;
  final_price?: number;
  net_payout?: number;
  rider_fee?: number;
  rider_fee_status?: string;
  pickup_fee?: number;
  applied_coupon?: { value?: number; actual_value?: number };
  devices?: Device[];
  photos?: string[];
  deductions?: string[];
  chats?: Record<string, ChatMessage>;
  qc_logs?: QCLog[];
  appointment_time?: number;
  pickup_schedule?: PickupSchedule | null;
  created_at?: number;
  updated_at?: number;
  completed_at?: number;
  inspected_at?: number;
  customer_accepted_at?: number;
  cancel_reason?: string;
  method?: string;
  imei?: string;
  slip_url?: string;
  payment_slip?: string;
  slipUrl?: string;
  payment_info?: { slip_url?: string };
  assessment_details?: { isNewDevice?: boolean; rawConditions?: Record<string, any> };
  customer_conditions?: string[];
}

export interface PickupSchedule {
  type: 'instant' | 'schedule';
  date: string;
  time: string;
}

export interface Device {
  device_id: string;
  model: string;
  variant?: string;
  estimated_price?: number;
  price?: number;
  base_price?: number;
  isNewDevice?: boolean;
  rawConditions?: Record<string, any>;
  customer_conditions?: string[];
  photos?: string[];
  deductions?: string[];
  inspection_status?: string;
}

export interface ChatMessage {
  sender: 'rider' | 'admin' | 'Customer';
  senderName?: string;
  text: string;
  imageUrl?: string;
  timestamp: number;
  read: boolean;
}

export interface QCLog {
  action: string;
  by: string;
  timestamp: number;
  details: string;
}

export interface Transaction {
  id: string;
  rider_id: string;
  amount: number;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  timestamp: number;
  description?: string;
  ref_job_id?: string;
}

export interface ConditionOption {
  id: string;
  label: string;
  t1?: number;
  t2?: number;
  t3?: number;
}

export interface ConditionGroup {
  id: string;
  title: string;
  options?: ConditionOption[];
}

export interface ModelData {
  id: string;
  name: string;
  conditionSetId?: string;
  variants?: ModelVariant[];
}

export interface ModelVariant {
  name: string;
  price?: number;
  usedPrice?: number;
}

export interface InspectedDeviceData {
  checks: string[];
  photos: string[];
  photoFiles: File[];
  deductions: string[];
  final_price: number;
}

export interface DiscrepancyReport {
  id: string;
  category: string;
  detail: string;
  imageUrl?: string;
  reported_by: string;
  reported_at: number;
  status: 'pending' | 'resolved';
  resolved_at?: number;
}

export const DISCREPANCY_CATEGORIES = [
  { id: 'address', label: 'ที่อยู่ไม่ตรง', description: 'ที่อยู่ในระบบไม่ตรงกับสถานที่จริง' },
  { id: 'customer', label: 'ข้อมูลลูกค้าไม่ตรง', description: 'ชื่อ หรือเบอร์โทรลูกค้าไม่ถูกต้อง' },
  { id: 'device', label: 'รุ่นเครื่องไม่ตรง', description: 'รุ่น/สเปคเครื่องจริงไม่ตรงกับในระบบ' },
  { id: 'price', label: 'ราคาไม่ตรง', description: 'ราคาที่แจ้งลูกค้ากับราคาในระบบต่างกัน' },
  { id: 'appointment', label: 'วัน/เวลานัดหมายไม่ตรง', description: 'วันเวลาที่ลูกค้าแจ้งไม่ตรงกับในระบบ' },
  { id: 'other', label: 'อื่นๆ', description: 'ปัญหาอื่นที่ไม่อยู่ในหมวดหมู่ข้างต้น' },
];

export type TabId = 'home' | 'history' | 'wallet' | 'profile' | 'faq';
export type HistoryFilter = 'today' | 'yesterday' | 'this_week' | 'all';
export type JobDateFilter = 'today' | 'tomorrow' | 'this_week' | 'all';

import type { CancelCategory } from './job-statuses';

/**
 * Cancel options shown in the rider's RejectModal. Each option maps a
 * Thai label (familiar to riders) onto a canonical CancelCategory so
 * cancellations are filterable for analytics. `requireDetail` flips
 * the free-text textarea from optional to required when the category
 * is too broad to stand alone (rider issue, device mismatch, other).
 */
export const RIDER_REJECT_OPTIONS: Array<{
  label: string;
  category: CancelCategory;
  requireDetail?: boolean;
}> = [
  { label: 'ลูกค้าไม่รับสาย / ติดต่อไม่ได้', category: 'customer_no_show' },
  { label: 'ลูกค้าขอยกเลิก / เปลี่ยนใจ', category: 'customer_changed_mind' },
  { label: 'ข้อมูลไม่ตรงกับความเป็นจริง', category: 'device_mismatch', requireDetail: true },
  { label: 'รถเสีย / เกิดอุบัติเหตุ', category: 'rider_issue', requireDetail: true },
  { label: 'สภาพอากาศไม่เอื้ออำนวย', category: 'rider_issue' },
  { label: 'ระยะทางไกลเกินไป / ไม่สะดวกรับงาน', category: 'rider_issue' },
  { label: 'อื่น ๆ', category: 'other', requireDetail: true },
];

/** @deprecated use RIDER_REJECT_OPTIONS — kept only for legacy imports */
export const REJECT_REASONS = RIDER_REJECT_OPTIONS.map((o) => o.label);

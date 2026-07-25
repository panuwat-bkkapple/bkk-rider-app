// src/types/index.ts

export interface RiderInfo {
  name: string;
  id: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  idCardImg: string | null;
  licenseImg: string | null;
  photoUrl?: string | null;
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
  cust_email?: string;
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
  /** ส่วนลดค่าไรเดอร์ที่บริษัทรับภาระ — หัก pickup_fee (ไม่แตะค่าจ้างไรเดอร์) */
  rider_fee_discount?: number;
  applied_coupon?: { value?: number; actual_value?: number };
  devices?: Device[];
  /** อุปกรณ์เสริม iPad ที่ขายพ่วง (Apple Pencil / Magic Keyboard) — มูลค่ารวมอยู่ใน
   *  price/final_price แล้ว (breakdown เท่านั้น). ไรเดอร์ต้องเก็บของตามรายการนี้ด้วย */
  accessory_items?: { id: string; model_id: string; model_name: string; price: number; serial?: string }[];
  photos?: string[];
  deductions?: string[];
  chats?: Record<string, ChatMessage>;
  /** สรุปแชทแบบเบาบนตัว job — ข้อความจริงอยู่ที่ /job_chats/{id} (cloud function เป็นคนเซ็ต) */
  chat_flags?: { unread_from_admin?: boolean; unread_from_rider?: boolean; unread_from_customer?: boolean; last_at?: number };
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
  cust_id_address?: string;
  // Non-sensitive flag mirroring /jobs_kyc/{jobId}.verified_at — used by
  // the inspection-button gate to know whether KYC was completed. Full
  // record lives at /jobs_kyc/{jobId} (admin + assigned rider only).
  kyc_verified_at?: number;
  kyc_method?: KYCMethod;
}

// AMLO threshold above which the typed-only fallback is disallowed.
// (Anti-Money Laundering Act, ปปง. — high-value cash transactions
// require a verifiable copy of the seller's ID card.)
export const KYC_FALLBACK_BLOCK_THRESHOLD = 50000;

export type KYCMethod = 'photo' | 'typed_fallback';

export type KYCFallbackReason =
  | 'forgot_card'
  | 'lost_card'
  | 'awaiting_new_card'
  | 'other';

export const KYC_FALLBACK_REASON_LABEL_TH: Record<KYCFallbackReason, string> = {
  forgot_card: 'ลืมบัตรประชาชน',
  lost_card: 'ทำบัตรหาย',
  awaiting_new_card: 'รอออกบัตรใหม่',
  other: 'อื่น ๆ',
};

export interface KYCRecord {
  method: KYCMethod;
  id_number: string;                 // 13 digits (typed or transcribed from photo)
  id_address: string;                // address shown on the card
  id_card_url?: string | null;       // Storage URL: ID card photo (Standard)
  id_with_device_url?: string | null; // Storage URL: ID card placed next to the device, IMEI/Serial visible (Standard) — links seller ↔ specific device for forensics
  holder_url?: string | null;        // Storage URL: customer holding card next to face. Only required when net_payout >= AMLO threshold (defense-in-depth for high-value cash trades)
  signature_url?: string | null;     // Storage URL: signature canvas (Fallback)
  fallback_reason?: KYCFallbackReason;
  fallback_detail?: string;          // free text when reason === 'other'
  // Optional fields auto-filled from Vision OCR (rider can edit). Stored
  // alongside the core KYC so admin can verify identity end-to-end without
  // re-reading the card photo. Schema synced with bkk-system/src/types/domain.ts
  // and validate rules in bkk-system/database.rules.json — change all 3 together.
  id_name?: string;                  // ชื่อ-นามสกุลพร้อมคำนำหน้า ("นาย สมชาย ใจดี")
  id_dob?: string;                   // DD/MM/YYYY ตามที่ปรากฏบนบัตร
  id_issued_at?: string;             // วันออกบัตร
  id_expires_at?: string;            // วันบัตรหมดอายุ — display-only, ไม่ block submit
  verified_at: number;
  verified_by_rider_uid: string;
  verified_by_rider_name: string;
}

// =====================================================================
// Job Amendment v2 — unified change-request workflow.
// Mirror of bkk-system/src/types/domain.ts (validate rules in
// bkk-system/database.rules.json) — change all 3 together.
// =====================================================================

export type AmendmentClass = 'contractual' | 'operational';

export type JobAmendmentType =
  // Contractual — require customer consent
  | 'device_mismatch'
  | 'add_device'
  | 'remove_device'
  // Operational — admin approve = apply
  | 'appointment_reschedule'
  | 'address_wrong'
  | 'customer_info_wrong'
  | 'customer_request_cancel'
  // Financial — rider proposes a price deduction for a defect not in the
  // condition set; admin approves → applied as an itemised adjustment.
  | 'ad_hoc_deduction'
  | 'other';

export const AMENDMENT_TYPE_CLASS: Record<JobAmendmentType, AmendmentClass> = {
  device_mismatch: 'contractual',
  add_device: 'contractual',
  remove_device: 'contractual',
  appointment_reschedule: 'operational',
  address_wrong: 'operational',
  customer_info_wrong: 'operational',
  customer_request_cancel: 'operational',
  ad_hoc_deduction: 'operational',
  other: 'operational',
};

export const AMENDMENT_TYPE_LABEL_TH: Record<JobAmendmentType, string> = {
  device_mismatch: 'เครื่องไม่ตรงตามที่ลงทะเบียน',
  add_device: 'ลูกค้าขอเพิ่มเครื่อง',
  remove_device: 'ลูกค้าขอลด/ยกเลิกบางเครื่อง',
  appointment_reschedule: 'ลูกค้าขอเลื่อนนัดหมาย',
  address_wrong: 'ที่อยู่ไม่ตรง',
  customer_info_wrong: 'ข้อมูลลูกค้าไม่ตรง (ชื่อ/เบอร์/อีเมล)',
  customer_request_cancel: 'ลูกค้าขอยกเลิกทั้งงาน',
  ad_hoc_deduction: 'พบตำหนิเพิ่ม — เสนอหักราคา',
  other: 'อื่นๆ — admin โทรคุยลูกค้า',
};

export type JobAmendmentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'consented'
  | 'applied'
  | 'cancelled'
  | 'expired';

export type JobAmendmentRejectAction =
  | 'continue_original'
  | 'cancel_job'
  | 'wait_admin_call';

export type AmendmentConsentMethod = 'signature' | 'otp' | 'verbal';

/** CancelCategory enum mirror (synced with bkk-system/job-statuses.ts) */
export type AmendmentCancelCategory =
  | 'customer_changed_mind'
  | 'customer_no_show'
  | 'rider_issue'
  | 'device_mismatch'
  | 'hidden_damage'
  | 'price_disagreement'
  | 'fraud_suspected'
  | 'parcel_lost'
  | 'sla_timeout'
  | 'other';

export type AmendmentTarget =
  | { kind: 'appointment'; new_appointment_time: number }
  | { kind: 'address'; new_address: string; new_lat?: number; new_lng?: number }
  | { kind: 'customer_info'; field: 'cust_name' | 'cust_phone' | 'cust_email'; new_value: string }
  | { kind: 'cancel'; reason_category: AmendmentCancelCategory; reason_detail?: string }
  | { kind: 'ad_hoc_deduction'; label: string; amount: number; device_index?: number }
  | { kind: 'other'; admin_freeform?: string }
  | {
      kind: 'device_pick';
      model_id: string;
      variant_id?: string;
      model_name: string;
      variant_name?: string;
      brand?: string;
      suggested_price?: number;
    };

export interface AmendmentDevice {
  model: string;
  brand?: string;
  serial?: string;
  imei?: string;
  // V2 catalog binding
  model_id?: string;
  variant_id?: string;
  model_name?: string;
  variant_name?: string;
  unit_price?: number;
}

export interface AmendmentSnapshot {
  devices: AmendmentDevice[];
  final_price: number;        // v1 compat
  pricing?: {                  // v2 explicit breakdown
    devices_subtotal: number;
    pickup_fee: number;
    coupon_discount: number;
    final_price: number;
    currency: 'THB';
  };
}

export interface AmendmentEvidence {
  url: string;
  purpose: 'device_back' | 'settings_about' | 'imei_label' | 'box' | 'customer_with_device' | 'address_pin' | 'other';
  uploaded_at: number;
}

export interface AmendmentConsent {
  method: AmendmentConsentMethod;
  consented_at: number;
  signature_url?: string;
  otp_phone_masked?: string;
  otp_verified_at?: number;
  verbal_transcript?: string;
  disclosure_text_snapshot: string;
  disclosure_version: string;
  captured_on: 'rider_app' | 'admin_app';
  captured_by_uid: string;
}

export interface JobAmendment {
  id: string;
  job_id: string;
  schema_version?: 2;
  client_request_id?: string;

  amendment_class: AmendmentClass;
  type: JobAmendmentType;

  target?: AmendmentTarget;
  target_device_index?: number;

  requested_at: number;
  requested_by_rider_uid: string;
  requested_by_rider_name: string;
  rider_note?: string;
  evidence_urls?: string[];      // v1 compat
  evidence?: AmendmentEvidence[];

  before?: AmendmentSnapshot;
  after?: AmendmentSnapshot;

  status: JobAmendmentStatus;

  reviewed_at?: number;
  reviewed_by_admin_uid?: string;
  reviewed_by_admin_name?: string;
  admin_note?: string;
  reject_action?: JobAmendmentRejectAction;

  consent?: AmendmentConsent;
  consented_at?: number;
  consent_method?: AmendmentConsentMethod;
  consent_signature_url?: string;

  approved_expires_at?: number;
  applied_at?: number;
  cancelled_at?: number;
  escalated_at?: number;
}

/** Back-compat alias */
export type JobAmendmentDevice = AmendmentDevice;
export type JobAmendmentSnapshot = AmendmentSnapshot;

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
  // Per-device verification captured during inspection (see DeviceVerification)
  battery_health_pct?: number | null;
  battery_cycle_count?: number | null;
  battery_unavailable?: boolean;
  battery_photo?: string | null;
  device_imei?: string;
  device_serial?: string | null;
  find_my_status?: 'on' | 'off' | 'unknown' | null;
  find_my_manual?: boolean;
  warranty_status?: 'active' | 'expired' | 'unknown' | null;
  warranty_expires_at?: string | null;
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
  /** LEGACY tier buckets — read fallback only (see utils/pricingResolver). */
  t1?: number;
  t2?: number;
  t3?: number;
  /** Single flat baht deduction (per-model condition sets). */
  deduct?: number;
  /** Percentage-of-base deduction — overrides deduct and legacy tiers. */
  pct?: number;
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

// Per-device verification captured inside the unified intake flow
// (merged from the old DeviceVerificationModal). Battery is REQUIRED —
// the rider must either read a Maximum Capacity % or explicitly flag the
// device as un-powerable via `battery_unavailable`. All photo fields hold
// already-uploaded Storage URLs (verification shots upload immediately so
// OCR can read them), unlike the 6-angle inspection photos which upload at
// submit time.
export interface DeviceVerification {
  battery_health_pct: number | null;
  battery_cycle_count: number | null;
  battery_unavailable: boolean;        // true = "เครื่องเปิดไม่ได้/จอเสีย" escape
  battery_photo: string | null;
  device_imei: string;
  device_serial: string | null;
  device_model_number: string | null;
  find_my_status: 'on' | 'off' | 'unknown' | null;
  // How find_my_status was determined: true = rider self-attested / SickW was
  // skipped (NOT system-verified) → UI must not show it as a clean "passed".
  // false/undefined = came from the IMEI lookup or an OCR'd screenshot.
  find_my_manual?: boolean;
  verification_imei_photo: string | null;
  verification_findmy_photo: string | null;
  warranty_status: 'active' | 'expired' | 'unknown' | null;
  warranty_expires_at: string | null;
  warranty_coverage_type: string | null;
  verification_warranty_photo: string | null;
}

export function emptyDeviceVerification(): DeviceVerification {
  return {
    battery_health_pct: null,
    battery_cycle_count: null,
    battery_unavailable: false,
    battery_photo: null,
    device_imei: '',
    device_serial: null,
    device_model_number: null,
    find_my_status: null,
    find_my_manual: false,
    verification_imei_photo: null,
    verification_findmy_photo: null,
    warranty_status: null,
    warranty_expires_at: null,
    warranty_coverage_type: null,
    verification_warranty_photo: null,
  };
}

export interface InspectedDeviceData {
  checks: string[];
  photos: string[];
  photoFiles: File[];
  deductions: string[];
  final_price: number;
  verification: DeviceVerification;
  // Functional re-check result (Phase 2): rejects = selected failBehavior:'reject'
  // working-check options. Non-empty rejects gate the rider's submit.
  functional_check?: { checked_at: number; rejects: string[]; passed: boolean };
  // SickW identity/status summary captured in step 1 (typed loosely to avoid
  // a circular import with the component that owns the shape).
  sickw?: any | null;
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

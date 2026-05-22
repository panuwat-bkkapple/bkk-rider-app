// Thin wrapper รอบ Cloud Function `checkDeviceWithSickw` (deploy อยู่ใน
// bkk-system functions — ไรเดอร์ใช้ Firebase project เดียวกัน เรียกได้เลย).
// API Key อยู่ฝั่ง Cloud Function เท่านั้น — ไรเดอร์ไม่ต้องรู้
//
// Server cache TTL = 24 ชั่วโมง: ถ้าเรียกซ้ำภายใน 24h จะคืน cached เลย
// (กันเปลืองเครดิต) ส่ง forceRefresh:true เมื่อต้องการตรวจใหม่จริงๆ
//
// ถ้าส่ง jobId มาด้วย: Cloud Function จะเขียน snapshot ผลตรวจล่าสุดลง
// jobs/{jobId}/sickw_check/last_check ให้ → แอดมินเปิดดูจากฝั่ง bkk-system
// เห็นผลที่ไรเดอร์ตรวจไว้

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../api/firebase';

export interface SickwParsedFields {
  model?: string;
  modelNumber?: string;
  capacity?: string;
  color?: string;
  country?: string;
  imei?: string;
  imei2?: string;
  serial?: string;
  iCloudStatus?: string;
  fmiStatus?: string;
  activationLock?: string;
  activationStatus?: string;
  mdmStatus?: string;
  blacklistStatus?: string;
  carrier?: string;
  simLock?: string;
  warrantyStatus?: string;
  estimatedPurchaseDate?: string;
}

export type SickwFlagState = 'clean' | 'flagged' | 'unknown';

export interface SickwFlags {
  fmi: SickwFlagState;
  mdm: SickwFlagState;
  blacklist: SickwFlagState;
}

export interface SickwCheckResult {
  ok: boolean;
  cached: boolean;
  checkedAt: number;
  serviceId: string;
  imei: string;
  status: string;
  parsed: SickwParsedFields;
  fields: Record<string, string>;
  raw: string;
  flags: SickwFlags;
}

export interface SickwCheckInput {
  imei: string;
  serviceId: string | number;
  forceRefresh?: boolean;
  jobId?: string;
}

export interface JobSickwCheck {
  last_check?: {
    checked_at: number;
    checked_by_uid: string;
    service_id: string;
    imei: string;
    status: string;
    parsed: SickwParsedFields;
    fields: Record<string, string>;
    raw: string;
    flags: SickwFlags;
  };
  override?: {
    overridden_at: number;
    overridden_by_uid: string;
    overridden_by_name: string;
    overridden_by_role: string;
    reason: string;
    against_check_at: number;
    against_imei: string;
  };
}

export async function checkDeviceWithSickw(input: SickwCheckInput): Promise<SickwCheckResult> {
  const fn = httpsCallable<SickwCheckInput, SickwCheckResult>(
    getFunctions(app, 'asia-southeast1'),
    'checkDeviceWithSickw'
  );
  const result = await fn({
    imei: input.imei,
    serviceId: String(input.serviceId),
    forceRefresh: input.forceRefresh,
    jobId: input.jobId,
  });
  return result.data;
}

export function interpretFmi(value: string | undefined): SickwFlagState {
  if (!value) return 'unknown';
  const v = value.toLowerCase();
  if (v.includes('off') || v.includes('clean') || v.includes('disabled')) return 'clean';
  if (v.includes('on') || v.includes('locked') || v.includes('enabled') || v.includes('active')) return 'flagged';
  return 'unknown';
}

export function interpretMdm(value: string | undefined): SickwFlagState {
  if (!value) return 'unknown';
  const v = value.toLowerCase();
  if (v.includes('no') || v.includes('clean') || v.includes('off') || v.includes('clear') || v.includes('not enrolled')) return 'clean';
  if (v.includes('yes') || v.includes('lock') || v.includes('enrolled') || v.includes('supervised')) return 'flagged';
  return 'unknown';
}

export function interpretBlacklist(value: string | undefined): SickwFlagState {
  if (!value) return 'unknown';
  const v = value.toLowerCase();
  if (v.includes('clean') || v.includes('not') || v.includes('no') || v.includes('off')) return 'clean';
  if (v.includes('blacklist') || v.includes('lost') || v.includes('stolen') || v.includes('yes')) return 'flagged';
  return 'unknown';
}

export function getSickwReasons(sickwCheck: JobSickwCheck | undefined | null): string[] {
  const lc = sickwCheck?.last_check;
  if (!lc || lc.status !== 'success') return [];
  const flags = lc.flags || {
    fmi: interpretFmi(lc.parsed?.fmiStatus || lc.parsed?.iCloudStatus || lc.parsed?.activationLock),
    mdm: interpretMdm(lc.parsed?.mdmStatus),
    blacklist: interpretBlacklist(lc.parsed?.blacklistStatus),
  };
  const reasons: string[] = [];
  if (flags.fmi === 'flagged') reasons.push('Find My / iCloud ติดล็อค');
  if (flags.mdm === 'flagged') reasons.push('ติด MDM');
  if (flags.blacklist === 'flagged') reasons.push('ติด Blacklist (Stolen/Lost)');
  return reasons;
}

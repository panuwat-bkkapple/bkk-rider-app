// Thin wrapper รอบ Cloud Function `checkDeviceWithSickw` (deploy อยู่ใน
// bkk-system functions — ไรเดอร์ใช้ Firebase project เดียวกัน เรียกได้เลย).
// ตัว API Key อยู่ฝั่ง Cloud Function เท่านั้น — ไรเดอร์ไม่ต้องรู้
//
// Server cache TTL = 24 ชั่วโมง: ถ้าเรียกซ้ำภายใน 24h จะคืน cached เลย
// (กันเปลืองเครดิต) ส่ง forceRefresh:true เมื่อต้องการตรวจใหม่จริงๆ

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
}

export interface SickwCheckInput {
  imei: string;
  serviceId: string | number;
  forceRefresh?: boolean;
}

export async function checkDeviceWithSickw(input: SickwCheckInput): Promise<SickwCheckResult> {
  const fn = httpsCallable<SickwCheckInput, SickwCheckResult>(
    getFunctions(app, 'asia-southeast1'),
    'checkDeviceWithSickw'
  );
  const { imei, serviceId, forceRefresh } = input;
  const result = await fn({ imei, serviceId: String(serviceId), forceRefresh });
  return result.data;
}

export type SickwFlagState = 'clean' | 'flagged' | 'unknown';

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

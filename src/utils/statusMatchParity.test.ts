// สำเนาย่อยของคำศัพท์สถานะใน functions/src/statusMatch.ts ต้องตรงกับ
// src/types/job-statuses.ts ทุกแถวที่มันอ้างถึง — เทสพฤติกรรม ไม่ใช่เทสตัวอักษร
// (import ได้ทั้งคู่เพราะ statusMatch.ts pure ไม่แตะ firebase เหมือน riderStanding)
//
// สามข้อที่ตรึง: (1) ค่า canonical ทุกตัวมีอยู่จริงใน enum (2) alias ทุกตัวที่นี่
// normalize ไปที่เดียวกับของจริง (3) alias ทุกตัวในตารางจริงที่ลงสถานะในเซ็ตนี้อยู่
// ที่นี่ครบ — ข้อ 3 คือตัวที่จับ "เพิ่ม case ให้ trigger แล้วลืม alias"
//
// ผล injection — วัดจริงหลังรันทีละตัวบน statusMatch.ts:
//   ลบ 'Payment Completed' ออกจาก LEGACY_ALIAS                → แดง 2 (ข้อ 3 + rawStatusIs)
//   ชี้ 'Assigned' ไป Rider Accepted แทน Rider Assigned         → แดง 1 (ข้อ 2)
//   สะกด WAITING_FOR_HANDOVER เป็น 'Waiting for Handover'      → แดง 2 (ข้อ 1 + ข้อ 3)
import { describe, it, expect } from 'vitest';
import { JOB_STATUS as APP, JOB_STATUS_B2B as APP_B2B, normalizeStatus } from '../types/job-statuses';
import { JOB_STATUS as FN, LEGACY_ALIAS as FN_ALIAS, canonicalStatus, rawStatusIs } from '../../functions/src/statusMatch';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appCanonical = new Set<string>([...Object.values(APP), ...Object.values(APP_B2B)]);

// คีย์ LEGACY_ALIAS ของแอปจากไฟล์จริง (ตารางเป็น private ใน job-statuses.ts)
function appLegacyKeys(): string[] {
  const text = readFileSync(resolve(__dirname, '../types/job-statuses.ts'), 'utf8');
  const block = text.slice(text.indexOf('const LEGACY_ALIAS'), text.indexOf('export function normalizeStatus'));
  return [...block.matchAll(/^\s*'?([A-Za-z][A-Za-z() -]+?)'?\s*:\s*JOB_STATUS\./gm)].map((m) => m[1]);
}

describe('functions/src/statusMatch ↔ src/types/job-statuses', () => {
  it('(1) ทุกค่า canonical ในสำเนาย่อยมีอยู่จริงใน enum ของแอป', () => {
    for (const [key, value] of Object.entries(FN)) {
      expect(appCanonical.has(value), `${key} = '${value}'`).toBe(true);
    }
  });

  it('(2) alias ทุกตัวในสำเนาย่อย normalize ไปที่เดียวกับของจริง', () => {
    for (const [legacy, target] of Object.entries(FN_ALIAS)) {
      expect(normalizeStatus(legacy), legacy).toBe(target);
      expect(canonicalStatus(legacy)).toBe(normalizeStatus(legacy));
    }
  });

  it('(3) alias ในตารางจริงที่ลงสถานะที่ trigger ใช้ อยู่ในสำเนาย่อยครบ', () => {
    const covered = new Set<string>(Object.values(FN));
    const keys = appLegacyKeys();
    expect(keys.length).toBeGreaterThan(5);
    const missing = keys.filter((k) => covered.has(normalizeStatus(k) as string) && !(k in FN_ALIAS));
    expect(missing, 'alias ที่ trigger จะมองไม่เห็น').toEqual([]);
  });

  it('rawStatusIs: สะกดเก่ากับ canonical ให้คำตอบเดียวกัน', () => {
    expect(rawStatusIs('Waiting for Handover', FN.WAITING_FOR_HANDOVER)).toBe(true);
    expect(rawStatusIs('Payment Completed', FN.PAID)).toBe(true);
    expect(rawStatusIs('Active Leads', FN.ACTIVE_LEAD)).toBe(true);
    expect(rawStatusIs('Pending QC', FN.PAID)).toBe(false);
    expect(rawStatusIs(null, FN.PAID)).toBe(false);
  });
});

// สำเนา rider_fee_status ของแอปนี้ต้องตรงกับต้นทางใน bkk-system เป็นตัวอักษร
//
// ต้นทาง = bkk-system/src/types/riderFeeStatus.ts — CI วาง bkk-system ไว้ข้างกันด้วย
// sparse-checkout (.github/workflows/ci.yml) ไม่มี = ข้าม ไม่ใช่แดง (ขั้น "ตรวจว่า
// sparse-checkout ครอบไฟล์ที่เทสอ้างครบ" กันไม่ให้ข้ามเงียบเพราะลืมเพิ่ม path)
//
// 'Waived' ที่สะกดต่างกันคนละที่ = แอปนี้ไม่รู้จักปลายทางแล้วเขียน Pending ทับ โดยไม่มี error
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RIDER_FEE_STATUS, RIDER_FEE_STATUS_VALUES, TERMINAL_RIDER_FEE_STATUSES } from './riderFeeStatus';

const root = resolve(__dirname, '../..');

describe('rider_fee_status — สำเนาต้องตรงกับ bkk-system', () => {
  it('ค่าและปลายทางตรงกับ bkk-system/src/types/riderFeeStatus.ts', () => {
    const file = resolve(root, '../bkk-system/src/types/riderFeeStatus.ts');
    if (!existsSync(file)) return;
    const src = readFileSync(file, 'utf-8');
    const block = src.match(/RIDER_FEE_STATUS = \{([\s\S]*?)\} as const/);
    expect(block, 'หาบล็อก RIDER_FEE_STATUS ใน bkk-system ไม่เจอ').toBeTruthy();
    const values = [...block![1].matchAll(/['"]([A-Za-z]+)['"]/g)].map((m) => m[1]);
    expect(values).toEqual([...RIDER_FEE_STATUS_VALUES]);
    const terminal = src.match(/TERMINAL_RIDER_FEE_STATUSES[^=]*=\s*\[([\s\S]*?)\]/);
    expect(terminal, 'หา TERMINAL_RIDER_FEE_STATUSES ใน bkk-system ไม่เจอ').toBeTruthy();
    const terminalValues = [...terminal![1].matchAll(/RIDER_FEE_STATUS\.([A-Z]+)/g)]
      .map((m) => RIDER_FEE_STATUS[m[1] as keyof typeof RIDER_FEE_STATUS]);
    expect(terminalValues).toEqual([...TERMINAL_RIDER_FEE_STATUSES]);
  });

  it('ค่าที่แอปนี้ถืออยู่', () => {
    expect(RIDER_FEE_STATUS_VALUES).toEqual([RIDER_FEE_STATUS.PENDING, RIDER_FEE_STATUS.WAIVED, RIDER_FEE_STATUS.PAID]);
    expect(TERMINAL_RIDER_FEE_STATUSES).toEqual([RIDER_FEE_STATUS.PAID, RIDER_FEE_STATUS.WAIVED]);
  });
});

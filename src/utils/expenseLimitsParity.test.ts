// เพดานการเบิกมีสองสำเนา — ฝั่ง server บังคับ ฝั่งแอปบอกใบ้
//
// สำเนาที่เดินห่างกันทำให้ฟอร์มเตือนคนละเลขกับที่ server ปฏิเสธ ซึ่งอ่านบนจอ
// เหมือนระบบสับสน (ฟอร์มบอกผ่าน server บอกไม่ผ่าน) — และไรเดอร์จะเชื่อฟอร์ม
//
// เทียบจาก **ข้อความจริงในไฟล์** ไม่ใช่ import เพราะ `functions/` มี rootDir
// ของตัวเอง (วิธีเดียวกับ walletCategoryParity.test.ts)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RIDER_EXPENSE_DEFAULTS } from './expenseLimits';

describe('เพดานการเบิก — สองสำเนาต้องตรงกัน', () => {
  it('ตรงกับ functions/src/riderExpensePolicy.ts ทุกฟิลด์ที่แอปใช้', () => {
    const src = readFileSync(
      resolve(__dirname, '../../functions/src/riderExpensePolicy.ts'),
      'utf-8'
    );
    const block = src.match(
      /export const RIDER_EXPENSE_DEFAULTS: RiderExpenseSettings = \{([\s\S]*?)\};/
    );
    expect(block, 'หาบล็อก RIDER_EXPENSE_DEFAULTS ฝั่ง server ไม่เจอ').toBeTruthy();

    const serverValues = Object.fromEntries(
      [...block![1].matchAll(/(\w+):\s*([0-9]+)/g)].map(([, k, v]) => [k, Number(v)])
    );

    // เทียบเฉพาะฟิลด์ที่ฝั่งแอปถือ — ฝั่ง server มี reimbursement_taxable
    // เพิ่มมาซึ่งเป็นเรื่องภาษี ไม่ใช่เรื่องที่ฟอร์มต้องรู้
    for (const [k, v] of Object.entries(RIDER_EXPENSE_DEFAULTS)) {
      expect(serverValues[k], `ฟิลด์ ${k}`).toBe(v);
    }
  });

  it('ฝั่งแอปไม่ถือ reimbursement_taxable — มันไม่ใช่เรื่องของฟอร์ม', () => {
    // คำตอบเรื่องภาษีเปลี่ยนพฤติกรรมของ ledger ไม่ใช่ของฟอร์ม
    // ถ้าฝั่งแอปถือไว้ด้วย จะมีคนเผลอเอาไปใช้ตัดสินใจบนจอ
    expect('reimbursement_taxable' in RIDER_EXPENSE_DEFAULTS).toBe(false);
  });
});

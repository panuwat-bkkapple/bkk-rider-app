// สำเนาของ RIDER_WALLET_CATEGORIES มี 3 ที่ และเคยเดินห่างกันมาแล้วจริง
//
// #125 เพิ่ม `ADJUSTMENT` ที่ `src/utils/walletLedger.ts` แต่ไม่ได้แก้สำเนาใน
// `functions/src/index.ts` ซึ่งเป็นตัวที่คำนวณ "ยอดถอนได้" ใน
// riderRequestWithdraw ผลคือหน้ากระเป๋าโชว์ยอดหนึ่ง แต่ถอนได้อีกยอดหนึ่ง
// โดยไม่มี error ที่ไหนบอกว่าทำไม — ไม่มีเทสไหนจับได้เลยจนกระทั่งมาอ่านโค้ด
//
// เทสนี้จึงเทียบ **ข้อความจริงในไฟล์** ไม่ใช่ import (import ตัว functions
// จะไป initializeApp ของ firebase-admin ตอนโหลดโมดูล) — วิธีเดียวกับที่
// bkk-frontend-next/scripts/mirror-parity.mjs ใช้กับ public_track
//
// สำเนาที่สาม (`bkk-system/src/utils/transactionLogger.ts`) อยู่คนละรีโป
// ตรวจได้เมื่อ checkout ไว้ข้างกัน ไม่มีก็ข้าม (ไม่ใช่แดง) ตามแบบเดียวกัน

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RIDER_WALLET_CATEGORIES } from './walletLedger';

const root = resolve(__dirname, '../..');

/** ดึงรายชื่อหมวดจากสตริงในไฟล์ — รับทั้ง 'x' และ "x" */
const quoted = (block: string): string[] =>
  [...block.matchAll(/['"]([A-Z_]+)['"]/g)].map((m) => m[1]);

describe('RIDER_WALLET_CATEGORIES — สามสำเนาต้องตรงกัน', () => {
  it('functions/src/index.ts (ตัวที่คำนวณยอดถอนได้) ตรงกับ walletLedger.ts', () => {
    const src = readFileSync(resolve(root, 'functions/src/index.ts'), 'utf-8');
    const m = src.match(/const RIDER_WALLET_CATEGORIES = new Set\(\[([\s\S]*?)\]\)/);
    expect(m, 'หาบล็อก RIDER_WALLET_CATEGORIES ใน functions/src/index.ts ไม่เจอ').toBeTruthy();
    // เทียบเป็นเซ็ต ไม่ใช่ลำดับ — ลำดับไม่มีความหมายทางพฤติกรรม
    expect(new Set(quoted(m![1]))).toEqual(new Set(RIDER_WALLET_CATEGORIES));
  });

  it('bkk-system/src/utils/transactionLogger.ts ตรงกัน (ข้ามถ้าไม่ได้ checkout)', () => {
    const p = resolve(root, '../bkk-system/src/utils/transactionLogger.ts');
    if (!existsSync(p)) return; // ไม่มีรีโปข้างกัน = ข้าม ไม่ใช่แดง
    const src = readFileSync(p, 'utf-8');
    const m = src.match(/category:\s*([^;]+);/);
    expect(m, 'หา union ของ category ใน transactionLogger.ts ไม่เจอ').toBeTruthy();
    expect(new Set(quoted(m![1]))).toEqual(new Set(RIDER_WALLET_CATEGORIES));
  });
});

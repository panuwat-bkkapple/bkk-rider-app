// เทสกติกากระเป๋าไรเดอร์ — เขียนจากข้อมูลจริงบน production (เฟส 0, 31 ส.ค. 2569)
// ไม่ใช่จาก spec: แถว LOGISTICS_REVENUE 15 แถวที่ติด rider_id ทำ balance บวม
// 3,776 บาท และแถว amount เสียทำสูตรเดิมเป็น NaN ทั้งก้อน
import { describe, it, expect } from 'vitest';
import {
  RIDER_WALLET_CATEGORIES,
  isRiderWalletTx,
  pendingWithdrawalHold,
  walletBalance,
  walletCategoryLabel,
} from './walletLedger';

const tx = (over: Record<string, unknown>) => ({
  rider_id: 'R1',
  type: 'CREDIT',
  category: 'JOB_PAYOUT',
  amount: 100,
  ...over,
});

describe('isRiderWalletTx — allowlist หมวดเงินไรเดอร์', () => {
  it('รับทุกหมวดใน allowlist ทั้ง CREDIT และ DEBIT', () => {
    for (const category of RIDER_WALLET_CATEGORIES) {
      expect(isRiderWalletTx(tx({ category, type: 'CREDIT' }))).toBe(true);
      expect(isRiderWalletTx(tx({ category, type: 'DEBIT' }))).toBe(true);
    }
  });

  // เคสจริงที่พาให้มีไฟล์นี้: รายได้บริษัทที่ finance เขียนโดยติด rider_id
  // ของไรเดอร์ตอนกดจ่ายลูกค้า — ต้องไม่เข้ากระเป๋าแม้ rider_id จะตรง
  it('ปฏิเสธหมวดฝั่งบริษัทแม้ rider_id ตรง (LOGISTICS_REVENUE และเพื่อน)', () => {
    for (const category of ['LOGISTICS_REVENUE', 'TRADE_IN_PAYOUT', 'B2B_PURCHASE', 'SOMETHING_NEW']) {
      expect(isRiderWalletTx(tx({ category }))).toBe(false);
    }
  });

  it('ปฏิเสธแถวที่ amount ไม่ใช่ตัวเลขจริง — ไม่ใช่ตีเป็น 0', () => {
    expect(isRiderWalletTx(tx({ amount: 'x' }))).toBe(false);
    expect(isRiderWalletTx(tx({ amount: undefined }))).toBe(false);
    expect(isRiderWalletTx(tx({ amount: null }))).toBe(false);
    expect(isRiderWalletTx(tx({ amount: Infinity }))).toBe(false);
  });

  it('ปฏิเสธ type ที่ไม่ใช่ CREDIT/DEBIT และค่าว่าง', () => {
    expect(isRiderWalletTx(tx({ type: 'credit' }))).toBe(false);
    expect(isRiderWalletTx(tx({ type: undefined }))).toBe(false);
    expect(isRiderWalletTx(null)).toBe(false);
    expect(isRiderWalletTx(undefined)).toBe(false);
  });
});

describe('walletBalance — สูตรหลังกรอง', () => {
  it('CREDIT บวก DEBIT ลบ', () => {
    const rows = [
      tx({ amount: 300 }),
      tx({ amount: 150 }),
      tx({ type: 'DEBIT', category: 'WITHDRAWAL', amount: 200 }),
    ];
    expect(walletBalance(rows)).toBe(250);
  });

  // Injection guard: ชุดแถวจำลองจาก production เฟส 0 — ถ้าใครถอด filter ออก
  // จากท่อ (คือเอาแถว LOGISTICS_REVENUE เข้าสูตร) เลขต้องเพี้ยนและเทสนี้แดง
  it('ท่อเต็ม filter → balance: แถวบริษัท/แถวเสียต้องไม่กระทบเลขสุดท้าย', () => {
    const productionLike = [
      tx({ amount: 300 }), // ค่ารอบจริง
      tx({ category: 'LOGISTICS_REVENUE', amount: 251 }), // รายได้บริษัทติด rider_id
      tx({ category: 'LOGISTICS_REVENUE', amount: 265 }),
      tx({ amount: 'broken' }), // แถวเสีย — สูตรเดิมทำทั้งก้อนเป็น NaN
      tx({ type: 'DEBIT', category: 'WITHDRAWAL', amount: 100 }),
    ];
    const filtered = productionLike.filter((t) => isRiderWalletTx(t));
    expect(filtered).toHaveLength(2);
    expect(walletBalance(filtered)).toBe(200);

    // พิสูจน์ว่า filter เป็นตัวคุ้มจริง ไม่ใช่เทสเห็นด้วยกับตัวเอง:
    // ชุดเดียวกันแบบไม่กรองต้องให้คำตอบคนละโลก (NaN)
    expect(walletBalance(productionLike)).toBeNaN();
  });
});

describe('ADJUSTMENT — แถวแก้ยอดที่คิดผิด', () => {
  it('นับเข้ากระเป๋าทั้งทิศบวกและทิศลบ (ถ้าไม่นับ balance บนจอจะไม่ตรงกับงาน)', () => {
    const credit = { type: 'CREDIT', category: 'ADJUSTMENT', amount: 104 };
    const debit = { type: 'DEBIT', category: 'ADJUSTMENT', amount: 104 };
    expect(isRiderWalletTx(credit)).toBe(true);
    expect(isRiderWalletTx(debit)).toBe(true);
    expect(walletBalance([credit, debit])).toBe(0);
  });
});

describe('walletCategoryLabel — ป้ายบนจอ', () => {
  it('หมวดใน allowlist ได้ป้ายไทย', () => {
    expect(walletCategoryLabel('JOB_PAYOUT')).toBe('ค่ารอบงาน');
    expect(walletCategoryLabel('WITHDRAWAL')).toBe('ถอนเงินเข้าบัญชี');
    // การแก้ยอดที่คิดผิดต้องไม่อ่านว่า "รายการหัก" — นั่นคือป้ายของ PENALTY
    expect(walletCategoryLabel('ADJUSTMENT')).toBe('ปรับปรุงค่ารอบ');
    expect(walletCategoryLabel('ADJUSTMENT')).not.toBe(walletCategoryLabel('PENALTY'));
  });
  it('หมวดนอก allowlist ตกเป็นชื่อดิบ / ค่าว่างตกเป็นป้ายกลาง', () => {
    expect(walletCategoryLabel('LOGISTICS_REVENUE')).toBe('LOGISTICS_REVENUE');
    expect(walletCategoryLabel('')).toBe('รายการอื่น');
    expect(walletCategoryLabel(undefined)).toBe('รายการอื่น');
  });
});

describe('pendingWithdrawalHold — ยอดจองค้างจากคำขอถอน', () => {
  it('นับเฉพาะ status requested และ amount เป็นเลขบวกจริง', () => {
    expect(pendingWithdrawalHold([
      { status: 'requested', withdraw_amount: 500 },
      { status: 'requested', withdraw_amount: 300 },
      { status: 'paid', withdraw_amount: 999 },      // จ่ายแล้ว = ไม่จอง
      { status: 'rejected', withdraw_amount: 999 },  // ปฏิเสธ = คืนจอง
      { status: 'requested', withdraw_amount: 'x' }, // เลขเสีย = ข้าม
      { status: 'requested' },                       // ไม่มี amount = ข้าม
    ])).toBe(800);
    expect(pendingWithdrawalHold([])).toBe(0);
  });
});

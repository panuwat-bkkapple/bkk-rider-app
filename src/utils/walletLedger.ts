// src/utils/walletLedger.ts
//
// กติกาการอ่าน /transactions ของกระเป๋าไรเดอร์ — ที่เดียวของทั้งแอป
//
// /transactions เป็นสมุดเงินสดของร้าน (bkk-system FinanceAuditLog อ่านทั้งตาราง)
// ไม่ใช่กระเป๋าไรเดอร์ล้วนๆ: แถวฝั่งบริษัท เช่น LOGISTICS_REVENUE (รายได้
// ค่าบริการที่เก็บจากลูกค้า) เคยถูกประทับ rider_id ของไรเดอร์ตอน finance
// กดจ่ายลูกค้า แล้วสูตร balance เดิมซึ่งรวมทุกแถวที่ rider_id ตรงก็นับเป็น
// เงินไรเดอร์ → ยอดบนจอบวมเกินจริง (วัดจริง 31 ส.ค. 2569: บวม 3,776 จาก
// 15 แถว — ดู docs/reports/2026-08-31-rider-wallet-fix-plan.md เฟส 0)
//
// ทางแก้เชิงโครงสร้างคือ allowlist: กระเป๋านับเฉพาะหมวดที่เป็นเงินไรเดอร์
// จริงเท่านั้น หมวดบัญชีใหม่ในอนาคตจะไม่ทะลุเข้ากระเป๋าอีกไม่ว่าจะ tag
// rider_id มาแบบไหน. ด่านความปลอดภัยจริงอยู่ที่ rules (/transactions เขียนได้
// เฉพาะ admin) — ตัวนี้คือความถูกต้องของการแสดงผล
//
// แถวที่ amount ไม่ใช่ตัวเลขถูกข้ามทั้งแถว ไม่ใช่ตีเป็น 0 เฉยๆ — สูตรเดิม
// ปล่อย NaN ทะลุแล้วพัง balance ทั้งก้อน (NaN + อะไรก็ NaN)

export type WalletTxType = 'CREDIT' | 'DEBIT';

/** หมวดที่เป็นเงินของไรเดอร์จริง
 *
 *  **MIRROR 3 ที่ ไม่ใช่ 2 — แก้ที่นี่แล้วต้องแก้อีกสองที่เสมอ:**
 *    1. `functions/src/index.ts` (rider-notifications) — ตัวที่คำนวณ "ยอดถอนได้"
 *       ใน `riderRequestWithdraw`
 *    2. `bkk-system/src/utils/transactionLogger.ts` — union ของ `category`
 *
 *  หัวข้อนี้เคยเขียนว่า mirror มีที่เดียวและ **นั่นทำให้หลุดจริง**: `ADJUSTMENT`
 *  ถูกเพิ่มที่นี่ใน #125 แต่สำเนาใน functions ไม่ถูกแก้ตาม ผลคือหน้ากระเป๋าโชว์
 *  ยอดที่รวมแถว ADJUSTMENT ขณะที่ยอดถอนได้ไม่นับมัน — ตัวเลขสองตัวบนจอเดียวกัน
 *  ไม่ตรงกันโดยไม่มี error ที่ไหนบอก
 *
 *  หมวดเก่าห้ามถอดออก แม้เลิกเขียนแล้ว — แถวในประวัติยังอ้างมันอยู่ ถอดเมื่อไหร่
 *  balance ของแถวเก่าหายจากจอเงียบๆ */
export const RIDER_WALLET_CATEGORIES = [
  'JOB_PAYOUT',
  'WITHDRAWAL',
  'PENALTY',
  'BONUS',
  'ADJUSTMENT',
  'EXPENSE_REIMBURSEMENT',
  'COMPANY_ADVANCE',
  'RIDER_DEPOSIT',
] as const;
export type RiderWalletCategory = (typeof RIDER_WALLET_CATEGORIES)[number];

const WALLET_CATEGORY_SET: ReadonlySet<string> = new Set(RIDER_WALLET_CATEGORIES);

/** ป้ายหมวดสำหรับจอ — category ดิบเป็นศัพท์ภายใน ไม่ใช่ภาษาที่ไรเดอร์อ่าน */
export const WALLET_CATEGORY_LABEL_TH: Record<RiderWalletCategory, string> = {
  JOB_PAYOUT: 'ค่ารอบงาน',
  WITHDRAWAL: 'ถอนเงินเข้าบัญชี',
  PENALTY: 'รายการหัก',
  BONUS: 'โบนัส',
  // ปรับยอดที่คิดผิด (เช่น คิดค่ารอบใหม่หลังอนุมัติคำแย้งหมุด) — ไม่ใช่ค่าปรับ
  // ทิศไหนก็หมวดนี้ ป้ายจึงต้องอ่านได้ทั้งตอนบวกและตอนลบ
  ADJUSTMENT: 'ปรับปรุงค่ารอบ',
  // เงินที่ไรเดอร์สำรองจ่ายไปเอง (ทางด่วน/ที่จอดรถ) แล้วบริษัทคืนให้
  // **ไม่ใช่โบนัสและไม่ใช่ค่ารอบ** — มันคือเงินของเขาที่เดินกลับมา ป้ายจึงต้อง
  // ไม่อ่านว่าเป็นรายได้ ไม่งั้นทั้งไรเดอร์และบัญชีเข้าใจผิดคนละทาง
  EXPENSE_REIMBURSEMENT: 'คืนเงินสำรองจ่าย',
  // เครดิตที่บริษัทเติมให้ล่วงหน้า (เช่น ให้ไว้จ่ายทางด่วนก่อน) — ไม่ใช่เงินได้
  COMPANY_ADVANCE: 'เครดิตจากบริษัท',
  // เงินที่ไรเดอร์ฝากเข้ามาเอง — เงินของเขาเดินเข้ามา ไม่ใช่รายได้
  RIDER_DEPOSIT: 'ฝากเงินเข้ากระเป๋า',
};

export function walletCategoryLabel(category: unknown): string {
  const key = String(category ?? '');
  return (WALLET_CATEGORY_LABEL_TH as Record<string, string>)[key] || key || 'รายการอื่น';
}

export interface WalletTxLike {
  type?: unknown;
  category?: unknown;
  amount?: unknown;
  rider_id?: unknown;
}

/** แถวนี้นับเข้ากระเป๋าไรเดอร์ได้ไหม — หมวดตรง allowlist และ amount เป็นเลขจริง
 *  กับดักที่กัดมาแล้วในระบบนี้ (ดู quotePolicy ใน CLAUDE.md ของ frontend):
 *  Number(null) === 0 และ 0 เป็น finite — ต้องคัดชนิดค่าก่อน ไม่ใช่ Number() ทันที */
export function isRiderWalletTx(t: WalletTxLike | null | undefined): boolean {
  if (!t) return false;
  if (t.type !== 'CREDIT' && t.type !== 'DEBIT') return false;
  if (!WALLET_CATEGORY_SET.has(String(t.category ?? ''))) return false;
  const raw = t.amount;
  if (typeof raw !== 'number' && typeof raw !== 'string') return false;
  if (typeof raw === 'string' && raw.trim() === '') return false;
  return Number.isFinite(Number(raw));
}

/** ยอดจองค้างจากคำขอถอนที่ยังไม่ถูกจ่าย/ปฏิเสธ (/withdrawals status 'requested')
 *  — ยอดที่ถอนได้จริงต้องหักก้อนนี้ออกจาก balance ไม่งั้นกดขอแล้วเลขบนจอ
 *  ไม่ขยับ และขอซ้ำได้เต็มยอดจนกว่า finance จะจ่าย. MIRROR ฝั่ง server อยู่ใน
 *  functions/src/index.ts (riderRequestWithdraw) */
export function pendingWithdrawalHold(rows: readonly { status?: unknown; withdraw_amount?: unknown }[]): number {
  return rows.reduce<number>((acc, w) => {
    if (!w || w.status !== 'requested') return acc;
    const amt = Number(w.withdraw_amount);
    return Number.isFinite(amt) && amt > 0 ? acc + amt : acc;
  }, 0);
}

/** balance จากแถวที่ "ผ่าน isRiderWalletTx แล้ว" — CREDIT บวก DEBIT ลบ */
export function walletBalance(rows: readonly WalletTxLike[]): number {
  return rows.reduce<number>((acc, t) => {
    const amt = Number(t.amount);
    return t.type === 'CREDIT' ? acc + amt : acc - amt;
  }, 0);
}

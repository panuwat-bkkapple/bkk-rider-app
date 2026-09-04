// ภาษีหัก ณ ที่จ่ายค่าตอบแทนไรเดอร์ — ฝั่งแอปไรเดอร์ (แสดงผลอย่างเดียว)
//
// MIRROR ตัวที่ 3 ของสูตรเดียวกัน:
//   bkk-system/functions/rider-wht.js  (ตัวจริง — ออกเอกสารและนำส่ง)
//   bkk-system/src/utils/riderWht.ts   (จอ finance — คนกดโอนต้องเห็นยอดสุทธิ)
//   ที่นี่                              (ไรเดอร์ต้องเห็นก่อนกดถอน)
// **แก้สูตรต้องแก้ทั้งสามไฟล์**
//
// **ตัวนี้เป็นเพดานบน ไม่ใช่ยอดจริง (ตั้งแต่ 4 ก.ย. 2569):** ฐานภาษีจริงคือ
// ค่าจ้างล้วน ไม่รวมเงินคืนค่าทดรอง (ค่าทางด่วน/ที่จอดรถ) ที่ปนอยู่ในกระเป๋า
// การแยกส่วนนั้นต้องเดิน ledger ทั้งก้อนของไรเดอร์ (`splitWithdrawal` ฝั่ง
// bkk-system) ซึ่งแอปนี้ไม่ได้ถือครบ (ประวัติธุรกรรมโหลดเป็นหน้า) จึง**ไม่ลอก
// สูตรนั้นมาเป็นสำเนาที่สาม** แต่ประมาณบนยอดเต็ม = ภาษีที่โชว์ ≥ ภาษีที่หักจริง
// = ยอดเข้าบัญชีที่โชว์ ≤ ยอดที่ได้จริง — ผิดได้ทิศเดียวคือ "ได้มากกว่าที่บอก"
// ซึ่งไม่มีใครมาร้องเรียน ยอดจริงอยู่บนหนังสือรับรองที่ออกตอนโอน
//
// ทำไมแอปต้องรู้ด้วย: การหักทำให้ไรเดอร์ได้เงินน้อยกว่ายอดที่กด ถ้าเขามารู้
// ตอนเงินเข้าบัญชี = เข้าใจว่าถูกหักเงินโดยไม่มีเหตุผล การบอกก่อนกดคือส่วน
// หนึ่งของความถูกต้องของระบบนี้ ไม่ใช่ของตกแต่ง

export const DEFAULT_WHT_RATE_PERCENT = 3;

export interface RiderWhtConfig {
  enabled: boolean;
  ratePercent: number;
}

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** อ่าน settings/accounting/rider_wht — fail-closed: อ่านไม่ได้ = ไม่แสดงว่าหัก */
export function readRiderWhtConfig(raw: unknown): RiderWhtConfig {
  const s = (raw || {}) as { enabled?: unknown; rate_percent?: unknown };
  const rate = Number(s.rate_percent);
  return {
    enabled: s.enabled === true,
    ratePercent: rate > 0 && rate < 100 ? rate : DEFAULT_WHT_RATE_PERCENT,
  };
}

export interface RiderWhtEstimate {
  applies: boolean;
  gross: number;
  /** ภาษี**สูงสุด**ที่อาจถูกหัก (คิดบนยอดเต็ม) — ยอดจริงเท่ากับหรือน้อยกว่านี้ */
  wht: number;
  /** ยอดเข้าบัญชี**อย่างน้อย** */
  net: number;
  ratePercent: number;
}

export function estimateRiderWht(
  grossAmount: number,
  employmentType: 'employee' | 'freelance' | null | undefined,
  cfg: RiderWhtConfig,
): RiderWhtEstimate {
  const gross = round2(Math.max(0, Number(grossAmount) || 0));
  const ratePercent = cfg?.ratePercent || DEFAULT_WHT_RATE_PERCENT;
  if (!cfg?.enabled || gross <= 0 || employmentType !== 'freelance') {
    return { applies: false, gross, wht: 0, net: gross, ratePercent };
  }
  const wht = round2((gross * ratePercent) / 100);
  return { applies: true, gross, wht, net: round2(gross - wht), ratePercent };
}

// Ad-hoc price adjustments on a job — itemised deductions/additions that admin
// QC or a rider (via approved amendment) records. net_payout folds in only the
// ones with status 'applied'. Mirrored in bkk-system + bkk-frontend-next — keep
// in sync. See bkk-system/CLAUDE.md invariant #2 for the canonical formula.
export function sumAppliedAdjustments(job: unknown): number {
  const raw = (job as { adjustments?: unknown } | null)?.adjustments;
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' ? Object.values(raw as Record<string, unknown>) : []);
  return (list as Array<{ status?: string; amount?: unknown }>).reduce((sum, a) => {
    if (!a || a.status !== 'applied') return sum;
    const amt = Number(a.amount);
    return Number.isFinite(amt) ? sum + amt : sum;
  }, 0);
}

// คูปองบนงาน — งานใหม่ถือได้หลายใบที่ `applied_coupons` (คูปองผูกสินค้าต่อเครื่อง +
// รีวิว + โปรโมชั่นระดับออเดอร์) ส่วนงานเก่า/Manual Top-up ยังเป็น object เดี่ยว
// `applied_coupon`. ห้ามบวกทั้งสองรูปแบบ — ตอนสร้างงาน server เขียนใบที่สูงสุดลง
// `applied_coupon` ด้วยเพื่อ UI เก่า จึงต้องให้ array มาก่อนเสมอ.
// MIRROR 4 ที่ — ดู bkk-system/src/utils/adjustments.ts
type AppliedCouponLike = { type?: string; value?: unknown; actual_value?: unknown };

export function listAppliedCoupons(job: unknown): AppliedCouponLike[] {
  const j = job as { applied_coupons?: unknown; applied_coupon?: AppliedCouponLike } | null;
  const raw = j?.applied_coupons;
  const list = Array.isArray(raw)
    ? (raw as AppliedCouponLike[])
    : (raw && typeof raw === 'object' ? Object.values(raw as Record<string, AppliedCouponLike>) : []);
  const present = list.filter(Boolean);
  if (present.length > 0) return present;
  return j?.applied_coupon ? [j.applied_coupon] : [];
}

export function sumAppliedCoupons(job: unknown): number {
  return listAppliedCoupons(job).reduce((sum, c) => {
    if (!c || c.type === 'service') return sum;
    const v = Number(c.actual_value ?? c.value);
    return Number.isFinite(v) ? sum + v : sum;
  }, 0);
}

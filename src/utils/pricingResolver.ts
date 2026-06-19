// Single source of truth for trade-in condition deductions (rider copy).
//
// MIRROR of bkk-system/src/utils/pricingResolver.ts — the four channels (admin
// inspection, internal QC, customer SellPageClient, server validateAndCreateOrder,
// and this rider inspection) MUST compute deductions identically. Cross-repo
// imports aren't possible, so this file is kept byte-for-byte in sync. If you
// change the math here, change every mirror (see CLAUDE.md cross-repo rule).
//
// Behavior: tier (t1/t2/t3) x liquidityFactor today; an `option.pct`
// percentage-of-base mode takes precedence when present (inert until data adds it).

export interface ConditionOptionLike {
  id?: string;
  label?: string;
  name?: string;
  t1?: number;
  t2?: number;
  t3?: number;
  /**
   * Percentage-of-base deduction (e.g. 35 = 35% of the model's base price).
   * When set to a finite number >= 0 it takes precedence over t1/t2/t3 and the
   * deduction scales smoothly with price (no tier buckets). Legacy options have
   * no `pct`, so they keep using tiers — this field is inert until data adds it.
   */
  pct?: number;
}

export interface ConditionGroupLike {
  title?: string;
  options?: ConditionOptionLike[];
}

/**
 * Tier deduction for a base price — the 3-bucket logic used everywhere:
 *   base >= 30,000 -> t1 | 15,000-29,999 -> t2 | < 15,000 -> t3
 */
export function tierDeduction(opt: ConditionOptionLike, basePrice: number): number {
  const b = Number(basePrice) || 0;
  if (b >= 30000) return Number(opt?.t1 || 0);
  if (b >= 15000) return Number(opt?.t2 || 0);
  return Number(opt?.t3 || 0);
}

/** Normalize a model's liquidity multiplier (default 1; must be > 0). */
export function normalizeLiquidityFactor(lf: unknown): number {
  const n = Number(lf);
  return n > 0 ? n : 1;
}

/** Whether an option uses percentage mode (a finite `pct` >= 0). */
export function isPercentOption(opt: ConditionOptionLike): boolean {
  if (opt?.pct == null) return false;
  const p = Number(opt.pct);
  return Number.isFinite(p) && p >= 0;
}

/**
 * Resolve one condition option's baht deduction for a model.
 *   percentage mode: round(basePrice × pct/100 × liquidityFactor)
 *   tier mode:       round(tierDeduction × liquidityFactor)   [legacy default]
 */
export function resolveOptionDeduction(
  opt: ConditionOptionLike,
  basePrice: number,
  liquidityFactor: unknown = 1,
): number {
  const lf = normalizeLiquidityFactor(liquidityFactor);
  if (isPercentOption(opt)) {
    return Math.round(((Number(basePrice) || 0) * Number(opt.pct)) / 100 * lf);
  }
  return Math.round(tierDeduction(opt, basePrice) * lf);
}

export interface DeductionLine {
  groupTitle: string;
  label: string;
  optionId: string;
  amount: number;
}

/** Sum the deductions for a set of selected option ids across all groups. */
export function resolveDeductions(
  groups: ConditionGroupLike[] | null | undefined,
  selectedOptionIds: Iterable<string>,
  basePrice: number,
  liquidityFactor: unknown = 1,
): { total: number; lines: DeductionLine[] } {
  const selected = new Set(selectedOptionIds);
  const lines: DeductionLine[] = [];
  let total = 0;
  for (const group of groups || []) {
    for (const opt of group?.options || []) {
      if (opt?.id != null && selected.has(opt.id)) {
        const amount = resolveOptionDeduction(opt, basePrice, liquidityFactor);
        total += amount;
        lines.push({
          groupTitle: group.title || '',
          label: opt.label || opt.name || '',
          optionId: opt.id,
          amount,
        });
      }
    }
  }
  return { total, lines };
}

/** Final price after deductions (never below 0). */
export function resolveFinalPrice(basePrice: number, totalDeduction: number): number {
  return Math.max(0, (Number(basePrice) || 0) - (Number(totalDeduction) || 0));
}

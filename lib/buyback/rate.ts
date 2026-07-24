import type { ScoredItem, DripQuadrant, ValueTier } from './types';

// Low-value quadrants are the ones the founder should hand off; the buyback
// rate is the share of the week those hours represent — the reclaimable slice.
const LOW_VALUE: ReadonlySet<DripQuadrant> = new Set(['Delegate', 'Replace']);

export function buybackRate(items: ScoredItem[]): number {
  const total = items.reduce((sum, i) => sum + i.hoursPerWeek, 0);
  if (total === 0) return 0;
  const low = items
    .filter((i) => LOW_VALUE.has(i.dripQuadrant))
    .reduce((sum, i) => sum + i.hoursPerWeek, 0);
  return low / total;
}

// The TRUE Buyback Rate (Martell): effective hourly (annual income / ~2000 full-
// time hours) quartered. Delegate everything whose work-value falls below it.
export function buybackHourlyRate(annualIncome: number): number {
  if (!Number.isFinite(annualIncome) || annualIncome <= 0) return 0;
  return Math.round(annualIncome / 2000 / 4);
}

const TIER_DOLLARS: Record<ValueTier, number> = {
  $10: 10, $100: 100, $1000: 1000, $10000: 10000,
};
export function tierDollars(tier: ValueTier): number {
  return TIER_DOLLARS[tier];
}

// A task is "above your rate" (keep) when the value its work creates per hour is
// at or above your Buyback Rate; below it, hand it off.
export function isAboveBuybackRate(item: ScoredItem, hourlyRate: number): boolean {
  return tierDollars(item.valueTier) >= hourlyRate;
}

import type { ScoredItem, RevenueProximity } from './types';

type RevenueRollup = Record<RevenueProximity, number> & { unknown: number };

// Hours by revenue-proximity. Items with no proximity (pre-0005 data, or a model
// miss) are counted as `unknown` so they are never silently miscategorised.
export function revenueHourRollup(items: ScoredItem[]): RevenueRollup {
  const r: RevenueRollup = {
    'revenue-direct': 0, 'revenue-adjacent': 0, 'non-revenue': 0, unknown: 0,
  };
  for (const i of items) {
    const key = i.revenueProximity ?? 'unknown';
    r[key] += i.hoursPerWeek;
  }
  return r;
}

// The single most useful line for a founder: hours that move money vs everything
// else. `other` deliberately includes adjacent, non-revenue, AND unknown.
export function soldVsBuilt(items: ScoredItem[]): { revenueDirect: number; other: number } {
  const total = items.reduce((s, i) => s + i.hoursPerWeek, 0);
  const revenueDirect = revenueHourRollup(items)['revenue-direct'];
  return { revenueDirect, other: total - revenueDirect };
}

// Caution: non-revenue "keep" time (Invest/Produce) crowding out selling. Fires
// when non-revenue Invest+Produce hours >= revenue-direct hours AND at least one
// item carries proximity (so old data stays silent). Sharper for pre-revenue.
const KEEP_QUADRANTS = new Set(['Invest', 'Produce']);
export function revenueCaution(
  items: ScoredItem[],
  opts: { isAtRevenue: boolean },
): { message: string } | null {
  const anyTagged = items.some((i) => i.revenueProximity != null);
  if (!anyTagged) return null;

  const nonRevenueKeep = items
    .filter((i) => i.revenueProximity === 'non-revenue' && KEEP_QUADRANTS.has(i.dripQuadrant))
    .reduce((s, i) => s + i.hoursPerWeek, 0);
  const revenueDirect = revenueHourRollup(items)['revenue-direct'];

  if (nonRevenueKeep < revenueDirect || nonRevenueKeep === 0) return null;

  const message = opts.isAtRevenue
    ? `${nonRevenueKeep} hrs/wk of non-revenue Invest and Produce work outweighs your ${revenueDirect} hrs of revenue-direct work. Protect the build time only if it compounds; otherwise shift hours toward what sells.`
    : `You are pre-revenue and ${nonRevenueKeep} hrs/wk sit in non-revenue Invest and Produce work while only ${revenueDirect} hrs go to revenue-direct work. Before consistent revenue, build time is deferrable, not sacred. Move hours toward selling.`;
  return { message };
}

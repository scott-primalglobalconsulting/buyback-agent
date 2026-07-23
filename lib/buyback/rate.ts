import type { ScoredItem, DripQuadrant } from './types';

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

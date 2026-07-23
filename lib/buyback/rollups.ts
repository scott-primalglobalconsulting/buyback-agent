import type { ScoredItem, DripQuadrant } from './types';

const QUADRANTS: readonly DripQuadrant[] = ['Delegate', 'Replace', 'Invest', 'Produce'];

export function quadrantHourRollup(items: ScoredItem[]): Record<DripQuadrant, number> {
  const rollup = Object.fromEntries(QUADRANTS.map((q) => [q, 0])) as Record<DripQuadrant, number>;
  for (const i of items) rollup[i.dripQuadrant] += i.hoursPerWeek;
  return rollup;
}

export function topTasksToOffload(items: ScoredItem[], limit = 3): ScoredItem[] {
  return items
    .filter((i) => i.recommendation !== 'keep')
    .sort((a, b) => b.hoursPerWeek - a.hoursPerWeek)
    .slice(0, limit);
}

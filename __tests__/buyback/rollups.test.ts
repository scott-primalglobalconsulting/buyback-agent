import { describe, it, expect } from 'vitest';
import { quadrantHourRollup, topTasksToOffload } from '@/lib/buyback/rollups';
import type { ScoredItem } from '@/lib/buyback/types';

const item = (o: Partial<ScoredItem>): ScoredItem => ({
  task: 't', hoursPerWeek: 1, costToDelegate: 30, valueTier: '$100',
  dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'r', ...o,
});

describe('quadrantHourRollup', () => {
  it('always returns all four quadrants, summing hours', () => {
    const r = quadrantHourRollup([
      item({ dripQuadrant: 'Delegate', hoursPerWeek: 3 }),
      item({ dripQuadrant: 'Delegate', hoursPerWeek: 2 }),
      item({ dripQuadrant: 'Produce', hoursPerWeek: 4 }),
    ]);
    expect(r).toEqual({ Delegate: 5, Replace: 0, Invest: 0, Produce: 4 });
  });
});

describe('topTasksToOffload', () => {
  it('excludes keep, sorts by hours desc, respects limit', () => {
    const out = topTasksToOffload([
      item({ task: 'a', recommendation: 'keep', hoursPerWeek: 9 }),
      item({ task: 'b', recommendation: 'delegate', hoursPerWeek: 2 }),
      item({ task: 'c', recommendation: 'eliminate', hoursPerWeek: 6 }),
      item({ task: 'd', recommendation: 'delegate', hoursPerWeek: 4 }),
    ], 2);
    expect(out.map((i) => i.task)).toEqual(['c', 'd']);
  });
});

import { describe, it, expect } from 'vitest';
import { buybackRate } from '@/lib/buyback/rate';
import type { ScoredItem } from '@/lib/buyback/types';

const item = (hours: number, q: ScoredItem['dripQuadrant']): ScoredItem => ({
  task: 't', hoursPerWeek: hours, costToDelegate: 30,
  valueTier: '$100', dripQuadrant: q, recommendation: 'keep', rationale: 'r',
});

describe('buybackRate', () => {
  it('is the fraction of hours in Delegate+Replace', () => {
    const items = [item(5, 'Delegate'), item(5, 'Replace'), item(10, 'Produce')];
    expect(buybackRate(items)).toBeCloseTo(0.5);
  });
  it('is 0 for an empty audit', () => {
    expect(buybackRate([])).toBe(0);
  });
  it('is 0 when all work is high-value', () => {
    expect(buybackRate([item(8, 'Invest'), item(2, 'Produce')])).toBe(0);
  });
  it('is 1 when all work is low-value', () => {
    expect(buybackRate([item(4, 'Delegate'), item(6, 'Replace')])).toBe(1);
  });
});

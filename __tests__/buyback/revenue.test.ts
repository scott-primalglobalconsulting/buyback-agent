import { describe, it, expect } from 'vitest';
import {
  revenueHourRollup, soldVsBuilt, revenueCaution,
} from '@/lib/buyback/revenue';
import { buybackHourlyRate, tierDollars, isAboveBuybackRate } from '@/lib/buyback/rate';
import type { ScoredItem } from '@/lib/buyback/types';

function item(p: Partial<ScoredItem>): ScoredItem {
  return {
    task: 't', hoursPerWeek: 1, costToDelegate: 0,
    valueTier: '$100', dripQuadrant: 'Invest', recommendation: 'keep', rationale: 'r',
    ...p,
  };
}

describe('revenueHourRollup', () => {
  it('buckets hours by proximity and counts missing as unknown', () => {
    const r = revenueHourRollup([
      item({ hoursPerWeek: 3, revenueProximity: 'revenue-direct' }),
      item({ hoursPerWeek: 2, revenueProximity: 'non-revenue' }),
      item({ hoursPerWeek: 1 }), // no proximity
    ]);
    expect(r['revenue-direct']).toBe(3);
    expect(r['non-revenue']).toBe(2);
    expect(r.unknown).toBe(1);
  });
});

describe('soldVsBuilt', () => {
  it('splits revenue-direct hours from everything else', () => {
    const r = soldVsBuilt([
      item({ hoursPerWeek: 4, revenueProximity: 'revenue-direct' }),
      item({ hoursPerWeek: 6, revenueProximity: 'non-revenue' }),
      item({ hoursPerWeek: 2, revenueProximity: 'revenue-adjacent' }),
    ]);
    expect(r.revenueDirect).toBe(4);
    expect(r.other).toBe(8);
  });
});

describe('revenueCaution', () => {
  const crowded = [
    item({ hoursPerWeek: 10, dripQuadrant: 'Invest', revenueProximity: 'non-revenue' }),
    item({ hoursPerWeek: 2, dripQuadrant: 'Produce', revenueProximity: 'revenue-direct' }),
  ];
  it('fires when non-revenue Invest/Produce hours meet or exceed revenue-direct hours', () => {
    expect(revenueCaution(crowded, { isAtRevenue: false })).not.toBeNull();
  });
  it('is sharper for pre-revenue users', () => {
    const pre = revenueCaution(crowded, { isAtRevenue: false })!.message;
    const post = revenueCaution(crowded, { isAtRevenue: true })!.message;
    expect(pre).not.toEqual(post);
    expect(pre.toLowerCase()).toContain('revenue');
  });
  it('stays silent when revenue-direct hours dominate', () => {
    const healthy = [
      item({ hoursPerWeek: 10, dripQuadrant: 'Produce', revenueProximity: 'revenue-direct' }),
      item({ hoursPerWeek: 1, dripQuadrant: 'Invest', revenueProximity: 'non-revenue' }),
    ];
    expect(revenueCaution(healthy, { isAtRevenue: false })).toBeNull();
  });
  it('stays silent when no items carry proximity (old data)', () => {
    expect(revenueCaution([item({ hoursPerWeek: 5 })], { isAtRevenue: false })).toBeNull();
  });
});

describe('buyback-rate math', () => {
  it('buybackHourlyRate = income / 2000 / 4', () => {
    expect(buybackHourlyRate(200_000)).toBe(25); // 200000/2000=100, /4=25
  });
  it('tierDollars maps the ladder', () => {
    expect(tierDollars('$10')).toBe(10);
    expect(tierDollars('$10000')).toBe(10_000);
  });
  it('isAboveBuybackRate compares the work-value tier to the rate', () => {
    expect(isAboveBuybackRate(item({ valueTier: '$10' }), 25)).toBe(false);
    expect(isAboveBuybackRate(item({ valueTier: '$100' }), 25)).toBe(true);
  });
});

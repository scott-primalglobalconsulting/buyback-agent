import { describe, it, expect } from 'vitest';
import { decideDemo, validatePayloadSize, GUARD_LIMITS } from '@/lib/guard/policy';

describe('decideDemo', () => {
  it('serves fresh cache before any rate/budget check', () => {
    expect(decideDemo({ ipRunsThisHour: 999, dailyLiveCount: 999, cacheAgeMs: 1000, nowFresh: true }))
      .toEqual({ kind: 'serve_cache' });
  });
  it('rate-limits when cache is cold and the per-IP cap is hit', () => {
    expect(decideDemo({ ipRunsThisHour: GUARD_LIMITS.demoRunsPerIpPerHour, dailyLiveCount: 0, cacheAgeMs: null, nowFresh: false }))
      .toEqual({ kind: 'rate_limited' });
  });
  it('trips the breaker to stale cache when the daily budget is spent', () => {
    expect(decideDemo({ ipRunsThisHour: 0, dailyLiveCount: GUARD_LIMITS.dailyDemoApiBudget, cacheAgeMs: 9e9, nowFresh: false }))
      .toEqual({ kind: 'breaker_serve_cache' });
  });
  it('is unavailable when the breaker is tripped and no cache exists', () => {
    expect(decideDemo({ ipRunsThisHour: 0, dailyLiveCount: GUARD_LIMITS.dailyDemoApiBudget, cacheAgeMs: null, nowFresh: false }))
      .toEqual({ kind: 'unavailable' });
  });
  it('computes live when under all caps with no fresh cache', () => {
    expect(decideDemo({ ipRunsThisHour: 0, dailyLiveCount: 0, cacheAgeMs: null, nowFresh: false }))
      .toEqual({ kind: 'compute_live' });
  });
});

describe('validatePayloadSize', () => {
  it('rejects too many items', () => {
    const items = Array.from({ length: GUARD_LIMITS.maxItems + 1 }, () => ({ task: 'x' }));
    expect(validatePayloadSize(items).ok).toBe(false);
  });
  it('rejects an over-length task', () => {
    expect(validatePayloadSize([{ task: 'x'.repeat(GUARD_LIMITS.maxTaskLen + 1) }]).ok).toBe(false);
  });
  it('accepts a normal payload', () => {
    expect(validatePayloadSize([{ task: 'Reconcile books' }]).ok).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { SAMPLE_WEEK } from '@/lib/sample';

// SAMPLE_WEEK is the fixed demo dataset the /demo path analyzes (the request
// body is ignored for anonymous callers). It must read as a believable
// founder's week so the demo output is convincing.
describe('SAMPLE_WEEK', () => {
  it('has at least 8 rows', () => {
    expect(SAMPLE_WEEK.length).toBeGreaterThanOrEqual(8);
  });

  it('every row is a valid TaskInput with positive numbers', () => {
    for (const row of SAMPLE_WEEK) {
      expect(typeof row.task).toBe('string');
      expect(row.task.trim().length).toBeGreaterThan(0);
      expect(row.hoursPerWeek).toBeGreaterThan(0);
      expect(row.costToDelegate).toBeGreaterThan(0);
    }
  });

  it('spans a believable spread of delegation costs (low admin -> high founder work)', () => {
    const costs = SAMPLE_WEEK.map((r) => r.costToDelegate);
    expect(Math.min(...costs)).toBeLessThan(50);
    expect(Math.max(...costs)).toBeGreaterThan(150);
  });

  it('totals a realistic full working week of hours', () => {
    const total = SAMPLE_WEEK.reduce((sum, r) => sum + r.hoursPerWeek, 0);
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(60);
  });

  it('has no duplicate task names', () => {
    const names = SAMPLE_WEEK.map((r) => r.task);
    expect(new Set(names).size).toBe(names.length);
  });
});

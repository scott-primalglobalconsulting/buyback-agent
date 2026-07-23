import { describe, it, expect } from 'vitest';
import {
  AnalysisResultSchema, SopSchema, analysisToolJsonSchema, DRIP_QUADRANTS, VALUE_TIERS, RECOMMENDATIONS, HIRE_ROLES,
} from '@/lib/agent/schema';

describe('AnalysisResultSchema', () => {
  it('accepts a well-formed result', () => {
    const ok = AnalysisResultSchema.safeParse({
      items: [{
        task: 'Reconcile bank statements', hoursPerWeek: 5, costToDelegate: 25,
        valueTier: '$10', dripQuadrant: 'Delegate', recommendation: 'delegate',
        rationale: 'Low-value, easily handed off.',
      }],
      summary: { firstHireRole: 'admin', firstHireJustification: 'Reclaim admin hours.' },
    });
    expect(ok.success).toBe(true);
  });
  it('rejects an out-of-vocabulary quadrant', () => {
    const bad = AnalysisResultSchema.safeParse({
      items: [{ task: 't', hoursPerWeek: 1, costToDelegate: 1, valueTier: '$10',
        dripQuadrant: 'Nope', recommendation: 'keep', rationale: 'r' }],
      summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
    });
    expect(bad.success).toBe(false);
  });
  it('rejects negative hours', () => {
    const bad = AnalysisResultSchema.safeParse({
      items: [{ task: 't', hoursPerWeek: -1, costToDelegate: 1, valueTier: '$10',
        dripQuadrant: 'Delegate', recommendation: 'keep', rationale: 'r' }],
      summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
    });
    expect(bad.success).toBe(false);
  });
});

describe('SopSchema', () => {
  it('requires purpose, steps, definitionOfDone, toolsNeeded', () => {
    const ok = SopSchema.safeParse({
      purpose: 'p', steps: ['a', 'b'], definitionOfDone: 'd', toolsNeeded: ['x'],
    });
    expect(ok.success).toBe(true);
    expect(SopSchema.safeParse({ purpose: 'p' }).success).toBe(false);
  });
});

describe('tool JSON schema stays in lockstep with Zod enums', () => {
  const itemProps = analysisToolJsonSchema.properties.items.items.properties;
  it('dripQuadrant enum matches', () => expect(itemProps.dripQuadrant.enum).toEqual([...DRIP_QUADRANTS]));
  it('valueTier enum matches', () => expect(itemProps.valueTier.enum).toEqual([...VALUE_TIERS]));
  it('recommendation enum matches', () => expect(itemProps.recommendation.enum).toEqual([...RECOMMENDATIONS]));
  it('firstHireRole enum matches', () =>
    expect(analysisToolJsonSchema.properties.summary.properties.firstHireRole.enum).toEqual([...HIRE_ROLES]));
});

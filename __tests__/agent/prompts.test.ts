import { describe, it, expect } from 'vitest';
import {
  ANALYZE_SYSTEM,
  buildAnalyzeUserContent,
  SOP_SYSTEM,
  buildSopUserContent,
} from '@/lib/agent/prompts';
import type { ScoredItem } from '@/lib/agent/schema';

describe('ANALYZE_SYSTEM revenue-proximity', () => {
  it('defines all three revenue-proximity tags', () => {
    for (const tag of ['revenue-direct', 'revenue-adjacent', 'non-revenue']) {
      expect(ANALYZE_SYSTEM).toContain(tag);
    }
  });
  it('states proximity is independent of DRIP', () => {
    expect(ANALYZE_SYSTEM.toLowerCase()).toContain('independent');
  });
});

describe('buildAnalyzeUserContent', () => {
  it('asks for a revenue-proximity tag on every row', () => {
    const content = buildAnalyzeUserContent([{ task: 'Sales calls', hoursPerWeek: 6, costToDelegate: 150 }]);
    expect(content.toLowerCase()).toContain('revenue');
  });
});

describe('SOP prompt fit', () => {
  it('does not hardcode a funded stack or a volume/pricing philosophy', () => {
    const s = SOP_SYSTEM.toLowerCase();
    for (const banned of ['apollo', 'hubspot', 'pipedrive', 'sales navigator', 'neverbounce']) {
      expect(s).not.toContain(banned);
    }
  });
  it('adapts to a solo / no-budget operator', () => {
    const item: ScoredItem = {
      task: 'Cold outreach',
      hoursPerWeek: 5,
      costToDelegate: 30,
      valueTier: '$100',
      dripQuadrant: 'Delegate',
      recommendation: 'delegate',
      rationale: 'r',
    };
    const content = buildSopUserContent(item, '', { team: 'solo', toolBudget: 'none' });
    expect(content.toLowerCase()).toContain('solo');
    expect(content.toLowerCase()).toMatch(/free|no paid|no budget/);
  });
});

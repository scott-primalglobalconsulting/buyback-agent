import { describe, it, expect } from 'vitest';
import { ANALYZE_SYSTEM, buildAnalyzeUserContent } from '@/lib/agent/prompts';

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

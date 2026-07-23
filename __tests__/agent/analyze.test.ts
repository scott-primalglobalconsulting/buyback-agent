import { describe, it, expect, vi } from 'vitest';
import { analyzeAudit } from '@/lib/agent/analyze';

describe('analyzeAudit', () => {
  it('validates and returns the structured result', async () => {
    const payload = {
      items: [
        {
          task: 'Reconcile bank statements',
          hoursPerWeek: 5,
          costToDelegate: 25,
          valueTier: '$10',
          dripQuadrant: 'Delegate',
          recommendation: 'delegate',
          rationale: 'Low-value, easily handed off.',
        },
      ],
      summary: { firstHireRole: 'admin', firstHireJustification: 'Reclaim admin hours.' },
    };
    const caller = { call: vi.fn().mockResolvedValue(payload) };

    const out = await analyzeAudit(
      [{ task: 'Reconcile bank statements', hoursPerWeek: 5, costToDelegate: 25 }],
      caller as never,
    );

    expect(out.items[0].dripQuadrant).toBe('Delegate');
    expect(out.summary.firstHireRole).toBe('admin');
    // the user content handed to the caller must carry each input task verbatim
    expect(caller.call.mock.calls[0][0].messages[0].content).toContain(
      'Reconcile bank statements',
    );
  });

  it('scores multiple input rows and passes them all to the caller', async () => {
    const payload = {
      items: [
        {
          task: 'Reconcile bank statements',
          hoursPerWeek: 5,
          costToDelegate: 25,
          valueTier: '$10',
          dripQuadrant: 'Delegate',
          recommendation: 'delegate',
          rationale: 'r1',
        },
        {
          task: 'Close enterprise deals',
          hoursPerWeek: 8,
          costToDelegate: 200,
          valueTier: '$10000',
          dripQuadrant: 'Produce',
          recommendation: 'keep',
          rationale: 'r2',
        },
      ],
      summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
    };
    const caller = { call: vi.fn().mockResolvedValue(payload) };

    const out = await analyzeAudit(
      [
        { task: 'Reconcile bank statements', hoursPerWeek: 5, costToDelegate: 25 },
        { task: 'Close enterprise deals', hoursPerWeek: 8, costToDelegate: 200 },
      ],
      caller as never,
    );

    expect(out.items).toHaveLength(2);
    const content = caller.call.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain('Reconcile bank statements');
    expect(content).toContain('Close enterprise deals');
  });
});

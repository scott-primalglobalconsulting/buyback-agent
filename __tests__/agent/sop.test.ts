import { describe, it, expect, vi } from 'vitest';
import { generateSOP } from '@/lib/agent/sop';
import type { ScoredItem } from '@/lib/agent/schema';

describe('generateSOP', () => {
  it('validates and returns the parsed SOP, passing task + context to the caller', async () => {
    const payload = {
      purpose: 'Keep the books reconciled so cash position is always accurate.',
      steps: [
        'Open the bank feed in the accounting tool.',
        'Match each transaction to a recorded entry.',
        'Flag any unmatched line for founder review.',
      ],
      definitionOfDone: 'Every transaction is matched and the reconciliation report shows a $0 difference.',
      toolsNeeded: ['QuickBooks', 'Bank login'],
    };
    const caller = { call: vi.fn().mockResolvedValue(payload) };

    const item: ScoredItem = {
      task: 'Reconcile bank statements',
      hoursPerWeek: 5,
      costToDelegate: 25,
      valueTier: '$10',
      dripQuadrant: 'Delegate',
      recommendation: 'delegate',
      rationale: 'Low-value, easily handed off.',
    };
    const workspaceContext = 'Founder uses QuickBooks and reconciles every Friday morning.';

    const out = await generateSOP(item, workspaceContext, caller as never);

    expect(out.purpose).toBe(payload.purpose);
    expect(out.steps).toHaveLength(3);
    expect(out.definitionOfDone).toContain('$0 difference');
    expect(out.toolsNeeded).toContain('QuickBooks');

    // the user content handed to the caller must carry both the task and the workspace context
    const content = caller.call.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain('Reconcile bank statements');
    expect(content).toContain(workspaceContext);
  });
});

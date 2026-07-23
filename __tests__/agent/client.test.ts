import { describe, it, expect, vi } from 'vitest';
import { structuredToolCall, StructuredCallError } from '@/lib/agent/client';
import { AnalysisResultSchema, analysisToolJsonSchema } from '@/lib/agent/schema';

const valid = {
  items: [{ task: 't', hoursPerWeek: 1, costToDelegate: 1, valueTier: '$10',
    dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'r' }],
  summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
};

const run = (caller: { call: ReturnType<typeof vi.fn> }) =>
  structuredToolCall({
    caller: caller as never, system: 's', userContent: 'u',
    toolName: 'submit_analysis', toolSchema: analysisToolJsonSchema,
    validate: (raw) => AnalysisResultSchema.parse(raw),
  });

describe('structuredToolCall', () => {
  it('returns validated output on first success', async () => {
    const caller = { call: vi.fn().mockResolvedValueOnce(valid) };
    expect(await run(caller)).toEqual(valid);
    expect(caller.call).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once when the first response is invalid, then succeeds', async () => {
    const caller = { call: vi.fn()
      .mockResolvedValueOnce({ items: [], summary: {} }) // invalid
      .mockResolvedValueOnce(valid) };
    expect(await run(caller)).toEqual(valid);
    expect(caller.call).toHaveBeenCalledTimes(2);
    // second call must feed the validation failure back as feedback
    const secondMessages = caller.call.mock.calls[1][0].messages;
    expect(JSON.stringify(secondMessages)).toContain('failed validation');
  });

  it('throws StructuredCallError after a second invalid response', async () => {
    const caller = { call: vi.fn()
      .mockResolvedValueOnce({ bad: 1 }).mockResolvedValueOnce({ bad: 2 }) };
    await expect(run(caller)).rejects.toBeInstanceOf(StructuredCallError);
    expect(caller.call).toHaveBeenCalledTimes(2);
  });
});

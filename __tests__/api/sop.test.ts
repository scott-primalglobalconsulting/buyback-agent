import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScoredItem, Sop } from '@/lib/agent/schema';

// The SOP route is tested WITHOUT the Anthropic API by faking the lib/db session
// and lib/agent generateSOP seams. The live generation leg is an operator gate,
// verified later — it is intentionally NOT exercised here. Keep the REAL
// ScoredItemSchema so body validation is genuinely tested.
vi.mock('@/lib/db/session', () => ({ getSessionUserId: vi.fn() }));
vi.mock('@/lib/agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent')>()),
  generateSOP: vi.fn(),
}));

import { POST } from '@/app/api/sop/route';
import { getSessionUserId } from '@/lib/db/session';
import { generateSOP } from '@/lib/agent';

const ITEM: ScoredItem = {
  task: 'Reconcile bank statements',
  hoursPerWeek: 5,
  costToDelegate: 25,
  valueTier: '$10',
  dripQuadrant: 'Delegate',
  recommendation: 'delegate',
  rationale: 'Low-value, easily handed off.',
};

const SOP: Sop = {
  purpose: 'Keep the books reconciled.',
  steps: ['Open the bank feed.', 'Match each transaction.'],
  definitionOfDone: 'The report shows a $0 difference.',
  toolsNeeded: ['QuickBooks'],
};

function post(body?: unknown): Request {
  return new Request('http://localhost/api/sop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/sop', () => {
  it('returns 401 for an anonymous caller — no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);

    const res = await POST(post({ item: ITEM }));

    expect(res.status).toBe(401);
    expect(generateSOP).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed item — no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');

    const res = await POST(post({ item: { task: 'x' } }));

    expect(res.status).toBe(400);
    expect(generateSOP).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON — no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');

    const res = await POST(post());

    expect(res.status).toBe(400);
    expect(generateSOP).not.toHaveBeenCalled();
  });

  it('returns 413 when the context exceeds the cap — no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');

    const res = await POST(post({ item: ITEM, context: 'x'.repeat(2001) }));

    expect(res.status).toBe(413);
    expect(generateSOP).not.toHaveBeenCalled();
  });

  it('returns 413 when the item task exceeds the cap — no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');

    const item = { ...ITEM, task: 'x'.repeat(501) };
    const res = await POST(post({ item }));

    expect(res.status).toBe(413);
    expect(generateSOP).not.toHaveBeenCalled();
  });

  it('returns 413 when the item rationale exceeds the cap — no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');

    const item = { ...ITEM, rationale: 'x'.repeat(2001) };
    const res = await POST(post({ item }));

    expect(res.status).toBe(413);
    expect(generateSOP).not.toHaveBeenCalled();
  });

  it('returns the validated SOP as JSON for an authed, valid request', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');
    vi.mocked(generateSOP).mockResolvedValue(SOP);

    const res = await POST(post({ item: ITEM, context: 'Uses QuickBooks.' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as Sop;
    expect(body.purpose).toBe(SOP.purpose);
    expect(generateSOP).toHaveBeenCalledWith(ITEM, 'Uses QuickBooks.', {
      team: undefined,
      toolBudget: undefined,
    });
  });

  it('surfaces a generic 500 (never the API error) when generation throws', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');
    vi.mocked(generateSOP).mockRejectedValue(new Error('anthropic key sk-leak'));

    const res = await POST(post({ item: ITEM }));

    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message).not.toContain('sk-leak');
  });
});

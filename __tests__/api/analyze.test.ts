import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GUARD_LIMITS } from '@/lib/guard/policy';

// The route's non-live branches (rate_limited, cache-serve, authed over-cap) are
// tested WITHOUT the Anthropic API by faking the lib/db and lib/agent seams. The
// live compute_live leg hits the real API and is an operator gate, verified
// later — it is intentionally NOT exercised here.
vi.mock('@/lib/db/session', () => ({ getSessionUserId: vi.fn() }));
vi.mock('@/lib/db/guard', () => ({
  getSampleCache: vi.fn(),
  putSampleCache: vi.fn(),
  incrDemoRate: vi.fn(),
  getDailyLiveCount: vi.fn(),
  incrDailyLiveCount: vi.fn(),
}));
vi.mock('@/lib/agent', () => ({
  analyzeAudit: vi.fn(),
  streamAnalyzeAudit: vi.fn(),
}));

import { POST } from '@/app/api/analyze/route';
import { getSessionUserId } from '@/lib/db/session';
import {
  getSampleCache,
  getDailyLiveCount,
  incrDemoRate,
  putSampleCache,
} from '@/lib/db/guard';
import { analyzeAudit, streamAnalyzeAudit } from '@/lib/agent';

const CACHED_RESULT = {
  items: [
    {
      task: 'Bookkeeping & reconciliation',
      hoursPerWeek: 4,
      costToDelegate: 40,
      valueTier: '$100',
      dripQuadrant: 'Delegate',
      recommendation: 'delegate',
      rationale: 'Low-value, easily handed off.',
    },
  ],
  summary: { firstHireRole: 'admin', firstHireJustification: 'Reclaim admin hours.' },
};

function post(body?: unknown): Request {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function assertNoAgentCall() {
  expect(streamAnalyzeAudit).not.toHaveBeenCalled();
  expect(analyzeAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SERVER_SALT = 'test-salt';
});

describe('POST /api/analyze — demo path', () => {
  it('returns 429 when the per-IP cap is hit on a cold cache — no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    vi.mocked(incrDemoRate).mockResolvedValue(GUARD_LIMITS.demoRunsPerIpPerHour);
    vi.mocked(getSampleCache).mockResolvedValue(null);
    vi.mocked(getDailyLiveCount).mockResolvedValue(0);

    const res = await POST(post());

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.message).toMatch(/sign in/i);
    assertNoAgentCall();
  });

  it('streams the cached result (thinking replay + result) with no API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    vi.mocked(incrDemoRate).mockResolvedValue(1);
    vi.mocked(getSampleCache).mockResolvedValue({ resultJson: CACHED_RESULT, ageMs: 1000 });
    vi.mocked(getDailyLiveCount).mockResolvedValue(0);

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('"type":"thinking"');
    expect(text).toContain('"type":"result"');
    expect(text).toContain('Bookkeeping & reconciliation');
    assertNoAgentCall();
    expect(putSampleCache).not.toHaveBeenCalled();
  });
});

describe('POST /api/analyze — authenticated path', () => {
  it('rejects an over-cap payload with 413 before any API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');
    const items = Array.from({ length: GUARD_LIMITS.maxItems + 1 }, (_, i) => ({
      task: `Task ${i}`,
      hoursPerWeek: 1,
      costToDelegate: 10,
    }));

    const res = await POST(post({ items }));

    expect(res.status).toBe(413);
    assertNoAgentCall();
  });

  it('rejects a malformed body with 400 before any API call', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');

    const res = await POST(post({ notItems: true }));

    expect(res.status).toBe(400);
    assertNoAgentCall();
  });
});

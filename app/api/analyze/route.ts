import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  analyzeAudit,
  streamAnalyzeAudit,
  AnalysisResultSchema,
  type AnalysisResult,
} from '@/lib/agent';
import { decideDemo, validatePayloadSize, GUARD_LIMITS } from '@/lib/guard/policy';
import {
  getSampleCache,
  putSampleCache,
  incrDemoRate,
  getDailyLiveCount,
  incrDailyLiveCount,
} from '@/lib/db/guard';
import { getSessionUserId } from '@/lib/db/session';
import { SAMPLE_WEEK } from '@/lib/sample';

// POST /api/analyze — the single analyze entry point, consumed by /demo (Task
// 5.2, anonymous) and the authed audit flow (Task 5.3). Node runtime: it needs
// node:crypto (IP hashing) and the streaming Anthropic client, neither of which
// runs on the edge.
//
// ISOLATION: this route consumes lib/agent, lib/db, lib/guard, lib/buyback ONLY.
// It never imports @anthropic-ai/sdk or a Supabase client directly — lib/db is
// the sole Supabase touchpoint (auth via getSessionUserId, counters via
// lib/db/guard). The API key never reaches the client; only thinking/result/
// error events are streamed out.
//
// ── SSE EVENT SCHEMA (the /demo client consumes this exact shape) ────────────
// Each line is `data: {json}\n\n`. Event objects are one of:
//   { type: 'thinking', text: string }   — a summarized-thinking delta (0..N)
//   { type: 'result',   result: AnalysisResult } — the final validated result (1)
//   { type: 'error',    message: string } — terminal failure; no result follows
// A well-formed stream is: zero or more `thinking`, then exactly one `result`;
// or, on failure, an `error`. Cached responses emit ONLY the validated `result`
// (no fabricated thinking) — no API call is made. The `thinking` event type
// stays defined for the live path and future use; the client owns the reveal.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

type SseEvent =
  | { type: 'thinking'; text: string }
  | { type: 'result'; result: AnalysisResult }
  | { type: 'error'; message: string };

// Authenticated request body: { items: TaskInput[] }. Parsed BEFORE
// validatePayloadSize runs, because that helper assumes item.task is a string
// (carry-over from Phase 4) — never hand it unparsed input.
const TaskInputSchema = z.object({
  task: z.string().min(1),
  hoursPerWeek: z.number().positive(),
  costToDelegate: z.number().nonnegative(),
});
const AnalyzeRequestSchema = z.object({
  items: z.array(TaskInputSchema).min(1),
});

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

const GENERIC_ERROR = 'Analysis failed. Please try again in a moment.';

export async function POST(req: Request): Promise<Response> {
  const userId = await getSessionUserId();
  return userId ? handleAuthenticated(req) : handleDemo(req);
}

// ── Authenticated path: analyze the user's REAL input ────────────────────────
async function handleAuthenticated(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'Invalid request: expected { items: TaskInput[] }.');
  }
  const items = parsed.data.items;

  // Cap the work (and thus token cost) a single request can demand. Only runs
  // after Zod has guaranteed every item.task is a string.
  const size = validatePayloadSize(items);
  if (!size.ok) {
    return jsonError(413, size.reason);
  }

  return sseResponse(authedStream(items));
}

// Stream the authed analysis. On a stream-side validation throw, fall back to
// analyzeAudit (the validated-retry path). Only emit an error event if that
// also fails — a single transient schema miss should not surface to the user.
async function* authedStream(items: z.infer<typeof TaskInputSchema>[]): AsyncGenerator<SseEvent> {
  try {
    for await (const ev of streamAnalyzeAudit(items)) {
      yield ev.type === 'thinking'
        ? { type: 'thinking', text: ev.text }
        : { type: 'result', result: ev.data };
    }
  } catch {
    try {
      const result = await analyzeAudit(items);
      yield { type: 'result', result };
    } catch {
      yield { type: 'error', message: GENERIC_ERROR };
    }
  }
}

// ── Demo path: IGNORE the request body, analyze SAMPLE_WEEK under the guard ───
async function handleDemo(req: Request): Promise<Response> {
  const ipHash = hashIp(clientIp(req));

  // Increment the per-IP counter, then read cache age + today's live budget.
  // decideDemo (pure) applies the load-bearing precedence over these numbers.
  const [ipRunsThisHour, cache, dailyLiveCount] = await Promise.all([
    incrDemoRate(ipHash),
    getSampleCache(),
    getDailyLiveCount(),
  ]);

  const cacheAgeMs = cache ? cache.ageMs : null;
  const nowFresh = cacheAgeMs !== null && cacheAgeMs < GUARD_LIMITS.cacheTtlMs;
  const verdict = decideDemo({ ipRunsThisHour, dailyLiveCount, cacheAgeMs, nowFresh });

  switch (verdict.kind) {
    case 'serve_cache':
    case 'breaker_serve_cache':
      // Fresh cache or breaker-tripped-with-cache: emit the genuine cached
      // result (no fabricated thinking). NO API call. decideDemo only returns
      // these when a cache row exists, so `cache` is non-null here.
      return sseResponse(cacheReplayStream(cache!.resultJson));

    case 'rate_limited':
      return jsonError(
        429,
        'Demo limit reached. Sign in for unlimited analyses of your own tasks.',
      );

    case 'unavailable':
      // Breaker tripped and no cache to fall back to.
      return jsonError(503, 'The demo is briefly unavailable. Please try again shortly.');

    case 'compute_live':
      return computeLiveDemo(cache);
  }
}

// compute_live: reserve budget FIRST (increment-then-check) so two concurrent
// requests can never both spend "the last" budgeted call. incrDailyLiveCount
// returns the POST-increment count; if it overshoots the budget we lost the
// race — serve cache if any, else 503 — and never touch the API.
async function computeLiveDemo(
  cache: { resultJson: unknown; ageMs: number } | null,
): Promise<Response> {
  const newCount = await incrDailyLiveCount();
  if (newCount > GUARD_LIMITS.dailyDemoApiBudget) {
    if (cache) return sseResponse(cacheReplayStream(cache.resultJson));
    return jsonError(503, 'The demo is briefly unavailable. Please try again shortly.');
  }
  return sseResponse(demoLiveStream());
}

// Live demo stream over SAMPLE_WEEK. On success, cache the result so the next
// viewer is served for free. On a stream-side validation throw, fall back to
// analyzeAudit (and still cache); only emit an error event if that also fails.
async function* demoLiveStream(): AsyncGenerator<SseEvent> {
  try {
    let result: AnalysisResult | undefined;
    for await (const ev of streamAnalyzeAudit(SAMPLE_WEEK)) {
      if (ev.type === 'thinking') {
        yield { type: 'thinking', text: ev.text };
      } else {
        // Hold the result; do NOT yield it inside the loop. The SSE stream is
        // pull-driven and the client stops pulling the instant it sees the
        // `result` event, which cancels this generator — so any write AFTER the
        // terminal yield never runs. Cache first, yield last (below).
        result = ev.data;
      }
    }
    if (result) {
      // Cache BEFORE the terminal yield so the write always lands on the normal
      // completion path. Costs a few ms before the client sees the result;
      // correctness over latency on the cost-bearing demo path.
      await putSampleCache(result);
      yield { type: 'result', result };
    }
  } catch {
    try {
      const result = await analyzeAudit(SAMPLE_WEEK);
      // Same ordering rule as above: cache before the terminal yield.
      await putSampleCache(result);
      yield { type: 'result', result };
    } catch {
      yield { type: 'error', message: GENERIC_ERROR };
    }
  }
}

// Emit the cached result. No API call, and no fabricated thinking — the client
// owns the reveal animation. Re-validate the DB row against AnalysisResultSchema
// before streaming it: a cache row is persisted data that could be stale-shaped
// or corrupt, and we must never stream malformed data to the client as a genuine
// `result`. On a validation miss, emit an error event instead.
async function* cacheReplayStream(resultJson: unknown): AsyncGenerator<SseEvent> {
  const parsed = AnalysisResultSchema.safeParse(resultJson);
  if (!parsed.success) {
    yield { type: 'error', message: GENERIC_ERROR };
    return;
  }
  yield { type: 'result', result: parsed.data };
}

// ── SSE / JSON plumbing ──────────────────────────────────────────────────────
function sseResponse(events: AsyncGenerator<SseEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
    },
    async cancel() {
      // Client disconnected mid-stream: let the generator release its resources.
      await events.return?.(undefined);
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ type: 'error', message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Client IP for the per-IP demo rate limit. PREFER x-real-ip: it's a
// platform-set single-value header the client cannot spoof. The leftmost
// x-forwarded-for hop is CLIENT-CONTROLLED — an attacker rotates it per request
// to mint a fresh ipHash and bypass demoRunsPerIpPerHour entirely — so it must
// never be the primary source; it's only a local-dev / non-x-real-ip-proxy
// fallback. Missing both, a constant sentinel keeps hashing from throwing and
// fails toward the metered path (one shared rate bucket).
//
// DEPLOY (Phase 7): on Vercel, CONFIRM the trusted client IP header
// (x-real-ip / x-vercel-forwarded-for) before relying on this; the leftmost
// inbound XFF hop is spoofable and must never be the primary source.
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

// sha256(ip + SERVER_SALT). The RAW IP never leaves this function — only the
// hash is passed to lib/db/guard. SERVER_SALT is required (fail loud if unset).
function hashIp(ip: string): string {
  const salt = process.env.SERVER_SALT;
  if (!salt) throw new Error('Missing required env var: SERVER_SALT');
  return createHash('sha256').update(ip + salt).digest('hex');
}

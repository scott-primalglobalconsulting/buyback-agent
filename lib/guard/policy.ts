// Abuse-guard DECISION core — PURE. No React/Next/Supabase/DB imports, no I/O,
// no clock. Every input (counts, cache age, freshness) is passed in; this file
// only decides. The counters/cache themselves live in Postgres behind the
// service role (lib/db/guard.ts). Keeping the interesting logic here makes it
// unit-testable without a database and keeps the cost-bearing precedence rules
// in one auditable place.

export const GUARD_LIMITS = {
  demoRunsPerIpPerHour: 5,
  dailyDemoApiBudget: 200, // max LIVE sample computations per UTC day before the breaker trips
  maxItems: 30,
  maxTaskLen: 500,
  cacheTtlMs: 24 * 60 * 60 * 1000,
} as const;

export type DemoVerdict =
  | { kind: 'serve_cache' } // cache fresh -> stream cached, no API call
  | { kind: 'compute_live' } // allowed to call the API, then cache the result
  | { kind: 'rate_limited' } // per-IP cap hit
  | { kind: 'breaker_serve_cache' } // daily budget spent; must serve cache (or 'unavailable' if none)
  | { kind: 'unavailable' }; // breaker tripped AND no cache to fall back to

// PRECEDENCE (order is load-bearing — do not reorder):
//   1. fresh cache        -> serve_cache
//   2. per-IP cap hit     -> rate_limited
//   3. daily budget spent -> breaker_serve_cache (any cache) | unavailable (none)
//   4. otherwise          -> compute_live
export function decideDemo(input: {
  ipRunsThisHour: number;
  dailyLiveCount: number;
  cacheAgeMs: number | null; // null = no cache row exists
  nowFresh: boolean; // cacheAgeMs != null && cacheAgeMs < cacheTtlMs
}): DemoVerdict {
  // 1. Fresh cache short-circuits BEFORE any rate/budget check. A warm demo is
  // the cheapest possible response (zero API cost) and must never rate-limit a
  // legitimate viewer just because the IP or daily counters happen to be high.
  if (input.nowFresh) {
    return { kind: 'serve_cache' };
  }

  // 2. No/stale cache, and this IP has hit its hourly cap. Use >= so the cap
  // value itself counts as "hit" (ipRunsThisHour === demoRunsPerIpPerHour is
  // already the 6th attempt in spirit — the cap is exclusive of further runs).
  if (input.ipRunsThisHour >= GUARD_LIMITS.demoRunsPerIpPerHour) {
    return { kind: 'rate_limited' };
  }

  // 3. No/stale cache, and the day's LIVE API budget is spent (>= so reaching
  // the budget trips the breaker; we do not compute the (budget+1)th call).
  // Prefer a stale sample over bleeding the API — a slightly old sample beats a
  // real API charge. Only when there is NO cache row at all do we go dark.
  if (input.dailyLiveCount >= GUARD_LIMITS.dailyDemoApiBudget) {
    return input.cacheAgeMs !== null
      ? { kind: 'breaker_serve_cache' }
      : { kind: 'unavailable' };
  }

  // 4. Under every cap with no fresh cache — safe to spend one live computation.
  return { kind: 'compute_live' };
}

// Edge payload validation for AUTHENTICATED analyze/sop input. Bounds the work
// (and thus the token cost) an authenticated caller can request in one shot.
export function validatePayloadSize(
  items: { task: string }[],
): { ok: true } | { ok: false; reason: string } {
  if (items.length > GUARD_LIMITS.maxItems) {
    return {
      ok: false,
      reason: `Too many items: ${items.length} exceeds the ${GUARD_LIMITS.maxItems}-item limit.`,
    };
  }
  for (const item of items) {
    if (item.task.length > GUARD_LIMITS.maxTaskLen) {
      return {
        ok: false,
        reason: `Task too long: ${item.task.length} characters exceeds the ${GUARD_LIMITS.maxTaskLen}-character limit.`,
      };
    }
  }
  return { ok: true };
}

// Abuse-guard counters + cache I/O. SERVER-ONLY, and the ONLY guard file that
// touches Supabase. Every call here uses the RLS-EXEMPT service-role client
// (createServiceRoleClient) because the demo_* tables are deny-all under RLS
// (0003) — no anon/authenticated role can read or write them. The pure
// decision logic that consumes these numbers lives in lib/guard/policy.ts.
//
// IP PRIVACY: this module never sees a raw IP. The route hashes the client IP
// (SHA-256 of IP + SERVER_SALT) and passes the resulting `ipHash` to
// incrDemoRate. Raw IPs never reach lib/db.
import 'server-only';
import { createServiceRoleClient } from './client';

// Read the shared 'sample' cache row. Returns the stored result plus its age in
// ms (measured against now), or null when no cache row exists yet. The caller
// (policy.decideDemo) decides freshness from ageMs vs GUARD_LIMITS.cacheTtlMs.
export async function getSampleCache(): Promise<{ resultJson: unknown; ageMs: number } | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('demo_cache')
    .select('result_json, updated_at')
    .eq('id', 'sample')
    .maybeSingle();
  if (error) throw new Error(`getSampleCache failed: ${error.message}`);
  if (!data) return null;
  const ageMs = Date.now() - new Date(data.updated_at as string).getTime();
  return { resultJson: data.result_json, ageMs };
}

// Upsert the shared 'sample' cache row and stamp updated_at = now(). Called
// after a compute_live run so the next viewer can be served from cache.
export async function putSampleCache(result: unknown): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('demo_cache')
    .upsert({ id: 'sample', result_json: result, updated_at: new Date().toISOString() });
  if (error) throw new Error(`putSampleCache failed: ${error.message}`);
}

// Atomically increment this IP-hash's count for the current hour and return the
// new count. Delegates to the incr_demo_rate RPC (0003) so the increment is a
// single atomic INSERT ... ON CONFLICT DO UPDATE — NOT a read-then-write in JS,
// which would race under concurrent /demo requests and undercount, letting the
// per-IP cap be bypassed. window_start (the hour bucket) is derived inside the
// function from now(), so a client cannot forge or spread across buckets.
export async function incrDemoRate(ipHash: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('incr_demo_rate', { p_ip_hash: ipHash });
  if (error) throw new Error(`incrDemoRate failed: ${error.message}`);
  return data as number;
}

// Read today's (UTC) live-computation count for the circuit-breaker. Returns 0
// when no row exists for today yet. Read-only, so no atomicity concern here —
// the atomic path is incrDailyLiveCount.
export async function getDailyLiveCount(): Promise<number> {
  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const { data, error } = await supabase
    .from('demo_budget')
    .select('live_count')
    .eq('day', today)
    .maybeSingle();
  if (error) throw new Error(`getDailyLiveCount failed: ${error.message}`);
  return data ? (data.live_count as number) : 0;
}

// Atomically increment today's (UTC) live-computation count and return the new
// count. Delegates to the incr_daily_live_count RPC (0003) for the same
// race-free reason as incrDemoRate: a JS read-then-write could let two
// concurrent requests both spend "the last" budgeted call. The route MUST call
// this on every compute_live BEFORE (or transactionally with) the API call so
// the breaker is never bypassed by uncounted computations. Returning the
// post-increment count lets the route enforce the breaker on this exact value
// (increment-then-check) instead of the racy read-then-increment, closing the
// budget-boundary overshoot window under concurrency.
export async function incrDailyLiveCount(): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('incr_daily_live_count');
  if (error) throw new Error(`incrDailyLiveCount failed: ${error.message}`);
  return data as number;
}

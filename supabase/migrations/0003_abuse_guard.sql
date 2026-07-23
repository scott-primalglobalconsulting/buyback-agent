-- 0003_abuse_guard.sql
-- Abuse-guard counters + cache for the COST-BEARING anonymous /demo path.
--
-- These three tables back the runtime rate limit, daily API circuit-breaker,
-- and sample cache decided by lib/guard/policy.ts. They hold NO user data:
--   demo_cache  — the single shared sample result (id = 'sample').
--   demo_rate   — per-IP-hash hourly run counts (raw IP is NEVER stored; the
--                 route hashes IP + server salt before it reaches the DB).
--   demo_budget — per-UTC-day count of LIVE sample computations.
--
-- SECURITY MODEL (deny-all): RLS is enabled on all three tables and NO policies
-- are created for anon or authenticated. With RLS on and no permissive policy,
-- Postgres denies every row to those roles. Only the service-role key — which
-- is RLS-EXEMPT and lives server-side in lib/db/guard.ts — can read or write
-- them. Consequence: a browser or logged-in user can neither read these
-- counters (no scraping the current budget/rate to time an attack) nor write
-- them (no forging cache or zeroing the breaker). This is deliberate; do not
-- add anon/authenticated policies here.

-- Shared sample cache. Single row keyed 'sample'; putSampleCache upserts it.
create table demo_cache (
  id text primary key default 'sample',
  result_json jsonb,
  updated_at timestamptz not null default now()
);

-- Per-IP-hash hourly run counter. Bucketed by window_start = date_trunc('hour',
-- now()); the composite PK lets incrDemoRate upsert-increment atomically.
create table demo_rate (
  ip_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (ip_hash, window_start)
);

-- Per-UTC-day count of LIVE sample computations (the circuit-breaker budget).
create table demo_budget (
  day date primary key,
  live_count int not null default 0
);

-- Deny-all: enable RLS, create no policies -> only the service role reaches
-- these rows. (See SECURITY MODEL header above.)
alter table public.demo_cache  enable row level security;
alter table public.demo_rate   enable row level security;
alter table public.demo_budget enable row level security;

-- ---------------------------------------------------------------------------
-- Atomic increment RPCs.
--   supabase-js .upsert() cannot express `count = count + 1` (it replaces the
--   provided columns; it cannot reference the existing row value), so doing the
--   increment in JS would be read-then-write and RACE under concurrent /demo
--   requests — two requests could each read N and both write N+1, undercounting
--   and letting the rate limit / breaker be bypassed. These functions push the
--   increment into a single INSERT ... ON CONFLICT DO UPDATE statement, which
--   Postgres executes atomically (the conflicting row is locked for the UPDATE),
--   so the returned count is exact regardless of concurrency.
--
--   Empty search_path + fully-qualified names: same injection-hardening as the
--   0002 helpers. Callers reach these only via the RLS-exempt service role, so
--   no SECURITY DEFINER is needed.
-- ---------------------------------------------------------------------------

-- Increment this IP-hash's count for the CURRENT hour bucket and return the new
-- count. window_start is derived server-side from now() so the client cannot
-- forge a bucket. First run in a bucket inserts count = 1.
create function public.incr_demo_rate(p_ip_hash text)
  returns int
  language sql
  set search_path = ''
as $$
  insert into public.demo_rate (ip_hash, window_start, count)
  values (p_ip_hash, date_trunc('hour', now()), 1)
  on conflict (ip_hash, window_start)
    do update set count = public.demo_rate.count + 1
  returning count;
$$;

-- Increment today's (UTC) live-computation count and return the new value.
-- day is derived server-side from now() at UTC. First call of the day inserts
-- live_count = 1.
create function public.incr_daily_live_count()
  returns int
  language sql
  set search_path = ''
as $$
  insert into public.demo_budget (day, live_count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day)
    do update set live_count = public.demo_budget.live_count + 1
  returning live_count;
$$;

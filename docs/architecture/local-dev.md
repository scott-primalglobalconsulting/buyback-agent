# Local Development

Last updated: 2026-07-23 13:05 MST

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Environment variables

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Server-side only. Never exposed to the client bundle. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key, RLS-scoped. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only. Bypasses RLS — used solely by `lib/db/guard.ts` for the deny-all abuse-guard tables. Never sent to the client. |
| `SERVER_SALT` | Server-side only. Salts the per-IP hash (`sha256(ip + SERVER_SALT)`) used by the demo rate limiter so raw IPs are never stored. |

`.env.example` lists all five with no values and is tracked in git.
`.env.local` (or any `.env*.local`) holds real values and is gitignored.

## Supabase local

Provisioned in Phase 4 (Data layer). Once `supabase/migrations/` exists:

```bash
supabase start
supabase db reset      # applies 0001_init.sql, 0002_rls.sql, 0003_abuse_guard.sql
```

`0003_abuse_guard.sql` tables (`demo_cache`, `demo_rate`, `demo_budget`) have
RLS enabled with no anon/authenticated policies — deny-all. Only the
service-role key reads/writes them.

## Seed data

The sample audit used by `/demo` (`SAMPLE_WEEK`) is defined in code
(`lib/agent/prompts.ts` or a fixtures module, finalized in Phase 3), not in a
SQL seed file — the demo path never touches user-owned rows.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | `eslint .` (Next 16 removed `next lint`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` |
| `npm run test:watch` | `vitest` in watch mode |
| `npm run eval` | `tsx evals/run.ts` — calls the live Anthropic API, run manually, not in CI |

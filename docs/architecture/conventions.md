# Conventions

Last updated: 2026-07-23 13:05 MST

## Isolation boundaries (hard rules)

- `lib/agent` and `lib/buyback` never import React, Next, or Supabase. Pure
  input -> validated output. Testable and swappable in isolation.
- `lib/db` is the only module that touches Supabase.
- Routes and components never call the Anthropic API or the Supabase client
  directly — they consume `lib/agent` and `lib/db`.

A reviewer should be able to understand any one unit without reading another.

## Pre-implementation checklist (every task)

1. Which layer owns this? (`lib/agent` / `lib/buyback` / `lib/guard` / `lib/db`
   / route / component) — confirm before writing code.
2. Does it cross an isolation boundary? If so, stop — it belongs in `lib/db`
   or needs to go through an existing public surface (`lib/agent/index.ts`,
   `lib/buyback/index.ts`).
3. Is there a Zod schema at the edge (LLM output, user input)? Internal calls
   are trusted; edges are validated.
4. Does a migration touch RLS? Any change to `supabase/migrations/*rls*` gets
   a written cross-workspace isolation check in this doc before merge.

## TDD discipline

- `lib/buyback` math and `lib/agent/schema` validation: write the failing
  test first, implementation second, same commit.
- No dead code, no commented-out blocks, no speculative abstractions, no
  "just in case" parameters. A helper used once is inlined.
- Comments explain WHY, not WHAT — no narration comments. Comment the
  non-obvious: why a DRIP boundary sits where it does, why LLM output is
  validated-then-retried, why an RLS policy is structured a given way.
- TS strict. Zod schemas are the single source of truth for the LLM contract;
  TS types are `z.infer`, never hand-maintained in parallel.

## Commits

Conventional commits, one logical change each. Stage files explicitly —
never `git add -A` / `git add .`.

## CI vs evals

CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test` on every
push to `main` and on pull requests. `npm run eval` is **not** in CI — it
calls the live Anthropic API and costs money. Evals run locally/on-demand;
results are asserted manually at the Phase 3 gate.

## Done means

- `npm run lint`, `npm run typecheck`, `npm test` all green.
- Any migration touching RLS has a written cross-workspace isolation check
  in `docs/architecture/migrations.md`.
- No claim of "green" without reading the actual command output. Read it;
  do not infer it from an exit code you did not see.

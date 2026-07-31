# Buyback Agent

Last updated: 2026-07-31 13:24 -0500

Working notes for anyone (human or agent) making changes here. Conventions and
gates live in `docs/architecture/`; the per-task history is `docs/CHANGELOG.md`.

## Status

Built, deployed, and live at https://buyback-agent.vercel.app. An AI micro-SaaS
operationalizing Dan Martell's Buyback Loop (Audit -> Transfer -> Fill): founder
enters a week's tasks, an engineered LLM agent scores each into DRIP quadrants +
value tiers + keep/delegate/eliminate, computes a buyback rate, recommends the
first hire, and generates delegation SOPs. Independent demo — not affiliated
with or endorsed by Martell Group or Dan Martell.

Full spec: `docs/specs/2026-07-23-buyback-agent-design.md`.
Build plan: `docs/plans/2026-07-23-buyback-agent.md`.

## Stack

Next.js 16 (App Router) + TypeScript strict, Tailwind CSS, Zod,
`@anthropic-ai/sdk`, `@supabase/supabase-js` + `@supabase/ssr`, Vitest,
GitHub Actions. Deployed on Vercel; Supabase for Postgres/Auth/RLS.
Runtime LLM: `claude-sonnet-5`. Re-confirm the model id/API surface via the
`claude-api` skill before writing any Anthropic call.

## Isolation boundaries (hard rules)

- `lib/agent` and `lib/buyback` never import React, Next, or Supabase.
- `lib/db` is the only module that touches Supabase.
- Routes/components never call the Anthropic API or the Supabase client
  directly — they consume `lib/agent` and `lib/db`.

## Commands

```bash
npm run dev         # start dev server
npm run build       # production build
npm run lint        # eslint . (Next 16 removed `next lint`)
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run validate:palette  # contrast + colour-vision gate on app/globals.css
npm run eval        # tsx evals/run.ts — calls the live Anthropic API, not in CI
```

## Do not touch without review

- Any `supabase/migrations/*` file that touches RLS — every such change
  requires a written cross-workspace isolation check in
  `docs/architecture/migrations.md` before merge.
- `lib/guard/` (abuse-guard policy) — the anonymous `/demo` and
  `/api/analyze` paths are cost-bearing; changes need the full rate-limit /
  circuit-breaker / payload-cap reasoning re-verified, not just tests green.

## Done means

- `npm run lint`, `npm run typecheck`, `npm test` all green — read the
  actual output, don't assume.
- For any RLS-touching migration: cross-workspace isolation verified and
  documented in `docs/architecture/migrations.md`.
- Conventional commits, one logical change each, files staged explicitly
  (never `git add -A` / `git add .`).

## Supporting Documents

- `docs/architecture/file-map.md` — target file structure, what exists now
  vs. later phases.
- `docs/architecture/conventions.md` — isolation rules, pre-implementation
  checklist, TDD discipline.
- `docs/architecture/local-dev.md` — env vars, local setup, Supabase local,
  seed data.
- `docs/architecture/migrations.md` — migration catalog + RLS isolation
  checks.
- `docs/architecture/design-system.md` — Phase 5 UI source of truth: color
  tokens (both themes), type pairing, DRIP/viz treatments, state inventory.
- `docs/CHANGELOG.md` — per-task changelog.

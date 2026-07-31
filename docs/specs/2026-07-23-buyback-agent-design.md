# Buyback Agent — Design Spec

Last updated: 2026-07-23 12:05 MST

## Purpose

A small, genuinely working AI micro-SaaS that operationalizes Dan Martell's **Buyback Loop**
(Audit → Transfer → Fill). Built as a demonstration asset for Scott Steele's application to the
Martell Group "AI Tech Leader" role. It must stand on its own as a clean, deployed, credible product
that proves one thing: *this person can take a validated concept and ship a scalable AI SaaS, solo,
fast, with AI tooling* — the exact motion the job describes.

**Positioning:** an independent, respectful homage that turns a human time-audit coaching service
into software (the studio's concierge-to-software thesis). A visible disclaimer states it is an
independent demo, not affiliated with or endorsed by Martell Group or Dan Martell.

## Success criteria

- A reviewer opens the live URL, clicks "Try with sample data," and within ~10 seconds sees a real,
  useful audit: tasks scored, bucketed, and a delegation SOP generated. No signup required to see value.
- The public GitHub repo reads as a codebase "another engineer could pick up in a week": clear README
  with the build story and velocity, an architecture doc, typed boundaries, tests, and green CI.
- The LLM layer is demonstrably engineered, not prompt-and-pray: structured tool-use, schema-validated
  outputs, retries, and an eval harness.

## What it does (user-facing)

1. **Audit (the input):** a founder enters their week's tasks. Each row: task description, hours/week,
   rough cost-to-delegate ($/hr). A "Try with sample data" button preloads a realistic founder's week.
2. **Analyze (the agent):** for each task the agent returns a **dollar-value tier**, a **DRIP quadrant**
   (Delegate / Replace / Invest / Produce), a **keep / delegate / eliminate** recommendation, and a
   short rationale. Output streams in.
3. **Dashboard (the payoff):** time allocation by DRIP quadrant (visualized), a computed **buyback rate**
   (share of hours in low-value vs high-value work), and the **top tasks to offload**.
4. **Replacement Ladder:** from the audit, the agent recommends the **first role to hire** (admin →
   delivery → marketing → sales → leadership) with a one-line justification. (Second Martell framework.)
5. **Transfer (the wow):** one click generates a structured **delegation SOP** for any delegate-task
   (purpose, steps, definition-of-done, tools/access needed), exportable as markdown.
6. **Persistence & history:** audits are saved per workspace; a workspace owner can invite a teammate.
7. **Export:** full audit + SOPs export as a single markdown report.

## Scope discipline (YAGNI)

**In v1:** everything above.
**Explicitly cut, listed as roadmap in the README** (to signal "build only what customers paid for"):
calendar/OAuth integration, Stripe billing, native mobile, real-time multiplayer editing,
buyback-rate trend-over-time analytics.

## Architecture

Next.js 16 (App Router) + TypeScript (strict). Supabase (Postgres, Auth, Row-Level Security) for
multi-tenant data. Tailwind for UI. Anthropic API for the agent. Deployed on Vercel.

```
buyback-agent/
  app/                      # routes: landing, /app (auth'd), /app/audit/[id], /demo
  lib/
    agent/                  # the isolated agent module (no React, no Next imports)
      schema.ts             # Zod schemas for analysis + SOP (the LLM contract)
      analyze.ts            # analyzeAudit(items) -> scored items + summary + ladder
      sop.ts                # generateSOP(item, context) -> structured SOP
      prompts.ts            # system prompts, framework definitions
      client.ts             # Anthropic client wrapper: structured tool-use + retry
    db/                     # typed Supabase queries, RLS-aware
    buyback/                # pure domain logic: buyback-rate math, quadrant rollups
  supabase/migrations/      # schema + RLS policies
  evals/                    # agent eval harness + task fixtures
  __tests__/                # unit tests (domain math, schema validation)
  docs/                     # ARCHITECTURE.md, this spec
  .github/workflows/ci.yml  # lint + typecheck + test on push
  README.md  LICENSE  .env.example
```

**Isolation boundaries (each unit has one job):**
- `lib/agent` knows nothing about React, routes, or the database. Input: plain task objects. Output:
  validated typed results. Testable and swappable in isolation.
- `lib/buyback` is pure functions (buyback-rate, quadrant hour rollups). Fully unit-tested, no I/O.
- `lib/db` is the only place that touches Supabase.
- Routes/components consume these; they never call the Anthropic API directly.

## Data model (all RLS-scoped to workspace membership)

- `workspaces` (id, name, owner_id, created_at)
- `workspace_members` (workspace_id, user_id, role: owner|member)
- `audits` (id, workspace_id, created_by, title, created_at)
- `audit_items` (id, audit_id, task, hours_per_week, cost_to_delegate, value_tier, drip_quadrant,
  recommendation, rationale)
- `sops` (id, audit_item_id, content_md, created_at)

RLS: a row is visible/writable only if the requesting user is a member of the owning workspace.
Policies live in the migrations and are covered by a written RLS test note in ARCHITECTURE.md.

## The agent (engineered, not prompted)

- **Model:** `claude-sonnet-5` — near-Opus quality on structured analysis/generation at a fraction of
  the cost, appropriate for a public demo. Adaptive thinking on; stream the analyze step. (Re-confirm the
  id and current API surface via the `claude-api` skill at build time before writing any Anthropic call.)
  API key via env, never committed. The build itself is done on Opus 4.8 (the coding agent), a separate
  choice from this runtime model.
- **Structured output:** each operation defines a JSON schema; the model is forced to return via a
  tool call; the response is parsed and **validated with Zod**; invalid responses trigger one retry
  with the validation error fed back. This is the reliability pattern that separates an engineer from
  a hobbyist and is called out in the README.
- **Two operations:**
  - `analyzeAudit(items)` → per-item scoring + a summary object + replacement-ladder recommendation.
  - `generateSOP(item, workspaceContext)` → a structured SOP object.
- **Streaming:** the analyze step streams to the UI for a live feel.
- **Framework fidelity:** prompts encode the DRIP definitions, the $10/hr–$10K/hr value ladder, and the
  Replacement Ladder order, so outputs are faithful to the book, not generic productivity advice.

## Testing & quality (the "I set the engineering bar" signal)

- **Unit tests (Vitest):** `lib/buyback` math and `lib/agent/schema` validation. Deterministic, no API.
- **Eval harness (`evals/`):** a set of fixture tasks with expected quadrant/recommendation ranges
  (e.g., "reconcile bank statements, 5h/wk, low delegate cost" → Delegate; "close enterprise deals" →
  Produce/keep). Asserts output *structure* always, and *sanity* on the fixtures. Runnable via
  `npm run eval`. Demonstrates that AI output is tested, not trusted blindly — rare and senior.
- **CI:** GitHub Actions runs lint + typecheck + unit tests on every push. Green badge in the README.
  (Evals run locally/on-demand since they call the API; documented as such.)

## README plan (this is what the reviewer actually reads first)

1. One-line what-it-is + the disclaimer.
2. **Live demo** link + a 20-second "try the sample" path.
3. **The motion:** concierge time-audit service → software; how it maps to the Buyback Loop and DRIP.
4. **Built solo in ~[ACTUAL] hours with AI tooling** — the velocity claim, honest to real build time.
5. Architecture at a glance (the isolation boundaries) + link to ARCHITECTURE.md.
6. The engineering choices that matter: structured tool-use + Zod validation + eval harness + RLS.
7. Run-it-locally in 3 commands; env.example; roadmap (the cut list, framed as intentional).

## Engineering quality bar (non-negotiable — this is the whole point)

The repo has to read like a senior engineer built it deliberately. Enforce all of these:

- **Test-driven.** Use the test-driven-development skill: for the domain logic (`lib/buyback` math,
  `lib/agent/schema` validation) and the agent contract, write the failing test first, then the
  implementation. Tests are committed in the same change as the code they cover, never bolted on later.
- **No fluff code.** No dead code, no commented-out blocks, no speculative abstractions, no "just in case"
  parameters, no defensive handling for states that cannot occur. Every file, function, and dependency
  earns its place. If a helper is used once, inline it. YAGNI, ruthlessly.
- **Comments explain WHY, not WHAT.** No narration comments (`// loop over items`). Comment the non-obvious:
  why a DRIP boundary is drawn where it is, why the LLM output is validated-then-retried, why RLS is
  structured this way. Type signatures and clear names carry the "what."
- **Typed boundaries.** TS strict. Zod schemas are the single source of truth for the LLM contract and are
  inferred into TS types — no hand-maintained parallel interfaces. Validate at system edges (LLM output,
  user input); trust internal calls.
- **Isolation.** The boundaries in the Architecture section are hard rules: `lib/agent` and `lib/buyback`
  never import React/Next/Supabase; only `lib/db` touches Supabase. A reviewer can understand any unit
  without reading another.
- **Green on every commit.** Lint, typecheck, and unit tests pass at each committed step. CI enforces it.
- **Conventional commits, one logical change each.** The git history itself should read as a clean,
  intentional build — a reviewer will skim it.

## Build phases (each ends at a verification gate — do not proceed past a red gate)

The build session runs the writing-plans skill to turn this into a step plan, then executes phase by
phase. Every phase ends by running the stated check and confirming green before the next begins.

1. **Scaffold + CI.** Next.js 16 + TS strict + Tailwind + Vitest + GitHub Actions. Gate: `lint`,
   `typecheck`, and an empty `test` run all green; CI passes on first push.
2. **Domain core (TDD).** `lib/buyback` (buyback-rate, DRIP rollups) and `lib/agent/schema` (Zod). Tests
   first. Gate: unit tests green, 100% of the pure domain logic covered.
3. **Agent layer (TDD + evals).** `lib/agent` analyze + SOP, structured tool-use with validate-and-retry;
   `evals/` fixtures. Gate: schema/parse unit tests green; `npm run eval` passes the fixture sanity checks.
4. **Data layer.** Supabase migrations + RLS policies + `lib/db`. Gate: migrations apply cleanly; a written
   RLS check in ARCHITECTURE.md demonstrates cross-workspace isolation.
5. **UI + streaming.** Landing, auth, audit entry, streaming analysis, dashboard, Replacement Ladder, SOP
   view/export, demo mode. Gate: the full sample-data path works locally end to end.
6. **Docs + polish.** README (with the real build-hours figure), ARCHITECTURE.md, env.example, LICENSE,
   disclaimer. Gate: a cold `git clone` + README steps brings the app up on another machine.
7. **Deploy + verify.** Below. Gate: live URL runs the sample path end to end.

Use verification-before-completion at each gate: run the command, read the output, then claim green.
No "should pass" — evidence only.

## Deploy plan (done together, step by step)

Scott authorizes each account connection as we reach it:
1. Create public GitHub repo `scott-primalglobalconsulting/buyback-agent`, push.
2. Supabase project: run migrations, capture URL + anon/service keys.
3. Vercel: import repo, set env (Supabase keys, Anthropic key), deploy.
4. Verify the live sample-data path end to end.
5. Add a profile README repo so the GitHub profile is not empty; pin `buyback-agent`.

## Out of scope for this spec

The rest of the application package (tailored resume, the five Greenhouse answers, the Loom script)
is content produced in `job-application-workbench/applications/martell-ai-tech-leader/` during
execution. This spec governs the app only.

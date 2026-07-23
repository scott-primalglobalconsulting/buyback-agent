# Buyback Agent Implementation Plan

Last updated: 2026-07-23 12:15 EST

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every phase ends at a **verification gate** — run the stated command, read the output, confirm green (superpowers:verification-before-completion), then STOP for operator review before starting the next phase.

**Goal:** Ship a deployed, credible AI micro-SaaS that operationalizes Dan Martell's Buyback Loop (Audit → Transfer → Fill): a founder enters their week's tasks, an engineered LLM agent scores each into DRIP quadrants + value tiers + keep/delegate/eliminate, computes a buyback rate, recommends the first hire, and generates delegation SOPs — all exportable, multi-tenant, and covered by tests + evals + CI.

**Architecture:** Next.js 16 App Router + TypeScript strict. Three hard-isolated library boundaries: `lib/agent` (Anthropic calls, Zod-validated structured tool-use, zero React/Next/Supabase imports), `lib/buyback` (pure domain math, zero I/O), `lib/db` (the only place that touches Supabase; RLS-enforced). Routes/components consume these and never call Anthropic or Supabase directly. Runtime LLM is `claude-sonnet-5` with adaptive thinking; the analyze step streams. Deployed on Vercel with Supabase Postgres/Auth/RLS.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Tailwind CSS, Zod, `@anthropic-ai/sdk`, `@supabase/supabase-js` + `@supabase/ssr`, Vitest, GitHub Actions.

## Global Constraints

Copied verbatim from the spec; every task's requirements implicitly include this section.

- **Runtime model:** `claude-sonnet-5` (explicitly chosen by the operator for this app; adaptive thinking on, analyze step streams). The build coding agent is Opus 4.8 — a separate choice. Re-confirm the id/API surface via the `claude-api` skill before writing any Anthropic call.
- **Anthropic reliability pattern (non-negotiable):** each agent operation defines a JSON schema; the model is **forced to return via a tool call** (`tool_choice: {type:"tool", name:...}`); the response is parsed and **validated with Zod**; an invalid response triggers **exactly one retry** with the validation error fed back into the messages; a second failure throws a typed error.
- **Zod is the single source of truth** for every LLM contract; TS types are `z.infer` of the schema. No hand-maintained parallel interfaces.
- **Isolation (hard rules):** `lib/agent` and `lib/buyback` never import React/Next/Supabase. Only `lib/db` touches Supabase. Routes/components never call the Anthropic API or Supabase client directly.
- **TS strict.** Validate at system edges (LLM output, user input) only; trust internal calls.
- **No fluff code.** No dead code, commented-out blocks, speculative abstractions, "just in case" params, or defensive handling for impossible states. A helper used once is inlined. YAGNI, ruthlessly.
- **Comments explain WHY, not WHAT.** No narration comments. Comment only the non-obvious (DRIP boundary rationale, validate-then-retry, RLS structure).
- **TDD.** For `lib/buyback` math, `lib/agent/schema`, and the agent contract: failing test first, then implementation, in the same change.
- **Green on every commit.** `lint`, `typecheck`, unit tests pass at every committed step. CI enforces it.
- **Conventional commits, one logical change each.** Stage files explicitly — never `git add -A`/`git add .`.
- **File header timestamps:** any file carrying `Last updated:` / `Version tag:` gets BOTH bumped to current local `YYYY-MM-DD HH:MM TZ` on edit.
- **No em/en dashes** in public-facing published copy (landing page, README marketing prose, disclaimer). Dashes fine in code/docs/commits.
- **RLS:** every row visible/writable only to members of the owning workspace. Policies live in migrations and are covered by a written RLS check note in ARCHITECTURE.md.
- **Framework fidelity:** prompts encode the DRIP definitions, the $10/hr–$10K/hr value ladder, and the Replacement Ladder order (admin → delivery → marketing → sales → leadership).
- **v1 scope = the full user-facing spec.** Explicitly cut (README roadmap only): calendar/OAuth, Stripe billing, native mobile, real-time multiplayer, trend-over-time analytics. Do not build these.
- **Operator confirmation gates:** confirm before installing dependencies and before connecting any account (GitHub / Supabase / Vercel / Anthropic key).
- **Abuse protection (non-negotiable — the demo endpoint is unauthenticated and cost-bearing):** the anonymous `/demo` path is **sample-locked** (server ignores any client-supplied tasks and only analyzes the server-held `SAMPLE_WEEK`); real arbitrary-input analysis and all SOP generation **require a Supabase session**. The sample analysis is **cached** in Postgres (~24h TTL) so repeat demo hits cost ~$0. Anonymous `/api/analyze` is **per-IP rate-limited** (IP hashed, never stored raw) and guarded by a **global daily circuit breaker** that, once tripped, serves only the cached sample and never calls the API. Both API routes **Zod-validate at the edge with payload caps** (max items, max string length); `max_tokens` stays bounded. Postgres-native — no new accounts or dependencies.

---

## File Structure

```
buyback-agent/
  app/
    layout.tsx, globals.css, page.tsx            # landing (public, disclaimer)
    demo/page.tsx                                # no-auth sample-data path
    app/                                         # auth'd shell
      layout.tsx, page.tsx                       # workspace home / audit list
      audit/[id]/page.tsx                        # audit detail: dashboard, ladder, SOPs
    auth/callback/route.ts                       # Supabase auth callback
    api/
      analyze/route.ts                           # SSE stream: streamAnalyzeAudit -> client
      sop/route.ts                               # generateSOP
      export/[id]/route.ts                       # markdown export
  lib/
    agent/
      schema.ts        # Zod: AnalysisResult, ScoredItem, Summary, Ladder, Sop + inferred types + tool JSON schemas
      prompts.ts       # system prompts + framework definitions (DRIP, value ladder, ladder order)
      client.ts        # Anthropic wrapper: forced tool-use + Zod validate + 1 retry (structuredToolCall)
      analyze.ts       # analyzeAudit(items) + streamAnalyzeAudit(items)
      sop.ts           # generateSOP(item, workspaceContext)
      index.ts         # public surface re-exports
    buyback/
      types.ts         # DripQuadrant, ValueTier, Recommendation unions (domain, not LLM)
      rate.ts          # buybackRate(items)
      rollups.ts       # quadrantHourRollup(items), topTasksToOffload(items)
      index.ts
    guard/
      policy.ts        # PURE abuse-guard decisions (no I/O): rate/budget/cache verdicts from counts; payload caps
      index.ts
    db/
      client.ts        # server + browser Supabase clients (@supabase/ssr)
      audits.ts, workspaces.ts, sops.ts          # typed, RLS-aware queries
      guard.ts         # service-role-only: demo cache read/write, rate counter, daily budget counter
      types.ts         # generated/hand-written DB row types
  supabase/migrations/
    0001_init.sql                                # tables
    0002_rls.sql                                 # RLS policies + membership helper
    0003_abuse_guard.sql                         # demo_cache, demo_rate, demo_budget (service-role only, RLS deny-all)
  evals/
    fixtures.ts        # fixture tasks + expected quadrant/recommendation ranges
    run.ts             # npm run eval harness
  __tests__/
    buyback/rate.test.ts, buyback/rollups.test.ts
    agent/schema.test.ts, agent/client.test.ts, agent/analyze.test.ts
  docs/ARCHITECTURE.md, docs/CHANGELOG.md, docs/architecture/*, this plan, the spec
  .github/workflows/ci.yml
  README.md  LICENSE  .env.example  .gitignore  CLAUDE.md
  package.json  tsconfig.json  vitest.config.ts  next.config.ts  tailwind/postcss config
```

**Interface contract shared across phases** (defined once in Phase 2, consumed everywhere):

```ts
// lib/buyback/types.ts — domain unions (NOT the LLM contract; the LLM schema in Phase 3 reuses these)
export type DripQuadrant = 'Delegate' | 'Replace' | 'Invest' | 'Produce';
export type ValueTier = '$10' | '$100' | '$1000' | '$10000'; // hourly value ladder rung
export type Recommendation = 'keep' | 'delegate' | 'eliminate';

export interface TaskInput {
  task: string;
  hoursPerWeek: number;
  costToDelegate: number; // $/hr
}

export interface ScoredItem extends TaskInput {
  valueTier: ValueTier;
  dripQuadrant: DripQuadrant;
  recommendation: Recommendation;
  rationale: string;
}
```

---

## PHASE 1 — Scaffold + CI

**Deliverable:** A committed, pushed Next.js 16 + TS strict + Tailwind + Vitest project with green `lint`, `typecheck`, empty `test`, and CI passing on first push.

**SOP compliance (new-project-init, SaaS/TS variant):** git already init'd here manually; `.gitignore`, `CLAUDE.md` (< 120 lines, SaaS template, links `~/dev/_shared/CLAUDE.md` and `nextjs-project-conventions.md`), `docs/architecture/{file-map,conventions,local-dev,migrations}.md`, `docs/CHANGELOG.md`, and `.claude/settings.json` with `projectMeta.deployTier: "A"` (public-facing) + CI workflow are all part of this phase.

### Task 1.1: Confirm dependencies, then scaffold Next.js

**Files:** whole project root.

- [ ] **Step 1 (operator gate):** Present the dependency list and get explicit approval before installing anything: runtime — `next@16 react react-dom @anthropic-ai/sdk @supabase/supabase-js @supabase/ssr zod`; dev — `typescript @types/react @types/node @types/react-dom vitest @vitejs/plugin-react vite-tsconfig-paths tailwindcss @tailwindcss/postcss postcss eslint eslint-config-next`. Do NOT proceed to Step 2 until approved.

- [ ] **Step 2:** Scaffold non-interactively into the existing directory:

```bash
npx create-next-app@16 . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --no-turbopack --use-npm --yes
```

If `create-next-app` refuses a non-empty dir, scaffold in a temp dir and copy `app/ package.json tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs` over, preserving existing `docs/`, `.claude/`, and this plan.

- [ ] **Step 3:** Install remaining deps (`@anthropic-ai/sdk @supabase/supabase-js @supabase/ssr zod`; dev: `vitest @vitejs/plugin-react vite-tsconfig-paths`).

- [ ] **Step 4:** Set `tsconfig.json` `compilerOptions.strict: true` (create-next-app default) and confirm `"moduleResolution": "bundler"`, `"paths": {"@/*": ["./*"]}`.

- [ ] **Step 5: Verify** `npx tsc --noEmit` exits 0 and `npm run lint` exits 0. Read output.

- [ ] **Step 6: Commit** (stage explicitly):

```bash
git add package.json package-lock.json tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs app .gitignore
git commit -m "chore: scaffold Next.js 16 + TS strict + Tailwind"
```

### Task 1.2: Wire Vitest with a smoke test

**Files:** Create `vitest.config.ts`, `__tests__/smoke.test.ts`; Modify `package.json` scripts.

- [ ] **Step 1: Write the failing test** `__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2:** Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 3:** Add scripts to `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "eval": "tsx evals/run.ts"
}
```

Add `tsx` as a dev dependency (in the Step 1.1 approval list; add if missed).

- [ ] **Step 4: Verify** `npm test` passes, `npm run typecheck` passes, `npm run lint` passes. Read all three outputs.

- [ ] **Step 5: Commit:**

```bash
git add vitest.config.ts __tests__/smoke.test.ts package.json package-lock.json
git commit -m "test: wire vitest with a smoke test"
```

### Task 1.3: CI workflow + project docs/config

**Files:** Create `.github/workflows/ci.yml`, `.claude/settings.json`, `CLAUDE.md`, `docs/CHANGELOG.md`, `docs/architecture/{file-map,conventions,local-dev,migrations}.md`, `.env.example`.

- [ ] **Step 1:** Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

Note: evals are NOT in CI (they call the paid API) — documented in README and `docs/architecture/conventions.md`.

- [ ] **Step 2:** Create `.env.example` (no real values):

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 3:** Create `.claude/settings.json` with `{"projectMeta": {"deployTier": "A", "stack": "saas"}}` (merge if the file exists).

- [ ] **Step 4:** Write `CLAUDE.md` (< 120 lines): status, stack, commands (`dev/build/lint/typecheck/test/eval`), isolation-boundary rules, `See @~/dev/_shared/CLAUDE.md`, link `~/dev/_shared/sops/nextjs-project-conventions.md`, do-not-touch (migrations without RLS review), done-means (build+types+tests green, RLS verified). Add a `## Supporting Documents` section referencing the `docs/architecture/*` files.

- [ ] **Step 5:** Create `docs/architecture/file-map.md`, `conventions.md` (pre-implementation checklist, isolation rules, TDD discipline), `local-dev.md` (env vars, Supabase local, seed), `migrations.md` (catalog), and `docs/CHANGELOG.md` (first entry: scaffold). Confirm `.gitignore` includes `.env*.local`, `SESSION.md`, `NOTES.md` (do NOT gitignore `.env.example`).

- [ ] **Step 6: Verify** locally `npm run lint && npm run typecheck && npm test` all green.

- [ ] **Step 7: Commit + push, confirm CI green:**

```bash
git add .github/workflows/ci.yml .env.example .claude/settings.json CLAUDE.md docs/
git commit -m "chore: add CI, project config, and architecture docs"
```
Push happens at the deploy phase's first task (Phase 7) OR now if the GitHub repo already exists — **operator gate**: pushing requires the remote to exist; if not yet created, defer push to Phase 7.1 and treat "CI green on first push" as a Phase 7 sub-gate. Note this in CHANGELOG.

### ✅ GATE 1
Run `npm run lint`, `npm run typecheck`, `npm test` — all green (read output). If the repo remote exists: `git push` and confirm the CI run is green in Actions. **STOP for operator review.**

---

## PHASE 2 — Domain core (TDD)

**Deliverable:** `lib/buyback` (pure math) and `lib/agent/schema.ts` (Zod contract), each with tests written first, 100% of the pure domain logic covered.

**Domain decisions (rationale to encode as WHY-comments):**
- **Buyback rate** = share of weekly hours in low-value work. Low-value = `Delegate` + `Replace` quadrants (the two the founder should offload); high-value = `Invest` + `Produce`. `buybackRate = lowValueHours / totalHours`, returned as a 0–1 fraction. A higher rate means more hours are reclaimable — the "opportunity" number the dashboard highlights.
- **Value ladder rungs** are discrete strings `'$10' | '$100' | '$1000' | '$10000'` matching Martell's $/hr ladder; storing the rung (not a raw dollar amount) keeps the LLM contract bounded and the UI buckets stable.

### Task 2.1: `lib/buyback` types + buyback-rate math (TDD)

**Files:** Create `lib/buyback/types.ts`, `lib/buyback/rate.ts`, `__tests__/buyback/rate.test.ts`.

**Interfaces produced:** `buybackRate(items: ScoredItem[]): number` (0–1; returns 0 for empty input — an empty audit has no reclaimable hours, not a divide-by-zero).

- [ ] **Step 1:** Create `lib/buyback/types.ts` with the unions + `TaskInput` + `ScoredItem` from the File Structure section above.

- [ ] **Step 2: Write the failing test** `__tests__/buyback/rate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buybackRate } from '@/lib/buyback/rate';
import type { ScoredItem } from '@/lib/buyback/types';

const item = (hours: number, q: ScoredItem['dripQuadrant']): ScoredItem => ({
  task: 't', hoursPerWeek: hours, costToDelegate: 30,
  valueTier: '$100', dripQuadrant: q, recommendation: 'keep', rationale: 'r',
});

describe('buybackRate', () => {
  it('is the fraction of hours in Delegate+Replace', () => {
    const items = [item(5, 'Delegate'), item(5, 'Replace'), item(10, 'Produce')];
    expect(buybackRate(items)).toBeCloseTo(0.5);
  });
  it('is 0 for an empty audit', () => {
    expect(buybackRate([])).toBe(0);
  });
  it('is 0 when all work is high-value', () => {
    expect(buybackRate([item(8, 'Invest'), item(2, 'Produce')])).toBe(0);
  });
  it('is 1 when all work is low-value', () => {
    expect(buybackRate([item(4, 'Delegate'), item(6, 'Replace')])).toBe(1);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run __tests__/buyback/rate.test.ts` — expect FAIL (module not found).

- [ ] **Step 4:** Implement `lib/buyback/rate.ts`:

```ts
import type { ScoredItem, DripQuadrant } from './types';

// Low-value quadrants are the ones the founder should hand off; the buyback
// rate is the share of the week those hours represent — the reclaimable slice.
const LOW_VALUE: ReadonlySet<DripQuadrant> = new Set(['Delegate', 'Replace']);

export function buybackRate(items: ScoredItem[]): number {
  const total = items.reduce((sum, i) => sum + i.hoursPerWeek, 0);
  if (total === 0) return 0;
  const low = items
    .filter((i) => LOW_VALUE.has(i.dripQuadrant))
    .reduce((sum, i) => sum + i.hoursPerWeek, 0);
  return low / total;
}
```

- [ ] **Step 5: Run** the test — expect PASS.

- [ ] **Step 6: Commit:**

```bash
git add lib/buyback/types.ts lib/buyback/rate.ts __tests__/buyback/rate.test.ts
git commit -m "feat: buyback-rate domain math with tests"
```

### Task 2.2: DRIP rollups + top-tasks (TDD)

**Files:** Create `lib/buyback/rollups.ts`, `lib/buyback/index.ts`, `__tests__/buyback/rollups.test.ts`.

**Interfaces produced:**
- `quadrantHourRollup(items: ScoredItem[]): Record<DripQuadrant, number>` — hours summed per quadrant, all four keys always present (0 if absent) so the chart has stable axes.
- `topTasksToOffload(items: ScoredItem[], limit = 3): ScoredItem[]` — `recommendation === 'delegate' || 'eliminate'`, sorted by `hoursPerWeek` desc (most time reclaimed first), capped at `limit`.

- [ ] **Step 1: Write the failing test** `__tests__/buyback/rollups.test.ts` covering: all four quadrant keys present with zeros; hours summed correctly; `topTasksToOffload` excludes `keep`, sorts by hours desc, respects `limit`.

```ts
import { describe, it, expect } from 'vitest';
import { quadrantHourRollup, topTasksToOffload } from '@/lib/buyback/rollups';
import type { ScoredItem } from '@/lib/buyback/types';

const item = (o: Partial<ScoredItem>): ScoredItem => ({
  task: 't', hoursPerWeek: 1, costToDelegate: 30, valueTier: '$100',
  dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'r', ...o,
});

describe('quadrantHourRollup', () => {
  it('always returns all four quadrants, summing hours', () => {
    const r = quadrantHourRollup([
      item({ dripQuadrant: 'Delegate', hoursPerWeek: 3 }),
      item({ dripQuadrant: 'Delegate', hoursPerWeek: 2 }),
      item({ dripQuadrant: 'Produce', hoursPerWeek: 4 }),
    ]);
    expect(r).toEqual({ Delegate: 5, Replace: 0, Invest: 0, Produce: 4 });
  });
});

describe('topTasksToOffload', () => {
  it('excludes keep, sorts by hours desc, respects limit', () => {
    const out = topTasksToOffload([
      item({ task: 'a', recommendation: 'keep', hoursPerWeek: 9 }),
      item({ task: 'b', recommendation: 'delegate', hoursPerWeek: 2 }),
      item({ task: 'c', recommendation: 'eliminate', hoursPerWeek: 6 }),
      item({ task: 'd', recommendation: 'delegate', hoursPerWeek: 4 }),
    ], 2);
    expect(out.map((i) => i.task)).toEqual(['c', 'd']);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3:** Implement `lib/buyback/rollups.ts`:

```ts
import type { ScoredItem, DripQuadrant } from './types';

const QUADRANTS: readonly DripQuadrant[] = ['Delegate', 'Replace', 'Invest', 'Produce'];

export function quadrantHourRollup(items: ScoredItem[]): Record<DripQuadrant, number> {
  const rollup = Object.fromEntries(QUADRANTS.map((q) => [q, 0])) as Record<DripQuadrant, number>;
  for (const i of items) rollup[i.dripQuadrant] += i.hoursPerWeek;
  return rollup;
}

export function topTasksToOffload(items: ScoredItem[], limit = 3): ScoredItem[] {
  return items
    .filter((i) => i.recommendation !== 'keep')
    .sort((a, b) => b.hoursPerWeek - a.hoursPerWeek)
    .slice(0, limit);
}
```

- [ ] **Step 4:** `lib/buyback/index.ts` re-exports `types`, `rate`, `rollups`.

- [ ] **Step 5: Run** tests — expect PASS. Run full suite `npm test`.

- [ ] **Step 6: Commit:**

```bash
git add lib/buyback/rollups.ts lib/buyback/index.ts __tests__/buyback/rollups.test.ts
git commit -m "feat: DRIP quadrant rollups and top-tasks-to-offload with tests"
```

### Task 2.3: Zod LLM contract schemas (TDD)

**Files:** Create `lib/agent/schema.ts`, `__tests__/agent/schema.test.ts`.

**Interfaces produced (imported by Phases 3, 5, 7):**
- `ScoredItemSchema`, `AnalysisSummarySchema`, `ReplacementLadderSchema`, `AnalysisResultSchema`, `SopSchema` (Zod).
- Inferred types `AnalysisResult`, `Sop` via `z.infer`.
- `analysisToolJsonSchema`, `sopToolJsonSchema` — JSON Schemas for the Anthropic tool `input_schema` (the model is forced into these). Keep hand-written and asserted-against-Zod by a test so they cannot drift.

- [ ] **Step 1: Write the failing test** `__tests__/agent/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AnalysisResultSchema, SopSchema } from '@/lib/agent/schema';

describe('AnalysisResultSchema', () => {
  it('accepts a well-formed result', () => {
    const ok = AnalysisResultSchema.safeParse({
      items: [{
        task: 'Reconcile bank statements', hoursPerWeek: 5, costToDelegate: 25,
        valueTier: '$10', dripQuadrant: 'Delegate', recommendation: 'delegate',
        rationale: 'Low-value, easily handed off.',
      }],
      summary: { firstHireRole: 'admin', firstHireJustification: 'Reclaim admin hours.' },
    });
    expect(ok.success).toBe(true);
  });
  it('rejects an out-of-vocabulary quadrant', () => {
    const bad = AnalysisResultSchema.safeParse({
      items: [{ task: 't', hoursPerWeek: 1, costToDelegate: 1, valueTier: '$10',
        dripQuadrant: 'Nope', recommendation: 'keep', rationale: 'r' }],
      summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
    });
    expect(bad.success).toBe(false);
  });
  it('rejects negative hours', () => {
    const bad = AnalysisResultSchema.safeParse({
      items: [{ task: 't', hoursPerWeek: -1, costToDelegate: 1, valueTier: '$10',
        dripQuadrant: 'Delegate', recommendation: 'keep', rationale: 'r' }],
      summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
    });
    expect(bad.success).toBe(false);
  });
});

describe('SopSchema', () => {
  it('requires purpose, steps, definitionOfDone, toolsNeeded', () => {
    const ok = SopSchema.safeParse({
      purpose: 'p', steps: ['a', 'b'], definitionOfDone: 'd', toolsNeeded: ['x'],
    });
    expect(ok.success).toBe(true);
    expect(SopSchema.safeParse({ purpose: 'p' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3:** Implement `lib/agent/schema.ts`. Reuse the domain unions from `lib/buyback/types` for the enums (single source of truth), define Zod, infer types, and hand-write the tool JSON schemas. Replacement Ladder roles are the fixed order `admin | delivery | marketing | sales | leadership`.

```ts
import { z } from 'zod';

export const DRIP_QUADRANTS = ['Delegate', 'Replace', 'Invest', 'Produce'] as const;
export const VALUE_TIERS = ['$10', '$100', '$1000', '$10000'] as const;
export const RECOMMENDATIONS = ['keep', 'delegate', 'eliminate'] as const;
export const HIRE_ROLES = ['admin', 'delivery', 'marketing', 'sales', 'leadership'] as const;

export const ScoredItemSchema = z.object({
  task: z.string().min(1),
  hoursPerWeek: z.number().nonnegative(),
  costToDelegate: z.number().nonnegative(),
  valueTier: z.enum(VALUE_TIERS),
  dripQuadrant: z.enum(DRIP_QUADRANTS),
  recommendation: z.enum(RECOMMENDATIONS),
  rationale: z.string().min(1),
});

export const AnalysisSummarySchema = z.object({
  firstHireRole: z.enum(HIRE_ROLES),
  firstHireJustification: z.string().min(1),
});

export const AnalysisResultSchema = z.object({
  items: z.array(ScoredItemSchema).min(1),
  summary: AnalysisSummarySchema,
});

export const SopSchema = z.object({
  purpose: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  definitionOfDone: z.string().min(1),
  toolsNeeded: z.array(z.string().min(1)),
});

export type ScoredItem = z.infer<typeof ScoredItemSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type Sop = z.infer<typeof SopSchema>;

// Hand-written Anthropic tool input_schemas (the model is forced into these).
// additionalProperties:false + required on every object; a drift test asserts
// these stay in lockstep with the Zod enums above.
export const analysisToolJsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          hoursPerWeek: { type: 'number' },
          costToDelegate: { type: 'number' },
          valueTier: { type: 'string', enum: [...VALUE_TIERS] },
          dripQuadrant: { type: 'string', enum: [...DRIP_QUADRANTS] },
          recommendation: { type: 'string', enum: [...RECOMMENDATIONS] },
          rationale: { type: 'string' },
        },
        required: ['task', 'hoursPerWeek', 'costToDelegate', 'valueTier', 'dripQuadrant', 'recommendation', 'rationale'],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'object',
      properties: {
        firstHireRole: { type: 'string', enum: [...HIRE_ROLES] },
        firstHireJustification: { type: 'string' },
      },
      required: ['firstHireRole', 'firstHireJustification'],
      additionalProperties: false,
    },
  },
  required: ['items', 'summary'],
  additionalProperties: false,
} as const;

export const sopToolJsonSchema = {
  type: 'object',
  properties: {
    purpose: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    definitionOfDone: { type: 'string' },
    toolsNeeded: { type: 'array', items: { type: 'string' } },
  },
  required: ['purpose', 'steps', 'definitionOfDone', 'toolsNeeded'],
  additionalProperties: false,
} as const;
```

- [ ] **Step 4: Add a drift test** to `schema.test.ts` asserting `analysisToolJsonSchema.properties.items.items.properties.dripQuadrant.enum` deep-equals `[...DRIP_QUADRANTS]` (and the same for value tiers, recommendations, hire roles) so the JSON schema can't silently diverge from Zod.

- [ ] **Step 5: Run** `npm test` — expect PASS.

- [ ] **Step 6: Commit:**

```bash
git add lib/agent/schema.ts __tests__/agent/schema.test.ts
git commit -m "feat: Zod LLM contract schemas with tool JSON schema drift test"
```

### ✅ GATE 2
`npm test` green; `npm run typecheck` green. Confirm every function in `lib/buyback` and every schema in `lib/agent/schema` is exercised by a test. **STOP for operator review.**

---

## PHASE 3 — Agent layer (TDD + evals)

**Deliverable:** `lib/agent` — `client.ts` (forced tool-use + Zod validate + one retry), `analyze.ts` (`analyzeAudit` + `streamAnalyzeAudit`), `sop.ts`, `prompts.ts`; `evals/` fixtures + `npm run eval`. Load the `claude-api` skill before writing any Anthropic call (already loaded this session — re-confirm model id `claude-sonnet-5` and the forced-tool-use + streaming surface).

**Streaming design decision (documented, not fake):** `analyzeAudit` makes ONE structured call so `summary` + Replacement Ladder see all items; it is non-streaming and is what tests/evals hit. `streamAnalyzeAudit` runs the same call via `client.messages.stream()` with `thinking: {type: 'adaptive', display: 'summarized'}`, yields the model's summarized-thinking text deltas as genuine live "analyzing…" progress, then yields the final Zod-validated `AnalysisResult`. The route (Phase 5) forwards these as SSE. No artificial delays, no fabricated streaming.

### Task 3.1: Structured tool-call wrapper with validate-and-retry (TDD)

**Files:** Create `lib/agent/client.ts`, `__tests__/agent/client.test.ts`.

**Interfaces produced:**
```ts
// A minimal seam so tests can inject a fake Anthropic without hitting the network.
export interface ToolCaller {
  // Returns the parsed tool_use.input for the single forced tool call.
  call(args: { system: string; messages: AnthropicMessage[]; toolName: string;
    toolSchema: object; }): Promise<unknown>;
}
export function createAnthropicToolCaller(model = 'claude-sonnet-5'): ToolCaller;
export async function structuredToolCall<T>(opts: {
  caller: ToolCaller; system: string; userContent: string;
  toolName: string; toolSchema: object; validate: (raw: unknown) => T;
}): Promise<T>; // validates; on failure retries ONCE with the zod error appended; else throws StructuredCallError
export class StructuredCallError extends Error {}
```

The retry rationale (WHY-comment): a schema-invalid tool response is the one recoverable LLM failure mode — feeding the exact validation error back once reliably fixes it; a second failure is a real bug, so we throw rather than loop.

- [ ] **Step 1: Write the failing test** `__tests__/agent/client.test.ts` using a fake `ToolCaller`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { structuredToolCall, StructuredCallError } from '@/lib/agent/client';
import { AnalysisResultSchema, analysisToolJsonSchema } from '@/lib/agent/schema';

const valid = {
  items: [{ task: 't', hoursPerWeek: 1, costToDelegate: 1, valueTier: '$10',
    dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'r' }],
  summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
};

const run = (caller: { call: ReturnType<typeof vi.fn> }) =>
  structuredToolCall({
    caller: caller as never, system: 's', userContent: 'u',
    toolName: 'submit_analysis', toolSchema: analysisToolJsonSchema,
    validate: (raw) => AnalysisResultSchema.parse(raw),
  });

describe('structuredToolCall', () => {
  it('returns validated output on first success', async () => {
    const caller = { call: vi.fn().mockResolvedValueOnce(valid) };
    expect(await run(caller)).toEqual(valid);
    expect(caller.call).toHaveBeenCalledTimes(1);
  });
  it('retries exactly once when the first response is invalid, then succeeds', async () => {
    const caller = { call: vi.fn()
      .mockResolvedValueOnce({ items: [], summary: {} }) // invalid
      .mockResolvedValueOnce(valid) };
    expect(await run(caller)).toEqual(valid);
    expect(caller.call).toHaveBeenCalledTimes(2);
    // second call must include the validation error as feedback
    const secondMessages = caller.call.mock.calls[1][0].messages;
    expect(JSON.stringify(secondMessages)).toContain('valid');
  });
  it('throws StructuredCallError after a second invalid response', async () => {
    const caller = { call: vi.fn()
      .mockResolvedValueOnce({ bad: 1 }).mockResolvedValueOnce({ bad: 2 }) };
    await expect(run(caller)).rejects.toBeInstanceOf(StructuredCallError);
    expect(caller.call).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3:** Implement `lib/agent/client.ts`. `structuredToolCall` builds the messages, calls, validates; on a thrown validation error appends an assistant/user feedback turn quoting the error and retries once; on a second failure throws `StructuredCallError`. `createAnthropicToolCaller` wraps `@anthropic-ai/sdk`:

```ts
import Anthropic from '@anthropic-ai/sdk';

export type AnthropicMessage = { role: 'user' | 'assistant'; content: string };
export class StructuredCallError extends Error {}

export interface ToolCaller {
  call(args: { system: string; messages: AnthropicMessage[]; toolName: string;
    toolSchema: object }): Promise<unknown>;
}

export function createAnthropicToolCaller(model = 'claude-sonnet-5'): ToolCaller {
  const client = new Anthropic();
  return {
    async call({ system, messages, toolName, toolSchema }) {
      const res = await client.messages.create({
        model, max_tokens: 4096,
        thinking: { type: 'adaptive' },
        system,
        tools: [{ name: toolName, description: `Submit the ${toolName} result.`, input_schema: toolSchema as never }],
        tool_choice: { type: 'tool', name: toolName }, // force the structured tool call
        messages,
      });
      const block = res.content.find((b) => b.type === 'tool_use');
      if (!block || block.type !== 'tool_use') throw new StructuredCallError('model returned no tool_use block');
      return block.input; // parse+validate happens in structuredToolCall
    },
  };
}

export async function structuredToolCall<T>(opts: {
  caller: ToolCaller; system: string; userContent: string;
  toolName: string; toolSchema: object; validate: (raw: unknown) => T;
}): Promise<T> {
  const { caller, system, userContent, toolName, toolSchema, validate } = opts;
  const messages: AnthropicMessage[] = [{ role: 'user', content: userContent }];
  const raw = await caller.call({ system, messages, toolName, toolSchema });
  try {
    return validate(raw);
  } catch (err) {
    // One recovery attempt: feed the exact validation failure back. A second
    // failure is a real defect, so we surface it rather than loop.
    const feedback = `Your previous ${toolName} output failed validation: ${String(err)}. Return a corrected, schema-valid tool call.`;
    const retryMessages: AnthropicMessage[] = [
      { role: 'user', content: userContent },
      { role: 'assistant', content: 'Submitting analysis.' },
      { role: 'user', content: feedback },
    ];
    const retried = await caller.call({ system, messages: retryMessages, toolName, toolSchema });
    try {
      return validate(retried);
    } catch (err2) {
      throw new StructuredCallError(`validation failed after retry: ${String(err2)}`);
    }
  }
}
```

Note: keep the fake-`ToolCaller` message shape aligned so the test's `messages[1]` assertion holds (retry path builds `retryMessages`; adjust the test/impl to agree — the retry is the second `caller.call`).

- [ ] **Step 4: Run** the test — expect PASS. (Adjust the retry-message assertion to match the implemented `retryMessages` content, e.g. assert it contains `'failed validation'`.)

- [ ] **Step 5: Commit:**

```bash
git add lib/agent/client.ts __tests__/agent/client.test.ts
git commit -m "feat: structured tool-call wrapper with validate-and-retry"
```

### Task 3.2: Prompts + analyzeAudit + streaming (TDD)

**Files:** Create `lib/agent/prompts.ts`, `lib/agent/analyze.ts`, `lib/agent/index.ts`, `__tests__/agent/analyze.test.ts`.

**Interfaces produced:**
```ts
export async function analyzeAudit(items: TaskInput[], caller?: ToolCaller): Promise<AnalysisResult>;
export async function* streamAnalyzeAudit(items: TaskInput[]):
  AsyncGenerator<{ type: 'thinking'; text: string } | { type: 'result'; data: AnalysisResult }>;
```
`analyzeAudit` accepts an injectable `caller` (defaults to `createAnthropicToolCaller()`) purely so tests can run without the network.

- [ ] **Step 1:** Write `lib/agent/prompts.ts` — the analyze system prompt encoding: the four DRIP definitions (Delegate = low-value, someone else can do it; Replace = automate/tool it away; Invest = high-value skill-building; Produce = your unique high-value output), the `$10/$100/$1000/$10000` value ladder, the keep/delegate/eliminate decision rule, and instruction to score every input row and recommend the first hire from the fixed ladder `admin → delivery → marketing → sales → leadership`. Export `buildAnalyzeUserContent(items)` and `ANALYZE_SYSTEM`, plus `SOP_SYSTEM` + `buildSopUserContent(item, context)`.

- [ ] **Step 2: Write the failing test** `__tests__/agent/analyze.test.ts` with a fake caller returning a fixed valid payload; assert `analyzeAudit` returns a parsed `AnalysisResult` and that the user content passed to the caller contains each input task string:

```ts
import { describe, it, expect, vi } from 'vitest';
import { analyzeAudit } from '@/lib/agent/analyze';

it('analyzeAudit validates and returns the structured result', async () => {
  const payload = {
    items: [{ task: 'Reconcile bank statements', hoursPerWeek: 5, costToDelegate: 25,
      valueTier: '$10', dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'r' }],
    summary: { firstHireRole: 'admin', firstHireJustification: 'j' },
  };
  const caller = { call: vi.fn().mockResolvedValue(payload) };
  const out = await analyzeAudit(
    [{ task: 'Reconcile bank statements', hoursPerWeek: 5, costToDelegate: 25 }],
    caller as never,
  );
  expect(out.items[0].dripQuadrant).toBe('Delegate');
  expect(caller.call.mock.calls[0][0].messages[0].content).toContain('Reconcile bank statements');
});
```

- [ ] **Step 3: Run** — expect FAIL.

- [ ] **Step 4:** Implement `lib/agent/analyze.ts`. `analyzeAudit` calls `structuredToolCall` with `AnalysisResultSchema.parse` as the validator and `analysisToolJsonSchema` as the tool schema. `streamAnalyzeAudit` uses `new Anthropic().messages.stream({... thinking:{type:'adaptive', display:'summarized'}, tools, tool_choice ...})`, yields `{type:'thinking', text}` on `thinking_delta` events, then reads `stream.finalMessage()`, extracts the `tool_use` block, `AnalysisResultSchema.parse`es it (throwing `StructuredCallError` on failure — the streaming path does not retry; the non-streaming `analyzeAudit` is the validated-retry path, and the route falls back to it on a stream validation error), and yields `{type:'result', data}`.

- [ ] **Step 5:** `lib/agent/index.ts` re-exports the public surface (`analyzeAudit`, `streamAnalyzeAudit`, `generateSOP`, schema types).

- [ ] **Step 6: Run** the test — expect PASS. `npm test` full suite green.

- [ ] **Step 7: Commit:**

```bash
git add lib/agent/prompts.ts lib/agent/analyze.ts lib/agent/index.ts __tests__/agent/analyze.test.ts
git commit -m "feat: analyzeAudit structured call + streaming variant with tests"
```

### Task 3.3: generateSOP (TDD)

**Files:** Create `lib/agent/sop.ts`, `__tests__/agent/sop.test.ts`.

**Interfaces produced:** `generateSOP(item: ScoredItem, workspaceContext: string, caller?: ToolCaller): Promise<Sop>`.

- [ ] **Step 1: Write the failing test** with a fake caller returning a valid SOP payload; assert `generateSOP` returns a parsed `Sop` and the user content includes the task string + context.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3:** Implement `sop.ts` via `structuredToolCall` with `SopSchema.parse` + `sopToolJsonSchema`.
- [ ] **Step 4: Run** — PASS; `npm test` green.
- [ ] **Step 5: Commit:** `feat: generateSOP structured call with tests`.

### Task 3.4: Eval harness

**Files:** Create `evals/fixtures.ts`, `evals/run.ts`.

**Design:** Fixtures are input tasks with expected quadrant/recommendation *ranges* (sets of acceptable values), not exact strings — the eval asserts output **structure always** and **sanity on the fixtures** (e.g. "reconcile bank statements, 5h/wk, low delegate cost" ∈ {Delegate}; "close enterprise deals" ∈ {Produce} with recommendation ∈ {keep}). Runs against the live API (`npm run eval`), documented as local/on-demand (not CI).

- [ ] **Step 1:** Write `evals/fixtures.ts`:

```ts
import type { DripQuadrant, Recommendation } from '@/lib/buyback/types';
export interface EvalFixture {
  task: string; hoursPerWeek: number; costToDelegate: number;
  expectQuadrant: DripQuadrant[]; expectRecommendation: Recommendation[];
}
export const FIXTURES: EvalFixture[] = [
  { task: 'Reconcile bank statements each week', hoursPerWeek: 5, costToDelegate: 25,
    expectQuadrant: ['Delegate'], expectRecommendation: ['delegate', 'eliminate'] },
  { task: 'Manually copy leads from email into the CRM', hoursPerWeek: 3, costToDelegate: 20,
    expectQuadrant: ['Replace', 'Delegate'], expectRecommendation: ['delegate', 'eliminate'] },
  { task: 'Close enterprise deals with new logos', hoursPerWeek: 8, costToDelegate: 300,
    expectQuadrant: ['Produce'], expectRecommendation: ['keep'] },
  { task: 'Design next-quarter company strategy', hoursPerWeek: 4, costToDelegate: 500,
    expectQuadrant: ['Invest', 'Produce'], expectRecommendation: ['keep'] },
];
```

- [ ] **Step 2:** Write `evals/run.ts`: calls `analyzeAudit(FIXTURES)` once, then for each returned item asserts (a) it parses `ScoredItemSchema` (structure always), (b) its quadrant ∈ the fixture's `expectQuadrant` and recommendation ∈ `expectRecommendation` (sanity). Prints a per-fixture PASS/FAIL table and exits non-zero on any sanity failure. Requires `ANTHROPIC_API_KEY`; print a clear message and exit 1 if unset.

- [ ] **Step 3:** Add `tsx` if not present; confirm `npm run eval` is wired.

- [ ] **Step 4: Commit** (do NOT run against the live API yet — that's the gate, operator-run):

```bash
git add evals/fixtures.ts evals/run.ts package.json
git commit -m "feat: eval harness with fixture sanity checks"
```

### ✅ GATE 3
`npm test` green (schema/parse/client/analyze/sop unit tests). Then **operator runs** `npm run eval` (needs `ANTHROPIC_API_KEY` — operator gate to authorize the key/spend); confirm the fixture sanity table passes. **STOP for operator review.**

---

## PHASE 4 — Data layer (Supabase + RLS)

**Deliverable:** `supabase/migrations/*` (tables + RLS), `lib/db/*` (typed, RLS-aware queries), and a written RLS check in ARCHITECTURE.md demonstrating cross-workspace isolation. Migrations apply cleanly.

**Operator gate:** creating/linking the Supabase project and running migrations requires account authorization — done together in Phase 7 for the hosted project, but migrations are authored and applied to a **local** Supabase (Docker) or a scratch project here so the RLS check is real, not hypothetical.

### Task 4.1: Schema migration

**Files:** Create `supabase/migrations/0001_init.sql`.

- [ ] **Step 1:** Author `0001_init.sql` with the spec's data model: `workspaces (id uuid pk, name text, owner_id uuid references auth.users, created_at timestamptz default now())`; `workspace_members (workspace_id uuid references workspaces on delete cascade, user_id uuid references auth.users, role text check (role in ('owner','member')), primary key (workspace_id, user_id))`; `audits (id uuid pk default gen_random_uuid(), workspace_id uuid references workspaces on delete cascade, created_by uuid references auth.users, title text, created_at timestamptz default now())`; `audit_items (id uuid pk, audit_id uuid references audits on delete cascade, task text, hours_per_week numeric, cost_to_delegate numeric, value_tier text, drip_quadrant text, recommendation text, rationale text)`; `sops (id uuid pk, audit_item_id uuid references audit_items on delete cascade, content_md text, created_at timestamptz default now())`. Enable `pgcrypto` for `gen_random_uuid()` if needed.

- [ ] **Step 2:** Update `docs/architecture/migrations.md` catalog entry.

- [ ] **Step 3: Commit:** `feat: initial schema migration`.

### Task 4.2: RLS policies + membership helper

**Files:** Create `supabase/migrations/0002_rls.sql`.

**RLS structure (WHY-comment in the migration):** every table's visibility keys off workspace membership. A `security definer` helper `is_workspace_member(ws uuid)` returns whether `auth.uid()` is in `workspace_members` for `ws`; child tables (`audit_items`, `sops`) join up to their owning workspace. `security definer` is required so the membership lookup itself isn't blocked by RLS on `workspace_members`.

- [ ] **Step 1:** Author `0002_rls.sql`: `alter table ... enable row level security` on all five tables; create `is_workspace_member(uuid) returns boolean security definer`; policies:
  - `workspaces`: select/all where `is_workspace_member(id)`; insert where `owner_id = auth.uid()`.
  - `workspace_members`: select where `is_workspace_member(workspace_id)`; insert/delete gated to workspace owner.
  - `audits`: all where `is_workspace_member(workspace_id)`.
  - `audit_items`: all where `is_workspace_member((select workspace_id from audits where audits.id = audit_items.audit_id))`.
  - `sops`: all where the parent `audit_item`'s audit is in a member workspace.

- [ ] **Step 2: Write the RLS check** in `docs/ARCHITECTURE.md` (create the file): a concrete SQL transcript demonstrating that user A (member of workspace 1) cannot select user B's audit in workspace 2 — two `set local role`/`set local request.jwt.claims` blocks showing 0 rows returned cross-workspace and the owner's rows returned in-workspace. This is the spec's required "written RLS test note."

- [ ] **Step 3:** Apply both migrations to local Supabase (`supabase db reset` or `psql` against the local instance) and run the RLS transcript to confirm it behaves as written. Capture the real output into ARCHITECTURE.md (evidence, not assertion).

- [ ] **Step 4: Commit:** `feat: RLS policies with cross-workspace isolation check`.

### Task 4.3: Typed DB layer

**Files:** Create `lib/db/types.ts`, `lib/db/client.ts`, `lib/db/workspaces.ts`, `lib/db/audits.ts`, `lib/db/sops.ts`, `lib/db/index.ts`.

- [ ] **Step 1:** `lib/db/types.ts` — row types for each table (hand-written or `supabase gen types`).
- [ ] **Step 2:** `lib/db/client.ts` — `createServerClient` / `createBrowserClient` via `@supabase/ssr`, reading `NEXT_PUBLIC_SUPABASE_URL` + anon key; a service-role client factory kept server-only and never imported by client components.
- [ ] **Step 3:** Query modules: `createWorkspace`, `listWorkspacesForUser`, `inviteMember`; `createAudit(workspaceId, title, items: ScoredItem[])`, `getAudit(id)` (returns audit + items), `listAudits(workspaceId)`; `saveSop(auditItemId, contentMd)`, `getSopsForAudit(auditId)`. All rely on RLS for authorization (no manual `where user_id` filters — that is the point of RLS). Map DB snake_case rows to the camelCase `ScoredItem` domain type at this boundary.
- [ ] **Step 4:** `lib/db/index.ts` re-exports. `npm run typecheck` green.
- [ ] **Step 5: Commit:** `feat: typed RLS-aware Supabase query layer`.

### Task 4.4: Abuse-guard — pure policy (TDD) + DB-backed counters

**Files:** Create `lib/guard/policy.ts`, `lib/guard/index.ts`, `__tests__/guard/policy.test.ts`, `supabase/migrations/0003_abuse_guard.sql`, `lib/db/guard.ts`.

**Design:** The *decision* logic is pure and unit-tested; the *counters/cache* live in Postgres behind the service role (the only place that touches Supabase). This keeps the interesting logic testable without a DB and keeps I/O in `lib/db`.

**Interfaces produced (pure, `lib/guard/policy.ts`):**
```ts
export const GUARD_LIMITS = {
  demoRunsPerIpPerHour: 5,
  dailyDemoApiBudget: 200,   // max LIVE sample computations per UTC day before the breaker trips
  maxItems: 30,
  maxTaskLen: 500,
  cacheTtlMs: 24 * 60 * 60 * 1000,
} as const;

export type DemoVerdict =
  | { kind: 'serve_cache' }          // cache fresh -> stream cached, no API call
  | { kind: 'compute_live' }         // allowed to call the API, then cache the result
  | { kind: 'rate_limited' }         // per-IP cap hit
  | { kind: 'breaker_serve_cache' }  // daily budget spent; must serve cache (or 'unavailable' if none)
  | { kind: 'unavailable' };         // breaker tripped AND no cache to fall back to

export function decideDemo(input: {
  ipRunsThisHour: number; dailyLiveCount: number;
  cacheAgeMs: number | null;         // null = no cache row
  nowFresh: boolean;                 // cacheAgeMs != null && cacheAgeMs < cacheTtlMs
}): DemoVerdict;

// Edge payload validation for AUTHENTICATED analyze/sop input.
export function validatePayloadSize(items: { task: string }[]):
  { ok: true } | { ok: false; reason: string };
```

**Decision rules (encode as WHY-comments):** fresh cache → `serve_cache` (cheapest, no API). No/stale cache but per-IP cap hit → `rate_limited`. No/stale cache and daily budget spent → `breaker_serve_cache` if any cache row exists (even stale — a slightly old sample beats bleeding the API), else `unavailable`. Otherwise → `compute_live`. Order matters: cache-fresh short-circuits before rate/budget checks so a warm demo never rate-limits a legitimate viewer.

- [ ] **Step 1: Write the failing test** `__tests__/guard/policy.test.ts` covering every `decideDemo` branch and `validatePayloadSize` (over-count, over-length, ok):

```ts
import { describe, it, expect } from 'vitest';
import { decideDemo, validatePayloadSize, GUARD_LIMITS } from '@/lib/guard/policy';

describe('decideDemo', () => {
  it('serves fresh cache before any rate/budget check', () => {
    expect(decideDemo({ ipRunsThisHour: 999, dailyLiveCount: 999, cacheAgeMs: 1000, nowFresh: true }))
      .toEqual({ kind: 'serve_cache' });
  });
  it('rate-limits when cache is cold and the per-IP cap is hit', () => {
    expect(decideDemo({ ipRunsThisHour: GUARD_LIMITS.demoRunsPerIpPerHour, dailyLiveCount: 0, cacheAgeMs: null, nowFresh: false }))
      .toEqual({ kind: 'rate_limited' });
  });
  it('trips the breaker to stale cache when the daily budget is spent', () => {
    expect(decideDemo({ ipRunsThisHour: 0, dailyLiveCount: GUARD_LIMITS.dailyDemoApiBudget, cacheAgeMs: 9e9, nowFresh: false }))
      .toEqual({ kind: 'breaker_serve_cache' });
  });
  it('is unavailable when the breaker is tripped and no cache exists', () => {
    expect(decideDemo({ ipRunsThisHour: 0, dailyLiveCount: GUARD_LIMITS.dailyDemoApiBudget, cacheAgeMs: null, nowFresh: false }))
      .toEqual({ kind: 'unavailable' });
  });
  it('computes live when under all caps with no fresh cache', () => {
    expect(decideDemo({ ipRunsThisHour: 0, dailyLiveCount: 0, cacheAgeMs: null, nowFresh: false }))
      .toEqual({ kind: 'compute_live' });
  });
});

describe('validatePayloadSize', () => {
  it('rejects too many items', () => {
    const items = Array.from({ length: GUARD_LIMITS.maxItems + 1 }, () => ({ task: 'x' }));
    expect(validatePayloadSize(items).ok).toBe(false);
  });
  it('rejects an over-length task', () => {
    expect(validatePayloadSize([{ task: 'x'.repeat(GUARD_LIMITS.maxTaskLen + 1) }]).ok).toBe(false);
  });
  it('accepts a normal payload', () => {
    expect(validatePayloadSize([{ task: 'Reconcile books' }]).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3:** Implement `lib/guard/policy.ts` per the rules above; `lib/guard/index.ts` re-exports.
- [ ] **Step 4: Run** — PASS; `npm test` green.
- [ ] **Step 5:** Author `supabase/migrations/0003_abuse_guard.sql`: `demo_cache (id text primary key default 'sample', result_json jsonb, updated_at timestamptz default now())`; `demo_rate (ip_hash text, window_start timestamptz, count int, primary key (ip_hash, window_start))`; `demo_budget (day date primary key, live_count int default 0)`. **Enable RLS on all three and create NO anon/authenticated policies** (deny-all by default) — only the service-role key (which bypasses RLS) reads/writes them, so no browser or logged-in user can touch or scrape them. Add a WHY-comment stating this.
- [ ] **Step 6:** Implement `lib/db/guard.ts` (service-role client only): `getSampleCache()` → `{resultJson, ageMs} | null`; `putSampleCache(result)`; `incrDemoRate(ipHash)` → runs this hour's count for that IP; `getDailyLiveCount()` / `incrDailyLiveCount()`. IP hashing (SHA-256 of IP + a server salt) happens in the route before calling `incrDemoRate` — raw IP never leaves the request handler.
- [ ] **Step 7: Commit:** `feat: abuse-guard policy (pure, tested) + demo cache/rate/budget tables and helpers`.

### ✅ GATE 4
Migrations (`0001`–`0003`) apply cleanly to a fresh DB (`supabase db reset` output read). The RLS transcript in ARCHITECTURE.md shows cross-workspace isolation with real captured output, and confirms the three `demo_*` tables are unreadable by anon/authenticated roles (deny-all RLS). `npm test` green (including the guard-policy unit). `npm run typecheck` green. **STOP for operator review.**

---

## PHASE 5 — UI + streaming

**Deliverable:** Landing (public + disclaimer), auth, audit entry, streaming analysis, dashboard (DRIP viz + buyback rate + top tasks), Replacement Ladder, SOP view/export, and the `/demo` no-auth sample-data path. The full sample-data path works locally end to end.

**Component reuse note:** before building UI, run the component-auditor subagent against `~/dev/_shared/components/REGISTRY.md` (SOP step 6) and reuse registered components where they fit; document any net-new component.

### Task 5.1: Sample data + `/api/analyze` SSE route

**Files:** Create `lib/sample.ts` (a realistic founder's week — ~10 tasks as `TaskInput[]`), `app/api/analyze/route.ts`.

- [ ] **Step 1:** `lib/sample.ts` exports `SAMPLE_WEEK: TaskInput[]` (bookkeeping, inbox triage, CRM data entry, invoicing, sales calls, product strategy, hiring, content, customer support, investor updates — a believable mix across all four quadrants).
- [ ] **Step 2:** `app/api/analyze/route.ts` — POST handler, runtime `nodejs`, guard-enforced. **Determine auth first**: if the request has a valid Supabase session (`lib/db/client` server client), treat as *authenticated* — Zod-validate the body with `validatePayloadSize`, reject over-cap payloads (413/400), and `streamAnalyzeAudit(items)` on the user's real input. If **no session** (demo), **ignore the request body entirely** and operate only on `SAMPLE_WEEK`, applying the guard:
  1. Hash the client IP (`sha256(ip + SERVER_SALT)`); `incrDemoRate(ipHash)` and `getSampleCache()`/`getDailyLiveCount()`.
  2. `decideDemo({...})` (pure). Branch: `serve_cache`/`breaker_serve_cache` → stream the cached `AnalysisResult` (a quick thinking-log replay then the result — genuine data, no API call); `rate_limited` → 429 with a friendly "demo limit reached, sign in for unlimited" message; `unavailable` → 503; `compute_live` → `incrDailyLiveCount()`, `streamAnalyzeAudit(SAMPLE_WEEK)`, and on completion `putSampleCache(result)`.
  On a stream-side validation throw in the authenticated path, fall back to `analyzeAudit(items)` (the retry path); emit `data:{type:'error'}` only if that also fails. Never expose the API key to the client.
- [ ] **Step 3:** Add `SERVER_SALT` to `.env.example` (and the Vercel env list in Phase 7). Document that the demo path never calls the API when a fresh cache exists or the breaker is tripped.
- [ ] **Step 4: Verify** locally: (a) unauthenticated `curl -N` on a cold cache computes live once then caches; a second call streams the cache with no API call (confirm via a log line / usage); (b) exceeding `demoRunsPerIpPerHour` on a cold cache returns 429; (c) authenticated request analyzes real input. (Operator gate: the live-compute leg hits the API.)
- [ ] **Step 5: Commit:** `feat: sample week + guard-enforced streaming analyze route`.

### Task 5.2: Landing + demo path

**Files:** `app/page.tsx`, `app/globals.css`, `app/demo/page.tsx`, plus presentational components `components/DripDashboard.tsx`, `components/BuybackRate.tsx`, `components/TopTasks.tsx`, `components/ReplacementLadder.tsx`, `components/AuditTable.tsx`.

- [ ] **Step 1:** Landing `app/page.tsx` — one-line what-it-is, the **disclaimer** ("Independent demo. Not affiliated with, endorsed by, or associated with Martell Group or Dan Martell."), a "Try with sample data" button linking to `/demo`, and a "Sign in" link. No em/en dashes in this copy.
- [ ] **Step 2:** `app/demo/page.tsx` (client component) — loads `SAMPLE_WEEK`, POSTs to `/api/analyze`, renders streamed thinking as a live log, then renders the dashboard (DRIP quadrant hours via `quadrantHourRollup`, `buybackRate`, `topTasksToOffload`), the Replacement Ladder (highlighting `summary.firstHireRole` in the fixed order with the justification), and the scored `AuditTable`. Must reach a useful audit within ~10s, no signup. All rollup math comes from `lib/buyback` (never recomputed in the component).
- [ ] **Step 3:** Build the presentational components using Tailwind (external classes only, no inline styles). The DRIP viz is a labeled 4-bucket bar/quadrant chart from the rollup — self-contained, no external chart lib unless already in the shared registry.
- [ ] **Step 4: Verify** `npm run dev`, open `/demo`, click through: thinking streams, results render, buyback rate + ladder + top tasks correct against the sample. Screenshot for CHANGELOG.
- [ ] **Step 5: Commit:** `feat: landing, disclaimer, and streaming demo path`.

### Task 5.3: Auth + authed audit flow + persistence

**Files:** `app/auth/callback/route.ts`, `app/app/layout.tsx`, `app/app/page.tsx`, `app/app/audit/[id]/page.tsx`, plus an audit-entry form component and Supabase auth UI (email magic link via `@supabase/ssr`).

- [ ] **Step 1:** Supabase email auth (magic link) + `auth/callback` route exchanging the code for a session; `app/app/*` is gated (redirect to sign-in if no session). On first sign-in, create a personal workspace (`createWorkspace`) if the user has none.
- [ ] **Step 2:** `app/app/page.tsx` — workspace audit list (`listAudits`) + "New audit" entry form (rows of task/hours/cost, plus "Load sample week"). Submitting: stream analysis via `/api/analyze`, then `createAudit(workspaceId, title, scoredItems)` to persist. Remember: `params`/`searchParams` are Promises in Next 16 — `await` them.
- [ ] **Step 3:** `app/app/audit/[id]/page.tsx` — `await params`, `getAudit(id)` (RLS-scoped), render the same dashboard/ladder/table as `/demo` from persisted data, plus a per-delegate-task "Generate SOP" button hitting `/api/sop`, rendering the structured SOP and persisting via `saveSop`.
- [ ] **Step 4:** `app/api/sop/route.ts` — POST `{item, context}`, server-only, runtime `nodejs`. **Require a valid Supabase session** (return 401 otherwise — SOP generation is never anonymous, so it can't be used to bleed the API); Zod-validate `item`/`context` with length caps; `generateSOP` → return the `Sop`.
- [ ] **Step 5:** Teammate invite: a minimal "invite by email" action calling `inviteMember` (owner-gated by RLS).
- [ ] **Step 6: Verify** end to end locally: sign in → new audit from sample → streamed analysis → persisted → reopen audit → generate an SOP → SOP persists. Confirm a second user cannot open the first user's audit (RLS holds through the app).
- [ ] **Step 7: Commit:** `feat: auth, persisted audits, SOP generation, teammate invite`.

### Task 5.4: Markdown export

**Files:** `app/api/export/[id]/route.ts`, `lib/export.ts`.

- [ ] **Step 1:** `lib/export.ts` — pure `auditToMarkdown(audit, items, sops)` producing the full report (scored table, buyback rate, quadrant rollup, Replacement Ladder, each SOP). Unit-test this pure function (structure of the markdown string). TDD: failing test first.
- [ ] **Step 2:** `app/api/export/[id]/route.ts` — `await params`, `getAudit`, `getSopsForAudit`, return `auditToMarkdown(...)` as `text/markdown` attachment. RLS-scoped.
- [ ] **Step 3: Verify** the export downloads and contains all sections for a real audit.
- [ ] **Step 4: Commit:** `feat: single-file markdown export of audit + SOPs` (test + route together).

### ✅ GATE 5
`npm run build` succeeds; `npm test` green. Operator walks the full sample-data path locally end to end: `/demo` streams and renders; authed flow persists an audit, generates+persists an SOP, exports markdown; cross-user RLS holds. **Abuse-guard verified live:** a warm demo serves from cache with no API call; the per-IP limit returns 429 on a cold cache; the anonymous demo cannot analyze arbitrary input; `/api/sop` returns 401 without a session. **STOP for operator review.**

---

## PHASE 6 — Docs + polish

**Deliverable:** README (with the real build-hours figure), ARCHITECTURE.md complete, env.example, LICENSE, disclaimer surfaced. A cold `git clone` + README steps brings the app up on another machine.

### Task 6.1: README + ARCHITECTURE + LICENSE

**Files:** `README.md`, `docs/ARCHITECTURE.md` (extend), `LICENSE`.

- [ ] **Step 1:** Write `README.md` per the spec's 7-point plan: (1) one-line what-it-is + disclaimer; (2) live demo link + 20-second sample path; (3) the motion (concierge time-audit service → software, mapped to Buyback Loop + DRIP); (4) "Built solo in ~[ACTUAL] hours with AI tooling" — fill the REAL figure from git history/`docs/CHANGELOG.md`, honestly; (5) architecture at a glance (the three isolation boundaries) + link to ARCHITECTURE.md; (6) the engineering choices (forced tool-use + Zod validate-and-retry + eval harness + RLS); (7) run-it-locally in 3 commands + env.example + the roadmap (the cut list, framed as intentional YAGNI). Green CI badge. No em/en dashes in this file (published marketing prose).
- [ ] **Step 2:** Finish `docs/ARCHITECTURE.md`: the isolation-boundary diagram, the LLM reliability pattern, the streaming design decision, and the already-captured RLS check.
- [ ] **Step 3:** Add `LICENSE` (MIT unless operator specifies otherwise — operator gate on license choice).
- [ ] **Step 4:** Compute actual build hours from commit timestamps; write the figure into README + CHANGELOG.
- [ ] **Step 5: Commit:** `docs: README, ARCHITECTURE, LICENSE`.

### Task 6.2: Cold-clone verification

- [ ] **Step 1:** In a fresh temp dir, `git clone` (or copy) the repo, `cp .env.example .env.local` and fill with real local values, `npm ci`, `npm run build`, `npm run dev`, and confirm `/demo` works following ONLY the README's 3-command steps. Fix any README gap found.
- [ ] **Step 2: Commit** any README corrections: `docs: fix run-it-locally steps found in cold-clone check`.

### ✅ GATE 6
A cold clone + README steps brings the app up on a clean checkout (operator confirms, reads output). `npm run build`, `npm test`, `npm run typecheck` all green. **STOP for operator review.**

---

## PHASE 7 — Deploy + verify (done together, per-account authorized)

**Deliverable:** Live URL running the sample-data path end to end; public repo reading as a week-pickup-able codebase; profile README repo with `buyback-agent` pinned.

Each account connection is an explicit operator gate.

### Task 7.1: GitHub
- [ ] **Operator gate:** authorize creating the public repo `scott-primalglobalconsulting/buyback-agent`. Then add remote, push `main`, confirm CI runs green on the first push (the deferred Phase 1 sub-gate).

### Task 7.2: Supabase
- [ ] **Operator gate:** authorize the hosted Supabase project. Run `0001`/`0002` migrations against it; capture URL + anon + service-role keys (into local `.env.local` and, later, Vercel — never committed). Re-run the RLS check against the hosted DB.

### Task 7.3: Vercel
- [ ] **Operator gate:** authorize importing the repo into Vercel. Set env (`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SERVER_SALT`) in the Vercel dashboard. Set `main` as production. Deploy. Run `pgc-pre-deploy` + `pgc-pre-deploy-nextjs` + `pgc-pre-deploy-saas` gates before/at deploy (the SaaS gate confirms the service-role key is server-only and never shipped to the client bundle).

### Task 7.4: Live verification
- [ ] Open the live URL, click "Try with sample data," confirm within ~10s a real audit renders (scored, bucketed, ladder). Sign in, create+persist an audit, generate an SOP, export markdown, on the live deployment. Run `pgc-seo-live-verify` on the deployed URL.
- [ ] Put the live URL into the README (replace the placeholder), commit, redeploy.

### Task 7.5: Profile polish
- [ ] **Operator gate:** create a profile README repo so the GitHub profile is not empty; pin `buyback-agent`.

### ✅ GATE 7 (final)
Live URL runs the sample path end to end (operator confirms in-browser). Public repo green CI, README with real build-hours + live link, ARCHITECTURE + RLS check present. **DONE.**

---

## Self-Review (checked against the spec)

- **Success criteria** — reviewer opens live URL → "Try with sample data" → real audit in ~10s: Phase 5.2 (`/demo`) + Phase 7.4. Public repo reads as pick-up-able: Phases 1 (CI), 6 (README/ARCHITECTURE), clean commit history (enforced per-task). LLM demonstrably engineered: Phase 3 (forced tool-use + Zod validate-and-retry + evals).
- **User-facing 1–7** — Audit input (5.3 form), Analyze with tier/quadrant/recommendation/rationale streaming (3.2 + 5.1/5.2), Dashboard with DRIP viz + buyback rate + top tasks (2.1/2.2 + 5.2), Replacement Ladder (3.2 summary + 5.2), Transfer/SOP export (3.3 + 5.3 + 5.4), Persistence + invite (4 + 5.3), Export (5.4). All covered.
- **Architecture / isolation** — Phase 2/3 (`lib/agent`, `lib/buyback` pure), Phase 4 (`lib/db` sole Supabase touchpoint), routes/components consume only these (5). Enforced by the Global Constraints + a lint/review check.
- **Data model + RLS** — Phase 4 exactly matches the spec's five tables; RLS check note in ARCHITECTURE.md (4.2).
- **Testing/quality** — Vitest unit tests (2, 3), eval harness (3.4), CI lint+typecheck+test (1.3), green-on-every-commit enforced per task.
- **README plan** — Phase 6.1 maps 1:1 to the spec's 7 points.
- **Engineering quality bar** — TDD (all `lib` tasks), no-fluff/WHY-comments/typed-boundaries/isolation/green-on-commit/conventional-commits are Global Constraints applied to every task.
- **Build phases + gates** — this plan's 7 phases and 7 gates map 1:1 to the spec's phase list; each gate uses verification-before-completion (run command → read output → claim green) and stops for operator review.
- **Out of scope** — application-package content (resume, Greenhouse answers, Loom) is NOT in this plan (spec says it lives in `job-application-workbench`).
- **Abuse protection (operator-added requirement)** — sample-locked anonymous demo + Postgres cache + per-IP rate limit + global daily circuit breaker + Zod payload caps + auth-gated SOP: pure policy in `lib/guard/policy.ts` (2.x-style TDD in 4.4), DB counters in `lib/db/guard.ts` + `0003_abuse_guard.sql` (4.4, deny-all RLS), enforced in the routes (5.1, 5.3), verified at Gate 5. The unauthenticated `/api/analyze` cannot be used to bleed the Anthropic API: it only ever computes the fixed sample, at most `dailyDemoApiBudget` live computations/day globally, rate-limited per IP, and served from cache in the common case.

**Type-consistency check:** `ScoredItem`, `TaskInput`, `DripQuadrant`, `ValueTier`, `Recommendation` defined once (2.1), reused by the Zod schema (2.3), agent (3), buyback math (2), db mapping (4.3), UI (5), export (5.4). `AnalysisResult`/`Sop` are `z.infer` outputs consumed unchanged downstream. `structuredToolCall`/`ToolCaller`/`StructuredCallError` defined in 3.1 and reused by 3.2/3.3. No signature drift.

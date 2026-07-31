# Report-Quality Tier C + B Implementation Plan

**Goal:** Make the report opinionated and defensible: score each task's revenue-proximity independently of DRIP, warn when non-revenue "Invest" crowds out selling, compute a real $/hr Buyback Rate, show a one-line sold-vs-built summary, and stop the SOPs from inventing a funded tool stack.

**Architecture:** The per-task `revenueProximity` is a **model-output** field (classification-contract change → Zod + tool JSON schema + drift test + prompt + Gate-3 eval). Everything else is **pure domain math** (`lib/buyback`) + **audit-level inputs** that flow form → `persistAudit` server action → `createAudit` → audit row, never through `/api/analyze`. SOP context (team/tool-budget) rides into the SOP prompt via the existing `/api/sop` `context` seam, promoted to structured fields. No new runtime dependencies.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, `@anthropic-ai/sdk` (`claude-sonnet-5`), Supabase (Postgres + RLS), Vitest.

## Global Constraints

- **Isolation (hard):** `lib/agent` and `lib/buyback` never import React/Next/Supabase. `lib/db` is the only Supabase touchpoint. Routes/components consume `lib/agent`/`lib/db`/`lib/buyback`, never Anthropic/Supabase directly. Client components reach the agent only via `fetch()`, DB writes only via server actions.
- **No inline styles.** New visual treatments get classes in `app/globals.css` only.
- **No em/en dashes in public-facing copy** (landing, demo, dashboard, export markdown). Dashes are fine in code/comments/commits/CHANGELOG.
- **Model:** runtime LLM is `claude-sonnet-5`. Re-confirm the model id/API surface via the `claude-api` skill before touching any Anthropic call. Build/subagent work never runs on a v5 model (Opus 4.8 / Haiku 4.5 only).
- **Migrations:** any `supabase/migrations/*` change touching RLS requires a written cross-workspace isolation check in `docs/architecture/migrations.md` before merge. Task C4's migration is **additive nullable, no RLS change** — the isolation note still gets written (mirrors 0004).
- **Any change under `lib/agent` re-runs Gate 3:** `npm run eval` (live API, real spend) — operator-run, not CI. Applies to Tasks C1 and C3.
- **Done means:** `npm run lint`, `npm run typecheck`, `npm test` all green (read the actual output); conventional commits, one logical change each, files staged explicitly (never `git add -A`/`.`).
- **Backward compatibility:** `revenueProximity` is **optional** in the domain Zod schema so pre-0005 persisted audits and the existing demo cache row still parse; it is **required** in the tool JSON schema so every fresh model analysis emits it.

---

## Open decisions (confirm before execution; defaults are baked into the tasks)

1. **Buyback Rate formula (#6):** `annualIncome / 2000 / 4` (2000 = full-time hrs/yr; Buyback Rate = quarter of effective hourly). Income input is **optional** — when absent, the $/hr line and above/below markers are omitted. *Default: as stated.*
2. **`isAtRevenue` input (#3):** a required yes/no in the form, **default "no"** (pre-revenue is the sharper, more useful default and matches the target user). *Default: required radio, defaults to no.*
3. **`revenueProximity` back-compat:** optional-on-read / required-in-tool-schema (per Global Constraints). *Default: as stated. The alternative — required everywhere — forces re-analysis of the one persisted test audit and the demo cache and is rejected.*
4. **Demo path assumption:** the anonymous `/demo` has no inputs, so it renders the caution + sold-vs-built line with `isAtRevenue = false` and **omits** the $/hr Buyback Rate (no income). *Default: as stated.*
5. **Ledger table:** `AuditTable` and the export table gain a compact **Revenue** column (chip). *Default: add it; it widens the table one column but the ledger is the "full" view.*

---

## File Structure

**New files:**
- `lib/buyback/revenue.ts` — pure revenue-proximity rollups, sold-vs-built, caution.
- `components/RevenueSummary.tsx` — sold-vs-built line + caution banner (presentational).
- `supabase/migrations/0005_revenue_context.sql` — additive nullable columns.
- `__tests__/buyback/revenue.test.ts` — unit tests for `lib/buyback/revenue.ts`.

**Modified files:**
- `lib/buyback/types.ts` — `REVENUE_PROXIMITY` vocab + `RevenueProximity` type + `ScoredItem.revenueProximity?`.
- `lib/agent/schema.ts` — re-export vocab; Zod optional field; tool JSON schema required field.
- `lib/buyback/rate.ts` — `buybackHourlyRate`, `tierDollars`, `isAboveBuybackRate`.
- `lib/agent/prompts.ts` — revenue-proximity block in `ANALYZE_SYSTEM` + instruction in `buildAnalyzeUserContent`; SOP prompt de-stacked + team/tool-budget aware (`SOP_SYSTEM`, `buildSopUserContent`).
- `lib/db/types.ts` — new row columns (`AuditItemRow`, `AuditRow`) + `AuditMeta` type.
- `lib/db/audits.ts` — map `revenue_proximity`; `createAudit` persists item proximity + audit meta.
- `app/app/actions.ts` — `persistAudit` gains a validated `meta` arg.
- `app/app/new-audit-form.tsx` — audit-context inputs; pass `meta` to `persistAudit`.
- `app/api/sop/route.ts` — accept structured `team`/`toolBudget`; cap + forward.
- `app/app/audit/[id]/sop-panel.tsx` — thread team/tool-budget into the `/api/sop` body.
- `components/BuybackRate.tsx` — optional $/hr Buyback Rate stat.
- `components/AuditTable.tsx` — Revenue chip column.
- `app/demo/page.tsx`, `app/app/audit/[id]/page.tsx` — mount `RevenueSummary`.
- `lib/export.ts` — sold-vs-built line, $/hr rate line, Revenue column.
- `app/globals.css` — classes for the caution banner, revenue chip, rate stat.
- Tests: `__tests__/agent/schema.test.ts`, `__tests__/buyback/rate.test.ts` (if present; else add), `__tests__/export.test.ts`.
- Docs: `docs/architecture/migrations.md`, `docs/CHANGELOG.md`, and the local task ledger.

---

## Task C1: Revenue-proximity classification contract

**Files:**
- Modify: `lib/buyback/types.ts`
- Modify: `lib/agent/schema.ts`
- Test: `__tests__/agent/schema.test.ts`

**Interfaces:**
- Produces: `REVENUE_PROXIMITY` (readonly tuple), `type RevenueProximity`, `ScoredItem.revenueProximity?: RevenueProximity`. `analysisToolJsonSchema` item object requires `revenueProximity`.

- [ ] **Step 1: Write the failing test** — append to `__tests__/agent/schema.test.ts`:

```ts
import {
  AnalysisResultSchema, SopSchema, analysisToolJsonSchema,
  DRIP_QUADRANTS, VALUE_TIERS, RECOMMENDATIONS, HIRE_ROLES, REVENUE_PROXIMITY,
} from '@/lib/agent/schema';

// ... existing describe blocks unchanged ...

describe('revenueProximity field', () => {
  const base = {
    task: 't', hoursPerWeek: 1, costToDelegate: 1, valueTier: '$10' as const,
    dripQuadrant: 'Delegate' as const, recommendation: 'delegate' as const, rationale: 'r',
  };
  const summary = { firstHireRole: 'admin' as const, firstHireJustification: 'j' };

  it('accepts a valid revenueProximity', () => {
    const ok = AnalysisResultSchema.safeParse({
      items: [{ ...base, revenueProximity: 'revenue-direct' }], summary,
    });
    expect(ok.success).toBe(true);
  });
  it('accepts an item WITHOUT revenueProximity (back-compat with pre-0005 data)', () => {
    const ok = AnalysisResultSchema.safeParse({ items: [base], summary });
    expect(ok.success).toBe(true);
  });
  it('rejects an out-of-vocabulary revenueProximity', () => {
    const bad = AnalysisResultSchema.safeParse({
      items: [{ ...base, revenueProximity: 'kinda' }], summary,
    });
    expect(bad.success).toBe(false);
  });
  it('tool JSON schema requires revenueProximity on fresh output', () => {
    const req = analysisToolJsonSchema.properties.items.items.required as readonly string[];
    expect(req).toContain('revenueProximity');
  });
  it('tool JSON schema revenueProximity enum matches the vocab', () => {
    expect(analysisToolJsonSchema.properties.items.items.properties.revenueProximity.enum)
      .toEqual([...REVENUE_PROXIMITY]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/agent/schema.test.ts`
Expected: FAIL — `REVENUE_PROXIMITY` is not exported / field absent.

- [ ] **Step 3: Add the vocab to `lib/buyback/types.ts`**

After the `RECOMMENDATIONS` block, add:

```ts
export const REVENUE_PROXIMITY = ['revenue-direct', 'revenue-adjacent', 'non-revenue'] as const;
export type RevenueProximity = (typeof REVENUE_PROXIMITY)[number];
```

In `interface ScoredItem`, add the optional field (keep it last):

```ts
export interface ScoredItem extends TaskInput {
  valueTier: ValueTier;
  dripQuadrant: DripQuadrant;
  recommendation: Recommendation;
  rationale: string;
  revenueProximity?: RevenueProximity;
}
```

- [ ] **Step 4: Wire it through `lib/agent/schema.ts`**

Update the import + re-export:

```ts
import { DRIP_QUADRANTS, VALUE_TIERS, RECOMMENDATIONS, REVENUE_PROXIMITY } from '@/lib/buyback/types';
export { DRIP_QUADRANTS, VALUE_TIERS, RECOMMENDATIONS, REVENUE_PROXIMITY };
```

Add the optional field to `ScoredItemSchema` (after `rationale`):

```ts
  rationale: z.string().min(1),
  revenueProximity: z.enum(REVENUE_PROXIMITY).optional(),
```

In `analysisToolJsonSchema`, add the property and mark it **required** (force fresh output):

```ts
          rationale: { type: 'string' },
          revenueProximity: { type: 'string', enum: [...REVENUE_PROXIMITY] },
        },
        required: ['task', 'hoursPerWeek', 'costToDelegate', 'valueTier', 'dripQuadrant', 'recommendation', 'rationale', 'revenueProximity'],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run __tests__/agent/schema.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/buyback/types.ts lib/agent/schema.ts __tests__/agent/schema.test.ts
git commit -m "feat: add revenueProximity to the classification contract"
```

---

## Task C2: Pure revenue + buyback-rate math

**Files:**
- Create: `lib/buyback/revenue.ts`
- Modify: `lib/buyback/rate.ts`
- Test: `__tests__/buyback/revenue.test.ts`

**Interfaces:**
- Consumes: `ScoredItem`, `RevenueProximity`, `ValueTier` from `lib/buyback/types`.
- Produces:
  - `revenueHourRollup(items): { 'revenue-direct': number; 'revenue-adjacent': number; 'non-revenue': number; unknown: number }`
  - `soldVsBuilt(items): { revenueDirect: number; other: number }`
  - `revenueCaution(items, opts: { isAtRevenue: boolean }): { message: string } | null`
  - `buybackHourlyRate(annualIncome: number): number`
  - `tierDollars(tier: ValueTier): number`
  - `isAboveBuybackRate(item: ScoredItem, hourlyRate: number): boolean`

- [ ] **Step 1: Write the failing test** — `__tests__/buyback/revenue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  revenueHourRollup, soldVsBuilt, revenueCaution,
} from '@/lib/buyback/revenue';
import { buybackHourlyRate, tierDollars, isAboveBuybackRate } from '@/lib/buyback/rate';
import type { ScoredItem } from '@/lib/buyback/types';

function item(p: Partial<ScoredItem>): ScoredItem {
  return {
    task: 't', hoursPerWeek: 1, costToDelegate: 0,
    valueTier: '$100', dripQuadrant: 'Invest', recommendation: 'keep', rationale: 'r',
    ...p,
  };
}

describe('revenueHourRollup', () => {
  it('buckets hours by proximity and counts missing as unknown', () => {
    const r = revenueHourRollup([
      item({ hoursPerWeek: 3, revenueProximity: 'revenue-direct' }),
      item({ hoursPerWeek: 2, revenueProximity: 'non-revenue' }),
      item({ hoursPerWeek: 1 }), // no proximity
    ]);
    expect(r['revenue-direct']).toBe(3);
    expect(r['non-revenue']).toBe(2);
    expect(r.unknown).toBe(1);
  });
});

describe('soldVsBuilt', () => {
  it('splits revenue-direct hours from everything else', () => {
    const r = soldVsBuilt([
      item({ hoursPerWeek: 4, revenueProximity: 'revenue-direct' }),
      item({ hoursPerWeek: 6, revenueProximity: 'non-revenue' }),
      item({ hoursPerWeek: 2, revenueProximity: 'revenue-adjacent' }),
    ]);
    expect(r.revenueDirect).toBe(4);
    expect(r.other).toBe(8);
  });
});

describe('revenueCaution', () => {
  const crowded = [
    item({ hoursPerWeek: 10, dripQuadrant: 'Invest', revenueProximity: 'non-revenue' }),
    item({ hoursPerWeek: 2, dripQuadrant: 'Produce', revenueProximity: 'revenue-direct' }),
  ];
  it('fires when non-revenue Invest/Produce hours meet or exceed revenue-direct hours', () => {
    expect(revenueCaution(crowded, { isAtRevenue: false })).not.toBeNull();
  });
  it('is sharper for pre-revenue users', () => {
    const pre = revenueCaution(crowded, { isAtRevenue: false })!.message;
    const post = revenueCaution(crowded, { isAtRevenue: true })!.message;
    expect(pre).not.toEqual(post);
    expect(pre.toLowerCase()).toContain('revenue');
  });
  it('stays silent when revenue-direct hours dominate', () => {
    const healthy = [
      item({ hoursPerWeek: 10, dripQuadrant: 'Produce', revenueProximity: 'revenue-direct' }),
      item({ hoursPerWeek: 1, dripQuadrant: 'Invest', revenueProximity: 'non-revenue' }),
    ];
    expect(revenueCaution(healthy, { isAtRevenue: false })).toBeNull();
  });
  it('stays silent when no items carry proximity (old data)', () => {
    expect(revenueCaution([item({ hoursPerWeek: 5 })], { isAtRevenue: false })).toBeNull();
  });
});

describe('buyback-rate math', () => {
  it('buybackHourlyRate = income / 2000 / 4', () => {
    expect(buybackHourlyRate(200_000)).toBe(25); // 200000/2000=100, /4=25
  });
  it('tierDollars maps the ladder', () => {
    expect(tierDollars('$10')).toBe(10);
    expect(tierDollars('$10000')).toBe(10_000);
  });
  it('isAboveBuybackRate compares the work-value tier to the rate', () => {
    expect(isAboveBuybackRate(item({ valueTier: '$10' }), 25)).toBe(false);
    expect(isAboveBuybackRate(item({ valueTier: '$100' }), 25)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/buyback/revenue.test.ts`
Expected: FAIL — modules/exports do not exist.

- [ ] **Step 3: Implement `lib/buyback/revenue.ts`**

```ts
import type { ScoredItem, RevenueProximity } from './types';

type RevenueRollup = Record<RevenueProximity, number> & { unknown: number };

// Hours by revenue-proximity. Items with no proximity (pre-0005 data, or a model
// miss) are counted as `unknown` so they are never silently miscategorised.
export function revenueHourRollup(items: ScoredItem[]): RevenueRollup {
  const r: RevenueRollup = {
    'revenue-direct': 0, 'revenue-adjacent': 0, 'non-revenue': 0, unknown: 0,
  };
  for (const i of items) {
    const key = i.revenueProximity ?? 'unknown';
    r[key] += i.hoursPerWeek;
  }
  return r;
}

// The single most useful line for a founder: hours that move money vs everything
// else. `other` deliberately includes adjacent, non-revenue, AND unknown.
export function soldVsBuilt(items: ScoredItem[]): { revenueDirect: number; other: number } {
  const total = items.reduce((s, i) => s + i.hoursPerWeek, 0);
  const revenueDirect = revenueHourRollup(items)['revenue-direct'];
  return { revenueDirect, other: total - revenueDirect };
}

// Caution: non-revenue "keep" time (Invest/Produce) crowding out selling. Fires
// when non-revenue Invest+Produce hours >= revenue-direct hours AND at least one
// item carries proximity (so old data stays silent). Sharper for pre-revenue.
const KEEP_QUADRANTS = new Set(['Invest', 'Produce']);
export function revenueCaution(
  items: ScoredItem[],
  opts: { isAtRevenue: boolean },
): { message: string } | null {
  const anyTagged = items.some((i) => i.revenueProximity != null);
  if (!anyTagged) return null;

  const nonRevenueKeep = items
    .filter((i) => i.revenueProximity === 'non-revenue' && KEEP_QUADRANTS.has(i.dripQuadrant))
    .reduce((s, i) => s + i.hoursPerWeek, 0);
  const revenueDirect = revenueHourRollup(items)['revenue-direct'];

  if (nonRevenueKeep < revenueDirect || nonRevenueKeep === 0) return null;

  const message = opts.isAtRevenue
    ? `${nonRevenueKeep} hrs/wk of non-revenue Invest and Produce work outweighs your ${revenueDirect} hrs of revenue-direct work. Protect the build time only if it compounds; otherwise shift hours toward what sells.`
    : `You are pre-revenue and ${nonRevenueKeep} hrs/wk sit in non-revenue Invest and Produce work while only ${revenueDirect} hrs go to revenue-direct work. Before consistent revenue, build time is deferrable, not sacred. Move hours toward selling.`;
  return { message };
}
```

- [ ] **Step 4: Add rate math to `lib/buyback/rate.ts`** (append; keep `buybackRate` unchanged):

```ts
import type { ScoredItem, DripQuadrant, ValueTier } from './types';

// ... existing LOW_VALUE + buybackRate unchanged ...

// The TRUE Buyback Rate (Martell): effective hourly (annual income / ~2000 full-
// time hours) quartered. Delegate everything whose work-value falls below it.
export function buybackHourlyRate(annualIncome: number): number {
  if (!Number.isFinite(annualIncome) || annualIncome <= 0) return 0;
  return Math.round(annualIncome / 2000 / 4);
}

const TIER_DOLLARS: Record<ValueTier, number> = {
  $10: 10, $100: 100, $1000: 1000, $10000: 10000,
};
export function tierDollars(tier: ValueTier): number {
  return TIER_DOLLARS[tier];
}

// A task is "above your rate" (keep) when the value its work creates per hour is
// at or above your Buyback Rate; below it, hand it off.
export function isAboveBuybackRate(item: ScoredItem, hourlyRate: number): boolean {
  return tierDollars(item.valueTier) >= hourlyRate;
}
```

> Note: the `import` line in `rate.ts` currently reads `import type { ScoredItem, DripQuadrant } from './types';` — widen it to add `ValueTier` rather than adding a second import.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run __tests__/buyback/revenue.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/buyback/revenue.ts lib/buyback/rate.ts __tests__/buyback/revenue.test.ts
git commit -m "feat: pure revenue-proximity rollups + real Buyback Rate math"
```

---

## Task C3: Teach the analyze prompt to score revenue-proximity

**Files:**
- Modify: `lib/agent/prompts.ts`
- Test: `__tests__/agent/prompts.test.ts` (create if absent; else append)

**Interfaces:**
- Consumes: nothing new. Produces: no signature change — `ANALYZE_SYSTEM` and `buildAnalyzeUserContent` gain revenue-proximity content.

- [ ] **Step 1: Write the failing test** — `__tests__/agent/prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ANALYZE_SYSTEM, buildAnalyzeUserContent } from '@/lib/agent/prompts';

describe('ANALYZE_SYSTEM revenue-proximity', () => {
  it('defines all three revenue-proximity tags', () => {
    for (const tag of ['revenue-direct', 'revenue-adjacent', 'non-revenue']) {
      expect(ANALYZE_SYSTEM).toContain(tag);
    }
  });
  it('states proximity is independent of DRIP', () => {
    expect(ANALYZE_SYSTEM.toLowerCase()).toContain('independent');
  });
});

describe('buildAnalyzeUserContent', () => {
  it('asks for a revenue-proximity tag on every row', () => {
    const content = buildAnalyzeUserContent([{ task: 'Sales calls', hoursPerWeek: 6, costToDelegate: 150 }]);
    expect(content.toLowerCase()).toContain('revenue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/agent/prompts.test.ts`
Expected: FAIL — proximity content absent.

- [ ] **Step 3: Add the revenue-proximity block to `ANALYZE_SYSTEM`**

Insert this block after the Value-ladder section and before "Keep / delegate / eliminate":

```
Revenue proximity — assign exactly one to each task. This is INDEPENDENT of the DRIP quadrant:
a task can be high-value Invest work and still be non-revenue. Judge only how directly the work
moves money in the door:
- revenue-direct: the work directly creates or closes revenue (sales calls, outbound, proposals,
  demos, collecting payment, renewals).
- revenue-adjacent: the work supports revenue but does not itself close it (marketing content,
  lead nurture, onboarding, customer support that protects retention).
- non-revenue: internal build, learning, admin, or product work with no direct line to revenue
  this week (internal tooling, training, bookkeeping, roadmap).
```

Add one line to the `Rules:` list:

```
- Assign revenueProximity to EVERY task, judged independently of the DRIP quadrant and value tier.
```

- [ ] **Step 4: Add the instruction to `buildAnalyzeUserContent`**

Change the instruction sentence to name proximity:

```ts
  return `Here is the founder's task audit for the week (${items.length} task${
    items.length === 1 ? '' : 's'
  }). Score every row into a DRIP quadrant, a value tier, a revenue-proximity tag, and a
keep/delegate/eliminate recommendation, then recommend the first hire.

${rows}`;
```

- [ ] **Step 5: Run tests + typecheck + full suite**

Run: `npx vitest run __tests__/agent/prompts.test.ts && npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/agent/prompts.ts __tests__/agent/prompts.test.ts
git commit -m "feat: score revenue-proximity in the analyze prompt"
```

- [ ] **Step 7: Gate-3 eval (operator, live API — do NOT auto-run)**

STOP. The classification contract changed. The operator runs `npm run eval` (live `claude-sonnet-5`, real spend) and confirms the fixture sanity table still passes AND that `revenueProximity` now appears on every scored item. Only proceed to render/persist tasks once the operator confirms the eval is green. If `evals/run.ts` structurally validates items, it already covers the new optional field; if it asserts required fields, extend it to assert `revenueProximity` is present.

---

## Task C4: Persist revenue-proximity + audit context

**Files:**
- Create: `supabase/migrations/0005_revenue_context.sql`
- Modify: `lib/db/types.ts`
- Modify: `lib/db/audits.ts`
- Modify: `docs/architecture/migrations.md`
- Test: none new (typecheck-gated; RLS unchanged — verification is the isolation note, not a unit test)

**Interfaces:**
- Produces: `AuditItemRow.revenue_proximity`, `AuditRow.{is_at_revenue,annual_income,team,tool_budget}`, `type AuditMeta`, `createAudit(workspaceId, title, items, summary?, meta?)`.

- [ ] **Step 1: Write the migration** — `supabase/migrations/0005_revenue_context.sql`:

```sql
-- 0005_revenue_context.sql
-- Persist (a) the model's per-task revenue-proximity judgment and (b) the audit-
-- level context the founder supplies (revenue stage, income for the Buyback Rate,
-- team + tool budget for SOP fit).
--
-- ADDITIVE, NULLABLE columns only. NO RLS CHANGE: RLS on audits/audit_items is
-- enabled and policed by 0002_rls.sql (audits_all / audit_items_all key off
-- is_workspace_member on the row's workspace_id). Column-level grants are not
-- used, so the existing row-level policies already gate reads/writes of these new
-- columns. Cross-workspace isolation is therefore unaffected; existing rows keep
-- NULL (no backfill).

alter table audit_items add column revenue_proximity text;

alter table audits add column is_at_revenue boolean;
alter table audits add column annual_income numeric;
alter table audits add column team text;
alter table audits add column tool_budget text;
```

- [ ] **Step 2: Apply it to the local DB and confirm the columns land**

Run:
```bash
supabase migration up
docker exec -i supabase_db_buyback-agent psql -U postgres -d postgres -c "\d+ audit_items" -c "\d+ audits"
```
Expected: `revenue_proximity` on `audit_items`; `is_at_revenue`/`annual_income`/`team`/`tool_budget` on `audits`. (If the local stack is down, `supabase start` first — do NOT stop the `pgc-league-ops` / `boquete-business-directory` stacks.)

- [ ] **Step 3: Extend the row types in `lib/db/types.ts`**

`AuditItemRow` gains:
```ts
  rationale: string | null;
  revenue_proximity: string | null;
```
`AuditRow` gains (after `first_hire_justification`):
```ts
  is_at_revenue: boolean | null;
  annual_income: number | null;
  team: string | null;
  tool_budget: string | null;
```
Add the audit-meta input type at the end of the file:
```ts
// Audit-level context the founder supplies at analyze time. All optional; persisted
// on the audit row and consumed by the revenue summary, Buyback Rate, and SOP prompt.
export interface AuditMeta {
  isAtRevenue?: boolean;
  annualIncome?: number;
  team?: 'solo' | 'has-team';
  toolBudget?: 'none' | 'some';
}
```

- [ ] **Step 4: Map the columns in `lib/db/audits.ts`**

`rowToScoredItem` gains one line (optional passthrough — null becomes undefined):
```ts
    rationale: row.rationale,
    revenueProximity: row.revenue_proximity ?? undefined,
```
`createAudit` signature + inserts:
```ts
export async function createAudit(
  workspaceId: string,
  title: string,
  items: ScoredItem[],
  summary?: AnalysisSummary,
  meta?: AuditMeta,
): Promise<AuditWithItems> {
```
Audit insert `.insert({...})` gains:
```ts
      first_hire_justification: summary?.firstHireJustification ?? null,
      is_at_revenue: meta?.isAtRevenue ?? null,
      annual_income: meta?.annualIncome ?? null,
      team: meta?.team ?? null,
      tool_budget: meta?.toolBudget ?? null,
```
Item insert `itemRows` gains:
```ts
      rationale: item.rationale,
      revenue_proximity: item.revenueProximity ?? null,
```
Import `AuditMeta` in the `./types` import line.

- [ ] **Step 5: Write the isolation note in `docs/architecture/migrations.md`**

Add a `0005_revenue_context.sql` catalog entry mirroring the 0004 entry: additive nullable columns, NO RLS change, existing row-level policies already gate the new columns, cross-workspace isolation unaffected, no backfill. State explicitly that no new table/policy was introduced so the deny-all and membership checks from 0002/0003 are untouched.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit** (migration + mapping + doc in one logical change)

```bash
git add supabase/migrations/0005_revenue_context.sql lib/db/types.ts lib/db/audits.ts docs/architecture/migrations.md
git commit -m "feat: persist revenue-proximity + audit context (migration 0005)"
```

---

## Task C5: Thread audit context through the persist action

**Files:**
- Modify: `app/app/actions.ts`
- Test: none new (server action; covered by typecheck + the form integration)

**Interfaces:**
- Consumes: `AuditMeta`. Produces: `persistAudit(workspaceId, title, result, meta?)`.

- [ ] **Step 1: Add a Zod validator + widen `persistAudit`**

In `app/app/actions.ts`, add after the existing imports:
```ts
import type { AuditMeta } from '@/lib/db/types';

const AuditMetaSchema = z.object({
  isAtRevenue: z.boolean().optional(),
  annualIncome: z.number().positive().max(100_000_000).optional(),
  team: z.enum(['solo', 'has-team']).optional(),
  toolBudget: z.enum(['none', 'some']).optional(),
}).optional();
```
Widen the function (validate the untrusted client meta before persisting):
```ts
export async function persistAudit(
  workspaceId: string,
  title: string,
  result: unknown,
  meta?: unknown,
): Promise<string> {
  const parsed = AnalysisResultSchema.parse(result);
  const parsedMeta: AuditMeta | undefined = AuditMetaSchema.parse(meta);
  const audit = await createAudit(
    workspaceId,
    resolveAuditTitle(title),
    parsed.items,
    parsed.summary,
    parsedMeta,
  );
  revalidatePath('/app');
  return audit.id;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/app/actions.ts
git commit -m "feat: persistAudit accepts validated audit context meta"
```

---

## Task C6: Audit-context inputs on the new-audit form

**Files:**
- Modify: `app/app/new-audit-form.tsx`
- Modify: `app/globals.css` (reuse `signin-*` / `af-*` classes where possible; add `af-context` group class if needed)
- Test: none new (client component; verified live in Task C9)

**Interfaces:**
- Consumes: `persistAudit(..., meta)`. Produces: form collects `isAtRevenue`, `annualIncome?`, `team`, `toolBudget`.

- [ ] **Step 1: Add form state** (after the `rows` state):

```ts
const [isAtRevenue, setIsAtRevenue] = useState<'yes' | 'no'>('no');
const [annualIncome, setAnnualIncome] = useState('');
const [team, setTeam] = useState<'solo' | 'has-team'>('solo');
const [toolBudget, setToolBudget] = useState<'none' | 'some'>('none');
```

- [ ] **Step 2: Build the meta object and pass it to `persistAudit`**

In `onSubmit`, before the persist call, assemble validated-shaped meta:
```ts
const income = annualIncome.trim() === '' ? undefined : Number(annualIncome);
const meta = {
  isAtRevenue: isAtRevenue === 'yes',
  annualIncome: Number.isFinite(income) && (income ?? 0) > 0 ? income : undefined,
  team,
  toolBudget,
};
// ...
const id = await persistAudit(workspaceId, title, outcome.result, meta);
```

- [ ] **Step 3: Render the inputs** — add a context block above the submit row (`af-actions`). Radios for revenue stage / team / tool budget; a number input for income. Use existing `signin-label` / `signin-input` classes; group with a new `af-context` wrapper (add the wrapper's layout rules to `globals.css`, no inline styles). Representative JSX:

```tsx
<fieldset className="af-context">
  <legend className="signin-label">About your business</legend>
  <label className="signin-label">Are you at consistent revenue yet?</label>
  <div className="af-radios">
    <label><input type="radio" name="rev" checked={isAtRevenue === 'no'} onChange={() => setIsAtRevenue('no')} /> Not yet</label>
    <label><input type="radio" name="rev" checked={isAtRevenue === 'yes'} onChange={() => setIsAtRevenue('yes')} /> Yes</label>
  </div>

  <label className="signin-label" htmlFor="income">Your target annual income (optional)</label>
  <input id="income" className="signin-input" type="number" min="0" step="1000" inputMode="decimal"
    placeholder="e.g. 200000" value={annualIncome} onChange={(e) => setAnnualIncome(e.target.value)} />

  <label className="signin-label">Team</label>
  <div className="af-radios">
    <label><input type="radio" name="team" checked={team === 'solo'} onChange={() => setTeam('solo')} /> Solo</label>
    <label><input type="radio" name="team" checked={team === 'has-team'} onChange={() => setTeam('has-team')} /> Have a team</label>
  </div>

  <label className="signin-label">Paid tool budget</label>
  <div className="af-radios">
    <label><input type="radio" name="tools" checked={toolBudget === 'none'} onChange={() => setToolBudget('none')} /> None / free tools</label>
    <label><input type="radio" name="tools" checked={toolBudget === 'some'} onChange={() => setToolBudget('some')} /> Some budget</label>
  </div>
</fieldset>
```

- [ ] **Step 4: Add `.af-context` / `.af-radios` layout to `globals.css`** (spacing + flex row for radios; match the form's existing rhythm). No inline styles.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/app/new-audit-form.tsx app/globals.css
git commit -m "feat: collect revenue stage, income, team, and tool budget on the audit form"
```

---

## Task C7: Render the revenue summary, caution, and $/hr Buyback Rate

**Files:**
- Create: `components/RevenueSummary.tsx`
- Modify: `components/BuybackRate.tsx`
- Modify: `components/AuditTable.tsx`
- Modify: `app/demo/page.tsx`, `app/app/audit/[id]/page.tsx`
- Modify: `app/globals.css`
- Test: none new (presentational; math is unit-tested in C2)

**Interfaces:**
- Consumes: `soldVsBuilt`, `revenueCaution` from `lib/buyback/revenue`; `buybackHourlyRate`, `isAboveBuybackRate` from `lib/buyback/rate`.
- Produces: `RevenueSummary({ items, isAtRevenue, annualIncome? })`.

- [ ] **Step 1: Create `components/RevenueSummary.tsx`** (presentational; no dashes in copy):

```tsx
import type { ScoredItem } from "@/lib/buyback/types";
import { soldVsBuilt, revenueCaution } from "@/lib/buyback/revenue";

// The sold-vs-built one-liner plus a caution when non-revenue "keep" time crowds
// out selling. Both come from lib/buyback (pure). Renders nothing when there is
// no proximity data (old audits) and no caution.
export function RevenueSummary({
  items,
  isAtRevenue,
}: {
  items: (ScoredItem & { id?: string })[];
  isAtRevenue: boolean;
}) {
  const { revenueDirect, other } = soldVsBuilt(items);
  const caution = revenueCaution(items, { isAtRevenue });
  const anyTagged = items.some((i) => i.revenueProximity != null);
  if (!anyTagged) return null;

  return (
    <div className="rev-summary">
      <p className="rev-line">
        <b className="tnum">{revenueDirect} hrs/wk</b> on revenue-direct work,{" "}
        <b className="tnum">{other} hrs/wk</b> on everything else.
      </p>
      {caution ? (
        <div className="rev-caution" role="note">
          <span className="rev-caution-badge">Heads up</span>
          <p>{caution.message}</p>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add the optional $/hr Buyback Rate to `BuybackRate.tsx`**

Add `annualIncome?: number` to the props. When present and > 0, compute `buybackHourlyRate(annualIncome)` and render it as a third `stat` in the `stat-2`/`stat` block (rename container to allow three stats via CSS, or add a `rate-buyback` line under `rate-def`). Representative addition below the reclaimable stat:

```tsx
import { buybackHourlyRate } from "@/lib/buyback/rate";
// ...
const hourly = annualIncome && annualIncome > 0 ? buybackHourlyRate(annualIncome) : null;
// ... inside the panel, after the definition paragraph:
{hourly ? (
  <p className="rate-buyback">
    Your Buyback Rate is <b className="tnum">${hourly}/hr</b>. Delegate anything whose work is worth less than that.
  </p>
) : null}
```

(Callers that do not pass `annualIncome` are unaffected — the line is omitted.)

- [ ] **Step 3: Add a Revenue chip column to `AuditTable.tsx`**

Add a `Revenue` header after `DRIP` and a cell rendering `it.revenueProximity` as a chip (fall back to a muted dash-free "—"? use "n/a" text to avoid a dash) when absent:

```tsx
<th>Revenue</th>
// ...
<td>
  {it.revenueProximity ? (
    <span className={`rchip r--${it.revenueProximity}`}>{it.revenueProximity}</span>
  ) : (
    <span className="rchip r--unknown">not scored</span>
  )}
</td>
```

- [ ] **Step 4: Mount `RevenueSummary` + pass income**

In `app/demo/page.tsx` `Dashboard`, add a section after the reclaimable-time section with `<RevenueSummary items={items} isAtRevenue={false} />` (demo assumption: pre-revenue). Demo `BuybackRate` gets no `annualIncome` (omit the $/hr line).

In `app/app/audit/[id]/page.tsx`, after the reclaimable-time section add `<RevenueSummary items={items} isAtRevenue={audit.is_at_revenue ?? false} />`, and pass `annualIncome={audit.annual_income ?? undefined}` to `BuybackRate`.

- [ ] **Step 5: Add classes to `globals.css`** — `.rev-summary`, `.rev-line`, `.rev-caution` (warm caution treatment, honest not alarmist), `.rev-caution-badge`, `.rate-buyback`, `.rchip` + `.r--revenue-direct` / `.r--revenue-adjacent` / `.r--non-revenue` / `.r--unknown` (reuse the DRIP chip pattern + palette tokens from design-system.md; both themes). No inline styles.

- [ ] **Step 6: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/RevenueSummary.tsx components/BuybackRate.tsx components/AuditTable.tsx app/demo/page.tsx "app/app/audit/[id]/page.tsx" app/globals.css
git commit -m "feat: render sold-vs-built, revenue caution, and the real Buyback Rate"
```

---

## Task C8: Extend the markdown export

**Files:**
- Modify: `lib/export.ts`
- Test: `__tests__/export.test.ts`

**Interfaces:**
- Consumes: `soldVsBuilt`, `buybackHourlyRate` (+ audit meta off `AuditWithItems`). Produces: extended `auditToMarkdown` output.

- [ ] **Step 1: Write the failing test** — add cases to `__tests__/export.test.ts`:

```ts
it('renders the sold-vs-built line when proximity is present', () => {
  const md = auditToMarkdown(AUDIT_WITH_PROXIMITY, SOPS);
  expect(md).toMatch(/revenue-direct/i);
});
it('renders the Buyback Rate line when annual_income is set', () => {
  const md = auditToMarkdown(AUDIT_WITH_INCOME, SOPS); // annual_income: 200000
  expect(md).toContain('$25/hr'); // 200000/2000/4
});
```

(Define `AUDIT_WITH_PROXIMITY` / `AUDIT_WITH_INCOME` off the existing `AUDIT` fixture with `items[].revenueProximity` and `annual_income` set. Reuse the existing fixture shape.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/export.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `auditToMarkdown`, after the reclaimable-time line, add the sold-vs-built line and (conditionally) the Buyback Rate line:

```ts
import { soldVsBuilt } from '@/lib/buyback/revenue';
import { buybackHourlyRate } from '@/lib/buyback/rate';
// ...
const anyTagged = items.some((i) => i.revenueProximity != null);
if (anyTagged) {
  const { revenueDirect, other } = soldVsBuilt(items);
  lines.push(`**Sold vs built:** ${revenueDirect} hrs/wk revenue-direct, ${other} hrs/wk everything else.`, '');
}
const income = audit.annual_income;
if (income != null && income > 0) {
  lines.push(`**Buyback Rate:** $${buybackHourlyRate(income)}/hr (delegate work worth less than this).`, '');
}
```

Add a `Revenue` column to the ledger table (header + separator + each row's `it.revenueProximity ?? 'not scored'`).

- [ ] **Step 4: Run test + full suite**

Run: `npx vitest run __tests__/export.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts __tests__/export.test.ts
git commit -m "feat: sold-vs-built, Buyback Rate, and revenue column in the export"
```

---

## Task B1: De-stack the SOP prompt + make it team/tool-budget aware (Tier B, #4/#5)

**Files:**
- Modify: `lib/agent/prompts.ts` (`SOP_SYSTEM`, `buildSopUserContent`)
- Modify: `app/api/sop/route.ts` (accept structured `team`/`toolBudget`)
- Modify: `app/app/audit/[id]/sop-panel.tsx` (send them from the persisted audit)
- Modify: `app/app/audit/[id]/page.tsx` (pass `audit.team` / `audit.tool_budget` to `SopPanel`)
- Test: `__tests__/agent/prompts.test.ts` (append)

**Interfaces:**
- Produces: `buildSopUserContent(item, context, opts?: { team?: 'solo'|'has-team'; toolBudget?: 'none'|'some' })`; `SopRequestSchema` gains optional `team`/`toolBudget`.

- [ ] **Step 1: Write the failing test** — append to `__tests__/agent/prompts.test.ts`:

```ts
import { SOP_SYSTEM, buildSopUserContent } from '@/lib/agent/prompts';

describe('SOP prompt fit', () => {
  it('does not hardcode a funded stack or a volume/pricing philosophy', () => {
    const s = SOP_SYSTEM.toLowerCase();
    for (const banned of ['apollo', 'hubspot', 'pipedrive', 'sales navigator', 'neverbounce']) {
      expect(s).not.toContain(banned);
    }
  });
  it('adapts to a solo / no-budget operator', () => {
    const content = buildSopUserContent(
      { task: 'Cold outreach', hoursPerWeek: 5, costToDelegate: 30, valueTier: '$100', dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'r' },
      '',
      { team: 'solo', toolBudget: 'none' },
    );
    expect(content.toLowerCase()).toContain('solo');
    expect(content.toLowerCase()).toMatch(/free|no paid|no budget/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/agent/prompts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `SOP_SYSTEM` to be method- and stack-agnostic**

Replace the tool/volume assumptions with explicit neutrality:

```
Requirements:
- Describe the delegatable MECHANICS of the task, not a sales or growth philosophy. Do not
  prescribe a specific outreach volume, a lead-list size, or a multi-tier pricing structure unless
  the task description itself calls for one.
- Do NOT assume a funded tool stack or an existing team. Never invent specific paid products. When
  a tool is genuinely required, name the CATEGORY (for example "a spreadsheet", "an email client")
  and prefer free or AI-native options.
- toolsNeeded: list only tools the task truly requires, matched to the founder's stated budget.
```

(Keep the purpose/steps/definitionOfDone bullets.)

- [ ] **Step 4: Make `buildSopUserContent` context-aware**

```ts
export function buildSopUserContent(
  item: TaskInput,
  context: string,
  opts?: { team?: 'solo' | 'has-team'; toolBudget?: 'none' | 'some' },
): string {
  const team = opts?.team === 'has-team' ? 'The founder has a small team.' : 'The founder works solo.';
  const budget = opts?.toolBudget === 'some'
    ? 'They have some budget for paid tools.'
    : 'They have no budget for paid tools; prefer free or AI-native options.';
  return `Write a delegation SOP for this task the founder is transferring:

Task: "${item.task}"
Time it currently takes the founder: ${item.hoursPerWeek} hrs/week
Cost to delegate: $${item.costToDelegate}/hr

Operator context: ${team} ${budget}

Additional context about how the founder does it today:
${context}`;
}
```

- [ ] **Step 5: Update `generateSOP` + the SOP route to forward the options**

`lib/agent/sop.ts` `generateSOP(item, workspaceContext, caller)` gains an `opts` param forwarded to `buildSopUserContent`. `app/api/sop/route.ts`: extend `SopRequestSchema` with `team: z.enum(['solo','has-team']).optional()` and `toolBudget: z.enum(['none','some']).optional()`, and pass `{ team, toolBudget }` into `generateSOP`. `sop-panel.tsx`: include `team`/`toolBudget` (props from the audit page) in the POST body. `audit/[id]/page.tsx`: pass `team={audit.team as ...}` / `toolBudget={audit.tool_budget as ...}` to `SopPanel`.

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `npx vitest run __tests__/agent/prompts.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/agent/prompts.ts lib/agent/sop.ts app/api/sop/route.ts app/app/audit/\[id\]/sop-panel.tsx app/app/audit/\[id\]/page.tsx __tests__/agent/prompts.test.ts
git commit -m "feat: SOPs fit team + tool budget, drop funded-stack defaults"
```

---

## Task C9: Integration verification + Gate

**Files:** none (verification + docs).

- [ ] **Step 1: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all green. Read the actual output.

- [ ] **Step 2: Live smoke (authed, local)** — sign in locally, run a real audit with income + pre-revenue + solo/no-budget set, confirm: revenueProximity appears per task; the caution renders when non-revenue Invest/Produce crowds out revenue-direct; the $/hr Buyback Rate shows; a generated SOP references only free/owned tools and no invented stack; the export carries the new lines + column.

- [ ] **Step 3: Confirm the demo path still parses** — hit `/demo`; the existing cache row lacks `revenueProximity` but the optional schema tolerates it (no error event). The next live demo re-caches with proximity present.

- [ ] **Step 4: Update docs** — `docs/CHANGELOG.md` (one entry per committed task, with commit refs) and the local task ledger (mark each task DONE with its commit). Update `docs/architecture/file-map.md` if it enumerates components (add `RevenueSummary`, migration 0005).

- [ ] **Step 5: Hosted migration (operator gate)** — apply 0005 to hosted Supabase: `supabase db push` (adds the nullable columns; no RLS change). Confirm `supabase migration list` shows Local + Remote both through 0005.

---

## Self-Review

- **Spec coverage:** #1/#2 shipped in Tier A (prior commit). #3 → C1 (contract) + C3 (prompt) + C2/C7 (caution) + C4 (persist). #6 → C2 (math) + C6 (input) + C7 (render) + C8 (export). #7 → C2 (`soldVsBuilt`) + C7/C8. #4/#5 → B1. Every review item maps to a task.
- **Type consistency:** `REVENUE_PROXIMITY`/`RevenueProximity` single-sourced in `lib/buyback/types`, re-exported from `lib/agent/schema` (mirrors the existing DRIP/VALUE/RECO pattern). `AuditMeta` fields (`isAtRevenue`,`annualIncome`,`team`,`toolBudget`) are identical across form → `persistAudit` → `AuditMetaSchema` → `createAudit` → row columns (`is_at_revenue`,`annual_income`,`team`,`tool_budget`). `buybackHourlyRate`/`tierDollars`/`isAboveBuybackRate` names consistent across C2/C7/C8.
- **Isolation:** new math is pure `lib/buyback`; `revenueProximity` enters the model contract only via `lib/agent`; persistence only via `lib/db`; components consume pure functions. No boundary crossed.
- **Eval gate:** only C1 + C3 touch `lib/agent` classification → Gate-3 eval sits at C3 Step 7 before any downstream render work trusts the field.
```
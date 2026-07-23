# File Map

Last updated: 2026-07-23 13:05 MST

Target structure for the full build (Phases 1-6). Not everything exists yet at
Task 1.3 — this is the map subsequent phases build against.

```
buyback-agent/
  app/
    layout.tsx, globals.css, page.tsx       # landing (public, disclaimer)
    demo/page.tsx                           # no-auth sample-data path
    app/                                    # auth'd shell
      layout.tsx, page.tsx                  # workspace home / audit list
      audit/[id]/page.tsx                   # audit detail: dashboard, ladder, SOPs
    auth/callback/route.ts                  # Supabase auth callback
    api/
      analyze/route.ts                      # SSE stream: streamAnalyzeAudit -> client
      sop/route.ts                          # generateSOP (auth required)
      export/[id]/route.ts                  # markdown export
  lib/
    agent/                                  # isolated agent module — no React/Next/Supabase imports
      schema.ts                             # Zod: AnalysisResult, ScoredItem, Summary, Ladder, Sop
      prompts.ts                            # system prompts + framework definitions
      client.ts                             # Anthropic wrapper: forced tool-use + Zod validate + 1 retry
      analyze.ts                            # analyzeAudit(items) + streamAnalyzeAudit(items)
      sop.ts                                # generateSOP(item, workspaceContext)
      index.ts                              # public surface re-exports
    buyback/                                # pure domain math — zero I/O
      types.ts                              # DripQuadrant, ValueTier, Recommendation unions
      rate.ts                               # buybackRate(items)
      rollups.ts                            # quadrantHourRollup(items), topTasksToOffload(items)
      index.ts
    guard/
      policy.ts                             # pure abuse-guard decisions (rate/budget/cache verdicts)
      index.ts
    db/                                      # only module that touches Supabase
      client.ts                             # server + browser Supabase clients (@supabase/ssr)
      audits.ts, workspaces.ts, sops.ts     # typed, RLS-aware queries
      guard.ts                              # service-role-only: demo cache/rate/budget counters
      types.ts                              # DB row types
  supabase/migrations/
    0001_init.sql                           # tables
    0002_rls.sql                            # RLS policies + membership helper
    0003_abuse_guard.sql                    # demo_cache, demo_rate, demo_budget (deny-all RLS)
  evals/
    fixtures.ts                             # fixture tasks + expected quadrant/recommendation ranges
    run.ts                                  # npm run eval harness
  __tests__/                                # unit tests (domain math, schema validation)
  docs/
    architecture/                           # this directory
    CHANGELOG.md
  .github/workflows/ci.yml                  # lint + typecheck + test on push
  .env.example
```

## Present as of Task 1.3

`app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`,
`__tests__/smoke.test.ts`, plus the config files listed in `conventions.md`.
Everything under `lib/`, `supabase/`, and `evals/` is built in later phases.

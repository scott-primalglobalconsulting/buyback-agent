# File Map

Last updated: 2026-07-31 13:24 -0500

The structure as it actually ships. Isolation rules that this layout enforces
are in `conventions.md`; every path below exists.

```
buyback-agent/
  app/
    layout.tsx                              # fonts, metadata, pre-paint theme script
    globals.css                             # design tokens + all presentational CSS
    page.tsx                                # landing (public, disclaimer)
    icon.svg                                # favicon: the DRIP 2x2 mark (vector)
    favicon.ico                             # same mark rasterised at 16/32/48 for legacy
    opengraph-image.png                     # 1200x630 link-unfurl card
    demo/page.tsx                           # no-auth sample-data path (client, SSE)
    sign-in/
      page.tsx, sign-in-form.tsx            # magic-link sign-in (public)
    app/                                    # auth'd shell — session gate in layout
      layout.tsx                            # redirects to /sign-in when no session
      page.tsx                              # workspace home / audit list
      actions.ts                            # server actions (create audit, sign out, invite)
      audit-view.ts                         # row -> view-model mapping (pure, unit tested)
      new-audit-form.tsx                    # guided 3-step audit form (client)
      invite-form.tsx                       # workspace invite (client)
      audit/[id]/
        page.tsx                            # audit detail: dashboard, ladder, SOPs
        sop-panel.tsx                       # per-task SOP generation (client)
    auth/callback/route.ts                  # Supabase auth callback + workspace bootstrap
    api/
      analyze/route.ts                      # SSE stream: streamAnalyzeAudit -> client
      sop/route.ts                          # generateSOP (auth required)
      export/[id]/route.ts                  # markdown export
  components/                               # presentational only — props in, markup out
    BuybackRate.tsx                         # reclaimable-time hero + support stats
    DripDashboard.tsx                       # DRIP 2x2 allocation grid (the signature viz)
    TopTasks.tsx                            # ranked offload list
    ReplacementLadder.tsx                   # fixed hire ladder + reasoning, one panel
    AuditTable.tsx                          # every task, scored
    RevenueSummary.tsx                      # sold-vs-built line + caution
    ThemeToggle.tsx                         # light/dark override of the OS preference
  lib/
    agent/                                  # isolated agent module — no React/Next/Supabase imports
      schema.ts                             # Zod: AnalysisResult, ScoredItem, Summary, Sop
      prompts.ts                            # system prompts + framework definitions
      client.ts                             # Anthropic wrapper: forced tool-use + Zod validate + 1 retry
      analyze.ts                            # analyzeAudit(items) + streamAnalyzeAudit(items)
      sop.ts                                # generateSOP(item, workspaceContext)
      index.ts                              # public surface re-exports
    buyback/                                # pure domain math — zero I/O
      types.ts                              # DripQuadrant, ValueTier, Recommendation unions
      rate.ts                               # buybackRate(items), buybackHourlyRate(income)
      rollups.ts                            # quadrantHourRollup(items), topTasksToOffload(items)
      revenue.ts                            # soldVsBuilt(items), revenueCaution(items)
      index.ts
    guard/
      policy.ts                             # pure abuse-guard decisions (rate/budget/cache verdicts)
      index.ts
    db/                                     # only module that touches Supabase
      client.ts, browser-client.ts          # server + browser Supabase clients (@supabase/ssr)
      session.ts                            # getSessionUserId()
      middleware.ts                         # session refresh for the proxy
      audits.ts, workspaces.ts, sops.ts     # typed, RLS-aware queries
      guard.ts                              # service-role-only: demo cache/rate/budget counters
      types.ts                              # DB row types
    export.ts                               # audit -> markdown report
    sop-markdown.ts                         # Sop -> markdown
    sample.ts                               # SAMPLE_WEEK fixture for /demo
  supabase/
    migrations/
      0001_init.sql                         # tables
      0002_rls.sql                          # RLS policies + membership helper
      0003_abuse_guard.sql                  # demo_cache, demo_rate, demo_budget (deny-all RLS)
      0004_audit_summary.sql                # persisted first-hire summary
      0005_revenue_context.sql              # revenue proximity + workspace income context
    tests/rls-isolation.sql                 # cross-workspace isolation proof (see ARCHITECTURE.md)
    templates/                              # auth emails, mirrored into the Supabase dashboard
      confirm-signup.html                   # fires for NEW addresses (every first-time visitor)
      magic-link.html                       # fires for existing addresses (returning users)
  scripts/
    validate-palette.mjs                    # contrast + colour-vision gate on globals.css
  evals/
    fixtures.ts                             # fixture tasks + expected quadrant/recommendation ranges
    run.ts                                  # npm run eval harness (live API, not in CI)
  __tests__/                                # unit tests, mirroring lib/ and app/
  docs/
    ARCHITECTURE.md                         # the system, and the RLS evidence
    CHANGELOG.md                            # per-task history
    architecture/                           # this directory: conventions, migrations, design system
    plans/, specs/                          # the build plan and design spec this was built from
  middleware.ts                             # session refresh (delegates to lib/db/middleware)
  .github/workflows/ci.yml                  # lint + typecheck + test + palette gate
  .env.example
```

## Where things are allowed to live

- Anything importing `@anthropic-ai/sdk` belongs in `lib/agent/`. Nothing else
  imports it.
- Anything importing a Supabase client belongs in `lib/db/`. Nothing else
  imports it.
- `lib/buyback/` and `lib/guard/` are pure: no I/O, no framework, fully unit
  testable. Every number rendered in the UI comes from `lib/buyback`, never from
  a component doing its own arithmetic.
- `components/` receives data as props and returns markup. It does not fetch,
  and it does not compute.

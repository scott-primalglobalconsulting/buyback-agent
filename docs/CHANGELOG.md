# Changelog

## Unreleased

### Task 5.3 — Auth, persisted audits, SOP generation, teammate invite (2026-07-23)

Built in four reviewed sub-tasks (5.3a-d), each adversarially reviewed on Opus
4.8; controller-witnessed the security/cost gates live against the local stack.

- **5.3a auth (`509aa2c`):** magic-link sign-in (`signInWithOtp`) + `app/auth/
  callback` code->session exchange + `app/app` session gate (`getUser()`-verified,
  no open redirect) + first-sign-in personal-workspace bootstrap. Sign-out revokes
  server-side. Redirect globs added to `config.toml`.
- **5.3b data layer (`b88fd21`):** migration `0004` persists the LLM summary
  (`first_hire_role`/`first_hire_justification`, additive nullable, no RLS change);
  `getAudit` now returns `audit_item` ids + summary; `AuditWithItems.items` is
  `(ScoredItem & {id})[]`. Bootstrap moved layout->callback (closes the
  concurrent double-create); session-refresh `middleware.ts` added.
- **5.3c authed flow (`76ce7aa`):** `/app` audit list + new-audit form (editable
  rows, "Load sample week") that streams the authed analysis (honest skeleton, no
  fake thinking), persists via a `persistAudit` server action that re-validates
  with `AnalysisResultSchema` (never trusts the client), and opens the persisted
  detail page (`getAudit` null -> `notFound()`, no cross-tenant leak). Title capped.
- **5.3d SOP + invite (`25046f4`, hardened `ea2f461`):** auth-gated `/api/sop`
  (401 first, so it cannot bleed the API; payload fully bounded -> `task`<=500 via
  `GUARD_LIMITS`, `rationale`/`context`<=2000 -> 413; errors hidden). Pure
  `sopToMarkdown` (TDD); per-delegate-task "Generate SOP" -> render (React-escaped,
  no `dangerouslySetInnerHTML`) -> `saveSop`. Teammate invite: owner-checked BEFORE
  the service-role email lookup (no enumeration by non-owners).
- **Controller-witnessed live (local stack):** magic-link round-trip (founder-a
  created + workspace bootstrapped, DB-confirmed); authed analyze->persist->reopen
  (14s live call, DB shows `first_hire_role=admin` + 10 items); cross-user RLS
  through the app (founder-b gets 404 on founder-a's audit); live SOP generation
  persisted (3200-char markdown keyed to the correct `audit_item`).
- Suite 64 tests green; typecheck + lint clean; `next build` compiles.

### Task 5.3b — Persist audit summary + getAudit item ids + auth hardening (2026-07-23)

- **Migration `0004_audit_summary.sql`:** additive nullable `first_hire_role` /
  `first_hire_justification` columns on `audits` to persist the LLM-judged
  first-hire recommendation for the audit-detail page (5.3c). **No RLS change** —
  the existing `audits_all` row policy (`0002_rls.sql`) already gates these
  columns; no column-level grants, no cross-workspace isolation impact. Not
  applied by the agent (DB holds live data); awaits controller apply. Catalogued
  in `docs/architecture/migrations.md`.
- **Data layer:** `AuditRow` gains the two columns. New `AuditItemWithId =
  ScoredItem & { id: string }`; `AuditWithItems.items` is now `AuditItemWithId[]`
  and carries `summary: { firstHireRole, firstHireJustification }` (both nullable
  for pre-0004 audits). `createAudit` takes an optional `summary` param
  (`AnalysisSummary`) and persists it; `getAudit` returns item ids + summary.
  `rowToScoredItem` unchanged (still the Zod domain parse) — the id is wrapped on
  after the parse, keeping `ScoredItemSchema` a pure domain shape.
- **Auth hardening (5.3a review follow-ups):** workspace bootstrap moved out of
  `app/app/layout.tsx` into `app/auth/callback/route.ts` (runs once per sign-in,
  closes the concurrent double-create window; bootstrap failure is logged, not a
  500). Added session-refresh `middleware.ts` (root) delegating to
  `lib/db/middleware.ts` (`updateSession`, canonical `@supabase/ssr` getAll/setAll
  pattern, `getUser()` refresh) with a matcher excluding Next internals + static
  assets. Supabase construction stays inside `lib/db` (isolation).
- Suite 46 tests green; typecheck + lint clean. No live-DB unit harness exists
  for the db layer (typecheck is the gate); 5.3c exercises `createAudit`/
  `getAudit` against the live DB.

### Task 5.2 — Landing + streaming demo path + presentational UI (2026-07-23)

- **Design foundation (5.2a, `eb1247d`):** `app/globals.css` token system ported
  from the approved design-direction proof — warm-neutral surfaces, the four
  dataviz-validated DRIP hues (both themes), cobalt `--accent` (chrome-only),
  sequential ramp, status colors; light default + dark via
  `@media (prefers-color-scheme)` and `:root[data-theme]`. Fonts via
  `next/font/google` (Instrument Serif / IBM Plex Sans / IBM Plex Mono) wired to
  the `--f-*` vars. Five presentational components (`DripDashboard`,
  `BuybackRate`, `TopTasks`, `ReplacementLadder`, `AuditTable`) — pure, prop-fed,
  external CSS only (no inline styles), DRIP color always paired with a text
  label. All rollup math delegated to `lib/buyback` (`quadrantHourRollup`,
  `topTasksToOffload`, `buybackRate`). **Buyback rate renders as the reclaimable
  PERCENT** (`buybackRate` returns the 0..1 Delegate+Replace share), not a dollar
  figure. Mutation-verified render tests.
- **Landing + demo (5.2b, `2b93321`):** `app/page.tsx` — what-it-is, the verbatim
  non-affiliation disclaimer, "Try with sample data" → `/demo`, "Sign in". No
  em/en dashes. `app/demo/page.tsx` (client) — POSTs to `/api/analyze`, **branches
  on status before reading the stream** (429 rate-limited / 503 unavailable /
  400-413 error / 200 event-stream), then reveals the dashboard on
  `{type:'result'}`. **Honest states:** a real shimmer skeleton (reduced-motion
  aware) during the wait, no fabricated "thinking" log.
- **Honest-states route change:** `cacheReplayStream` now emits only the validated
  `{type:'result'}` — the canned thinking replay was removed (live runs stream no
  thinking under forced `tool_choice`, so the theater was dropped). Live path,
  breaker, `decideDemo`, auth, and IP handling unchanged; cache-serve still makes
  no agent call; the covering test now asserts result-with-no-thinking.
- Controller-witnessed at Task 5.1: live compute streams a valid analysis (~14s,
  one API call) then caches; a second call serves from cache in ~71ms with no API
  call. 5.2 `/demo` verified rendering from the warm cache in light and dark.
- Suite 46 tests green; typecheck + lint clean. Reviews: 5.2a and 5.2b both
  Approved (adversarial, cost-path re-verified). Deferred polish: optional
  "today's cached sample" indicator (cache vs live is intentionally
  indistinguishable to the client under honest states).

### Task 5.1 — Sample week + guard-enforced streaming analyze route (2026-07-23)

- Added `lib/sample.ts` — `SAMPLE_WEEK: TaskInput[]`, the fixed 10-task demo
  dataset (40 hrs/wk, all four DRIP quadrants) the anonymous `/demo` path
  analyzes. Pure data (no React/Next/Supabase/Anthropic). TDD:
  `__tests__/sample.test.ts` written first and seen failing (`Cannot find
  package '@/lib/sample'`), then implemented green.
- Added `app/api/analyze/route.ts` — POST, `runtime = 'nodejs'`. Consumes
  `lib/agent`, `lib/db`, `lib/guard`, `lib/buyback` ONLY (no direct Anthropic
  or Supabase import). Auth-first: a valid session (`getSessionUserId`) →
  Zod-parse + `validatePayloadSize` the body (400/413 on reject) →
  `streamAnalyzeAudit(items)` with an `analyzeAudit` retry fallback. No session
  → ignore the body, run the guard over `SAMPLE_WEEK`: `serve_cache`/
  `breaker_serve_cache` replay a canned thinking log then emit the cached
  result (no API), `rate_limited` → 429, `unavailable` → 503, `compute_live`
  → `incrDailyLiveCount` (increment-then-check against the daily budget to
  close the concurrency overshoot), stream, then `putSampleCache`.
- SSE schema (comment at top of route; consumed by Task 5.2): `data: {json}\n\n`
  with `{type:'thinking',text}` · `{type:'result',result}` · `{type:'error',
  message}`.
- IP privacy: route hashes the client IP (`sha256(ip + SERVER_SALT)`, node
  crypto) and passes only `ipHash` to `lib/db/guard`; raw IPs never leave the
  route. Added `lib/db/session.ts` (`getSessionUserId`, `getUser`-verified) so
  the route detects auth without touching Supabase directly. Documented
  `SERVER_SALT` in `.env.example`.
- Tests: `__tests__/api/analyze.test.ts` fakes the db/agent seams to cover
  `rate_limited` (429), cache-serve (200, thinking replay + result, asserts NO
  agent call), authed over-cap (413), and malformed body (400). Suite 38
  tests, all green; typecheck + lint clean. The live `compute_live` leg is an
  operator gate — NOT exercised in CI.

### Phase 5 kickoff — design system (2026-07-23)

- Brainstormed the Phase 5 UI direction (anti-"AI slop" mandate). Operator
  decisions: (a) owned Tailwind v4 tokens + self-hosted type pairing + Lucide +
  Radix primitives à la carte (no component-kit theme) — resolves the pending
  component-library Open Decision; (b) build a design-direction Artifact proof
  before app code; (c) fully owned identity, not Martell brand trade dress
  (disclaimer stands); (d) warmer neutrals + cobalt chrome accent + tinted DRIP
  washes for more color without breaking "color means data".
- Added `docs/architecture/design-system.md` as the Phase 5 UI source of truth:
  color tokens (light/dark, cobalt `--accent` verified AA), DRIP categorical
  palette (validated via the dataviz `validate_palette.js`, both modes; CVD
  floor pair carried by direct labels + spatial buckets), sequential ramp,
  reserved status colors, Instrument Serif / IBM Plex Sans / IBM Plex Mono
  pairing, hand-built viz treatments, and the full guard-state inventory.
- Internal design-direction proof (private Artifact, not for release):
  `https://claude.ai/code/artifact/d855a59d-493a-469f-b27a-1f507eae68b9`.
- No app code or dependencies yet. Radix/Lucide install gated to Task 5.2 with
  explicit operator approval.

### Task 4.4 — Abuse-guard: pure policy + demo counters/cache (2026-07-23)

- Added `lib/guard/policy.ts` (PURE — no React/Next/Supabase/I/O/clock):
  `GUARD_LIMITS`, `DemoVerdict`, `decideDemo`, `validatePayloadSize`.
  `decideDemo` precedence (cost-bearing, `>=` against every cap): fresh cache
  → `serve_cache` (short-circuits before any rate/budget check) > per-IP cap
  → `rate_limited` > daily budget spent → `breaker_serve_cache` if any cache
  row exists else `unavailable` > `compute_live`. Re-exported via
  `lib/guard/index.ts`.
- TDD: `__tests__/guard/policy.test.ts` written first and seen failing
  (`Cannot find package '@/lib/guard/policy'`), then implemented. Suite now
  29 tests (was 21), all green; typecheck + lint clean.
- Added `supabase/migrations/0003_abuse_guard.sql`: `demo_cache`, `demo_rate`,
  `demo_budget` with **RLS enabled and ZERO policies (deny-all)** — only the
  RLS-exempt service role reaches them (no browser/logged-in scraping or
  forging). Plus two atomic `INSERT..ON CONFLICT DO UPDATE` RPCs
  (`incr_demo_rate`, `incr_daily_live_count`, `search_path = ''`) so
  concurrent `/demo` requests cannot race the rate limit or breaker.
- Added `lib/db/guard.ts` (server-only, service-role client only): the only
  guard file touching Supabase — `getSampleCache`, `putSampleCache`,
  `incrDemoRate` (via RPC), `getDailyLiveCount`, `incrDailyLiveCount` (via
  RPC). Raw IP never reaches lib/db; the route passes a pre-hashed `ipHash`.
- Applied and verified live by the controller at Gate 4: all of `0001`–`0003`
  apply cleanly; deny-all confirmed (anon/authenticated denied read + write on
  all three tables; service role full access; RPCs increment atomically).
  Evidence in `docs/ARCHITECTURE.md`.
- **Review follow-ups (controller):**
  - The counter RPCs are `SECURITY INVOKER` (not DEFINER — the initial note was
    wrong). Invoker is the safer choice: an anon/authenticated caller runs the
    INSERT as itself and is blocked, so only the service role can increment.
  - Defense-in-depth: added `REVOKE ALL ON demo_* FROM anon, authenticated` so
    the deny-all does not rely on RLS alone (anon now gets "permission denied
    for table", a hard privilege denial). Did NOT revoke function EXECUTE from
    PUBLIC — that reproducibly crashed the local Postgres backend for zero added
    protection (the table revoke already denies the write).
  - `incrDailyLiveCount` now returns the post-increment count (was `void`) so
    the Phase-5 route can enforce the breaker on the returned value
    (increment-then-check) instead of a racy read-then-increment.

### Task 4.3 — Typed RLS-aware Supabase query layer (2026-07-23)

- Added `lib/db/`: `types.ts` (row types, exact match to `0001_init.sql`),
  `client.ts` (server-only: cookie-bound `createServerClient` + service-role
  `createServiceRoleClient`), `browser-client.ts` (client-safe anon client),
  `workspaces.ts` / `audits.ts` / `sops.ts` (RLS-authorized queries, no manual
  user filters), `index.ts` (server-only barrel).
- **Bundle safety:** `import 'server-only'` guards `client.ts` + the three
  query modules; the service-role key and `next/headers` never reach a client
  bundle. Browser path is physically separate. Enforced by Next's `server-only`
  webpack alias (confirmed in review).
- `audit_items` rows are mapped to the domain `ScoredItem` via
  `ScoredItemSchema.parse` at the boundary, so nullable DB columns throw a
  clear error instead of yielding an invalid `ScoredItem` (finding 4.1-m2).
- `createWorkspace` is a single authenticated insert; the owner's membership is
  seeded by the `seed_workspace_owner` trigger (finding M1).
- **Fix (review-found, live-verified):** `createWorkspace` cannot use
  `.insert().select()` — the RETURNING projection is filtered by
  `workspaces_select` while the owner's membership is seeded by an AFTER INSERT
  trigger not yet in effect, so it throws despite a successful insert. Changed
  to app-supplied id + insert-without-RETURNING + read-back by id. Verified
  against the live local Postgres.
- Verified `npm run typecheck`, `npm run lint`, `npm test` (21) green. No unit
  tests (typecheck-gated; runtime exercise deferred to Phase 5).

### Task 4.2 — RLS policies + membership helper (2026-07-23)

- Added `supabase/migrations/0002_rls.sql`: enables RLS on all five tables
  and adds membership-keyed policies. All checks funnel through a SECURITY
  DEFINER helper `is_workspace_member(uuid)` hardened with `search_path = ''`
  and schema-qualified refs; definer so the membership lookup isn't blocked
  by RLS on `workspace_members`.
  - `workspaces`: member-keyed SELECT/UPDATE/DELETE, owner-gated INSERT.
  - `workspace_members`: member SELECT, owner-only INSERT/DELETE.
  - `audits`/`audit_items`/`sops`: ALL gated on membership of the owning
    workspace (child tables join upward), USING + WITH CHECK.
- Added `docs/ARCHITECTURE.md`: membership-keyed RLS model, security-definer
  rationale, policy summary, and the cross-workspace isolation transcript
  (captured live-DB output pending — controller runs it as Gate 4 evidence).
- Added `.superpowers/sdd/rls-transcript.sql` (gitignored; mirrored verbatim
  into `docs/ARCHITECTURE.md`): adversarial, self-contained, rolled-back
  transcript proving userA cannot read workspace B's audit while in-workspace
  rows stay visible.
- Updated `docs/architecture/migrations.md`: `0002_rls.sql` moved to Landed;
  isolation check now points to `ARCHITECTURE.md`.
- Verified `npm test` (21 passing), `npm run typecheck`, `npm run lint` green.
  DB not applied here — the controller applies the migration and runs the
  transcript against the live local Supabase.
- **Gate 4 evidence captured (controller):** applied `0001`+`0002` to a fresh
  local Postgres (`supabase db reset`) and ran the transcript as authenticated
  userA/userB with forged JWT `sub` claims. Real output pasted into
  `ARCHITECTURE.md` proving read isolation both directions AND write-path
  `WITH CHECK` denials (cross-workspace child insert and foreign-owner
  workspace insert rejected; in-workspace/self-owned writes succeed).
  Adversarial reviewer independently probed UPDATE-move, DELETE, `audit_items`/
  `sops` write chains, `workspace_members` self-escalation, `is_workspace_member(NULL)`,
  and anon — no isolation hole found.
- **M1 fix — RLS bootstrap deadlock:** added an `AFTER INSERT` trigger
  `seed_workspace_owner` (SECURITY DEFINER, `search_path=''`) to
  `0002_rls.sql` that seeds the workspace creator as its `owner` member.
  Without it an authenticated user could create a workspace but was then
  locked out (couldn't insert their own first membership row under RLS).
  Isolation-safe (only ever seeds the creator's own workspace). Re-verified
  live with a userC bootstrap case in the transcript.

### Task 4.1 — Initial schema migration (2026-07-23)

- Added `supabase/migrations/0001_init.sql`: `pgcrypto` extension plus five
  tables — `workspaces`, `workspace_members`, `audits`, `audit_items`,
  `sops` — with FK cascades to `workspaces`/`audits`/`audit_items` and a
  `role` check constraint (`owner`/`member`). Schema only.
- **RLS deliberately deferred to Task 4.2 (`0002_rls.sql`)** — this file
  enables no RLS and defines no policies.
- Updated `docs/architecture/migrations.md`: `0001_init.sql` moved to a
  Landed section; `0002`/`0003` remain planned; cross-workspace isolation
  check placeholder preserved for Task 4.2.
- Not applied here — the controller (main thread) manages the local
  Supabase stack and applies/verifies the migration.

### Task 1.3 — CI workflow + project docs/config (2026-07-23)

- Added `.github/workflows/ci.yml`: lint + typecheck + test on push to
  `main` and on pull requests. Evals are intentionally excluded (they call
  the paid Anthropic API) — run manually via `npm run eval`.
- Added `.env.example` (five vars, no real values): `ANTHROPIC_API_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SERVER_SALT`.
- Fixed `.gitignore`: narrowed the blanket `.env*` rule to `.env*.local` so
  `.env.example` stays tracked; added `SESSION.md`, `NOTES.md`,
  `.superpowers/` (controller scratch, never committed).
- Added `.claude/settings.json` (committed project meta: deployTier A, saas
  stack). `.claude/settings.local.json` remains session-local and untracked.
- Added `CLAUDE.md` and `docs/architecture/{file-map,conventions,local-dev,
  migrations}.md`.
- **Deferred to Phase 7 (deploy):** no GitHub remote exists yet, so this
  commit is not pushed. First push + confirming CI green in Actions is a
  Phase 7.1 sub-gate, not part of this task.

### Task 1.2 — Vitest wiring (prior)

- Wired `vitest` with a smoke test (`__tests__/smoke.test.ts`).

### Task 1.1 — Scaffold (prior)

- Scaffolded Next.js 16 + TypeScript strict + Tailwind.

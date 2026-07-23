# Changelog

## Unreleased

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

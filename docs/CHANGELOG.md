# Changelog

## Unreleased

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

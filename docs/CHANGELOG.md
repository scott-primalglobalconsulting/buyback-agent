# Changelog

## Unreleased

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

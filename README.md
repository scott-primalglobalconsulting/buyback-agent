# Buyback Agent

[![CI](https://github.com/scott-primalglobalconsulting/buyback-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/scott-primalglobalconsulting/buyback-agent/actions/workflows/ci.yml)

An AI agent that audits a founder's week and tells them what to delegate, automate, or protect. Enter your tasks, and it scores each one into a DRIP quadrant and a dollar value tier, computes your buyback rate, names your first hire, and writes delegation SOPs.

> Independent demo. Not affiliated with, endorsed by, or associated with Martell Group or Dan Martell. "Buyback Loop" and "DRIP" refer to concepts from Dan Martell's published work.

## Try it

**Live demo: coming soon** (deployed in the final phase; the link lands here).

Fastest path, no signup: open **`/demo`**, and in about ten seconds you get a full scored audit of a realistic founder's week. Sign in with a magic link to analyze your own tasks, save audits, generate SOPs, and export the report.

## What it is

Founders drown in low value work they should have handed off months ago. The fix is a time audit: list the week, score every task by what it is worth and who should own it, then delegate down the list. Done by a person, that is a concierge service. This turns it into software.

The scoring follows Dan Martell's Buyback Loop and the DRIP matrix:

1. **Audit.** You enter each task with its hours per week and what it would cost to hand off.
2. **Analyze.** The agent scores every task into a **DRIP quadrant** (Delegate, Replace, Invest, Produce), a **value tier** ($10 to $10,000 per hour), and a **keep / delegate / eliminate** call, each with a short rationale grounded in your tasks.
3. **Transfer.** It computes your **buyback rate** (the reclaimable share of your week), places your **first hire** on a fixed ladder (admin, delivery, marketing, sales, leadership) with a justification, and generates a delegation SOP for any task you are handing off.

Every number on the dashboard comes from the scored data, never from a component doing its own math.

## Built solo in about 7 hours

The entire thing, scaffold through a merged, reviewed, live-verified UI, was built in roughly seven hours with AI tooling. Every task was implemented and then reviewed by a separate adversarial pass, and the security and cost-sensitive paths were verified live, not assumed. The commit history and `docs/CHANGELOG.md` show the trail.

## Architecture at a glance

Three isolation boundaries keep the system honest and testable, and they are enforced, not aspirational:

- **`lib/agent` and `lib/buyback` are pure.** No React, Next, Supabase, or database. Deterministic input to validated output, so the scoring and the money math are unit tested in isolation.
- **`lib/db` is the only module that touches Supabase.** Every query runs under Row Level Security; the service role key is confined to the deny-all abuse-guard tables and never reaches the client.
- **Routes and components consume `lib/agent` and `lib/db`, never the raw APIs.** The Anthropic key stays server side; client components reach the agent only through `fetch`, and write to the database only through server actions.

Full detail, including the live cross-workspace isolation transcript, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Engineering choices worth a look

- **Reliable structured output.** The agent forces a single tool call and validates the result against a Zod schema, with one retry that feeds the validation error back to the model. A schema-valid `AnalysisResult` is guaranteed downstream or the call fails loudly.
- **An eval harness.** `npm run eval` runs fixtures against the live model and checks structure, DRIP assignment, and recommendation sanity, so prompt changes are measured, not guessed.
- **Row Level Security as the tenant guard.** Workspace membership gates every row. A second user cannot open the first user's audit; the app returns a 404, verified live, not a leaked record.
- **A real abuse guard on the anonymous demo.** The public `/demo` path is sample locked, cached in Postgres, rate limited per IP (hashed, raw IPs never stored), and capped by a global daily circuit breaker with increment-then-check so concurrent requests cannot overshoot. The anonymous route cannot be used to run arbitrary input or bleed the model.
- **Streaming with honest states.** Analysis streams over Server Sent Events. The loading state is a real skeleton, not a fabricated "thinking" log, because forced tool use returns the result in one shot.

## Run it locally

Requires Node 20+, Docker (for local Supabase), and the Supabase CLI.

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
supabase start && supabase db reset   # starts Postgres and applies migrations 0001 to 0004
npm run dev                    # http://localhost:3000
```

Open `/demo` for the no-signup sample path. To exercise the authed flow, sign in; in local dev the magic link is captured by the mail inbox that `supabase start` prints.

`.env.local` needs five values (all listed in `.env.example`): `ANTHROPIC_API_KEY`, the Supabase URL and anon key, `SUPABASE_SERVICE_ROLE_KEY`, and a random `SERVER_SALT`. The three server side secrets never reach the client bundle.

Checks:

```bash
npm test          # unit tests (pure agent, money math, guard policy, routes, export)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run eval      # fixtures against the live model (needs ANTHROPIC_API_KEY; not run in CI)
```

## Roadmap

Deliberately cut to keep the demo tight and the surface honest. Intentional YAGNI, not oversight:

- Per-user rate and budget caps on the authenticated routes (the anonymous path is already fully guarded).
- Idempotent SOP storage (regenerating currently appends a new version rather than replacing).
- A richer audit history and team roles beyond owner and member.

## License

[MIT](LICENSE) (c) 2026 Scott Steele.

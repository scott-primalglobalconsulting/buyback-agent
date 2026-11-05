# buyback-agent: rules for any agent (Codex, Claude, local models)

Last updated: 2026-11-05 10:42 -0600
Version tag: 2026-11-05 10:42 -0600

Claude reads CLAUDE.md, which has the full context. This is the minimum every other agent needs.

- This is an independent Buyback Loop demo that audits founders' tasks and recommends delegation. Don't imply affiliation with or endorsement by Dan Martell or Martell Group.
- Keep `lib/agent` and `lib/buyback` free of React, Next, and Supabase imports. Only `lib/db` touches Supabase; routes and components consume these modules rather than calling the raw APIs.
- Keep the Anthropic key, Supabase service role key, and server salt server-side. Confine service role access to deny-all abuse-guard tables, and enforce workspace membership through RLS.
- Before merging an RLS-touching migration, write and verify the cross-workspace isolation check in `docs/architecture/migrations.md`.
- Changes to `lib/guard/` require re-verifying rate limits, circuit breakers, and payload caps on the cost-bearing anonymous paths. Keep `/demo` sample-locked; hash IPs and never store raw ones.
- Use `npm run dev` and `npm run build`. Before calling work done, read the actual passing output of `npm run lint`, `npm run typecheck`, and `npm test`.
- Use `npm run validate:palette` for the palette gate. `npm run eval` calls the live Anthropic API and stays outside CI.
- Use conventional commits with one logical change each, staging files explicitly. Never use `git add -A` or `git add .`.
- Derive dashboard numbers from scored data rather than calculating them in components.

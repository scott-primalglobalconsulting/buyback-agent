# Migrations Catalog

Last updated: 2026-07-24 09:27 EST

This file is the running catalog; each entry is added when its migration
lands in Phase 4 (Data layer) and Phase 4.4 (abuse guard).

## Landed

| File | Purpose | RLS |
|---|---|---|
| `0001_init.sql` | `workspaces`, `workspace_members`, `audits`, `audit_items`, `sops` (+ `pgcrypto` extension for `gen_random_uuid()`) | Not enabled here — schema only; RLS enablement + policies deferred to `0002_rls.sql` |
| `0002_rls.sql` | RLS policies + workspace-membership helper function (`is_workspace_member`, SECURITY DEFINER) | Row visible/writable only to members of the owning workspace |
| `0003_abuse_guard.sql` | `demo_cache`, `demo_rate`, `demo_budget` (+ atomic `incr_demo_rate` / `incr_daily_live_count` RPCs, `search_path = ''`) | Enabled, deny-all (no anon/authenticated policies) — only the service-role key reads/writes, so no browser or logged-in user can touch or scrape them. **Live deny-all verification pending controller apply at Gate 4.** |
| `0004_audit_summary.sql` | Adds `first_hire_role` and `first_hire_justification` (both `text`, NULLABLE) to `audits` to persist the LLM-judged first-hire recommendation for the audit-detail page | **No RLS change.** Additive nullable columns only; RLS on `audits` (enabled + policed by `0002_rls.sql`'s `audits_all` via `is_workspace_member`) already gates reads/writes at the row level, and no column-level grants are used. No cross-workspace isolation impact — a member still sees only their workspace's audit rows, now including these two columns. Existing audit rows keep NULL for both (no backfill). |
| `0005_revenue_context.sql` | Adds `revenue_proximity` (`text`, NULLABLE) to `audit_items` for the model's per-task revenue-proximity judgment, and `is_at_revenue` (`boolean`), `annual_income` (`numeric`), `team` (`text`), `tool_budget` (`text`) — all NULLABLE — to `audits` for the founder-supplied audit-level context (revenue stage, income for the Buyback Rate, team + tool budget for SOP fit) | **No RLS change.** Additive nullable columns only; no new table, policy, RPC, or grant is introduced, so the deny-all default and membership checks from `0002_rls.sql` / `0003_abuse_guard.sql` are untouched. RLS on `audits` (`audits_all`) and `audit_items` (`audit_items_all`) — both enabled + policed by `0002_rls.sql` via `is_workspace_member` — already gates reads/writes at the row level, and no column-level grants are used, so the existing row-level policies already gate the new columns. No cross-workspace isolation impact — a member still sees only their workspace's audit / audit-item rows, now including these columns. Existing rows keep NULL for all new columns (no backfill). |

## Planned

_`0003` awaits controller apply + Gate 4 deny-all transcript. `0004` (additive
nullable columns, no RLS change) is authored in Task 5.3b and awaits controller
apply against the running DB — not applied by the implementing agent, since the
DB holds live data._

## Cross-workspace isolation check

The concrete isolation check for `0002_rls.sql` lives in
[`../ARCHITECTURE.md`](../ARCHITECTURE.md#cross-workspace-isolation-check):
the transcript SQL (source: `supabase/tests/rls-isolation.sql`) plus the
captured live-DB output demonstrating that a user in workspace A cannot read a
row owned by workspace B while in-workspace rows remain visible. This is a
Phase 4 gate requirement, not optional documentation.

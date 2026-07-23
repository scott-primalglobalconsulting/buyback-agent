# Migrations Catalog

Last updated: 2026-07-23 15:24 EST

This file is the running catalog; each entry is added when its migration
lands in Phase 4 (Data layer) and Phase 4.4 (abuse guard).

## Landed

| File | Purpose | RLS |
|---|---|---|
| `0001_init.sql` | `workspaces`, `workspace_members`, `audits`, `audit_items`, `sops` (+ `pgcrypto` extension for `gen_random_uuid()`) | Not enabled here — schema only; RLS enablement + policies deferred to `0002_rls.sql` |
| `0002_rls.sql` | RLS policies + workspace-membership helper function (`is_workspace_member`, SECURITY DEFINER) | Row visible/writable only to members of the owning workspace |

## Planned

| File | Purpose | RLS |
|---|---|---|
| `0003_abuse_guard.sql` | `demo_cache`, `demo_rate`, `demo_budget` | Enabled, deny-all (no anon/authenticated policies) — only the service-role key reads/writes, so no browser or logged-in user can touch or scrape them |

## Cross-workspace isolation check

The concrete isolation check for `0002_rls.sql` lives in
[`../ARCHITECTURE.md`](../ARCHITECTURE.md#cross-workspace-isolation-check):
the transcript SQL (source: `.superpowers/sdd/rls-transcript.sql`) plus the
captured live-DB output demonstrating that a user in workspace A cannot read a
row owned by workspace B while in-workspace rows remain visible. This is a
Phase 4 gate requirement, not optional documentation.

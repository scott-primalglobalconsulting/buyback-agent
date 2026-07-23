# Migrations Catalog

Last updated: 2026-07-23 15:18 EST

This file is the running catalog; each entry is added when its migration
lands in Phase 4 (Data layer) and Phase 4.4 (abuse guard).

## Landed

| File | Purpose | RLS |
|---|---|---|
| `0001_init.sql` | `workspaces`, `workspace_members`, `audits`, `audit_items`, `sops` (+ `pgcrypto` extension for `gen_random_uuid()`) | Not enabled here — schema only; RLS enablement + policies deferred to `0002_rls.sql` |

## Planned

| File | Purpose | RLS |
|---|---|---|
| `0002_rls.sql` | RLS policies + workspace-membership helper function | Row visible/writable only to members of the owning workspace |
| `0003_abuse_guard.sql` | `demo_cache`, `demo_rate`, `demo_budget` | Enabled, deny-all (no anon/authenticated policies) — only the service-role key reads/writes, so no browser or logged-in user can touch or scrape them |

## Cross-workspace isolation check

To be written here once `0002_rls.sql` lands: a concrete note demonstrating
that a user in workspace A cannot read or write a row owned by workspace B
(query attempted, result observed, RLS policy responsible for the denial).
This is a Phase 4 gate requirement, not optional documentation.

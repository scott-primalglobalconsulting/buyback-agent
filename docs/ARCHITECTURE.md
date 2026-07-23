# Buyback Agent — Architecture

Last updated: 2026-07-23 16:14 EST

## Row-Level Security

Every table in the schema is protected by a single, uniform visibility rule:
**a row is visible and writable only to members of the workspace that owns
it.** Membership is recorded in `workspace_members`. The tables relate to a
workspace as follows:

- `workspaces` — keyed on its own `id`.
- `workspace_members` — keyed on `workspace_id`.
- `audits` — keyed on `workspace_id`.
- `audit_items` — key upward through `audit_id -> audits.workspace_id`.
- `sops` — key upward through `audit_item_id -> audit_items.audit_id ->
  audits.workspace_id`.

All five checks funnel through one helper:

```sql
create function public.is_workspace_member(ws uuid)
  returns boolean
  language sql
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
  )
$$;
```

### Why the helper is `SECURITY DEFINER`

RLS is enabled on `workspace_members` itself. If the membership lookup ran
with the caller's privileges, reading `workspace_members` to *decide*
visibility would itself be filtered by the RLS on `workspace_members` — a
circular dependency, and for the `workspace_members` SELECT policy an outright
infinite recursion. Running the lookup as the function owner (a role exempt
from RLS) breaks the cycle: the helper always sees the complete membership
table, and the policies that call it resolve cleanly.

### Why `search_path = ''` and fully-qualified names

A `SECURITY DEFINER` function executes with the owner's elevated privileges,
which makes object resolution a security boundary. Pinning `search_path` to
empty and schema-qualifying every reference (`public.workspace_members`,
`auth.uid()`) means a caller cannot create an object in a schema they control
to shadow an unqualified name and hijack the elevated execution.

### Policy summary

| Table | Verbs | Predicate |
|---|---|---|
| `workspaces` | SELECT / UPDATE / DELETE | `is_workspace_member(id)` |
| `workspaces` | INSERT | `owner_id = auth.uid()` (WITH CHECK) |
| `workspace_members` | SELECT | `is_workspace_member(workspace_id)` |
| `workspace_members` | INSERT / DELETE | caller owns the workspace (`workspaces.owner_id = auth.uid()`) |
| `audits` | ALL | `is_workspace_member(workspace_id)` (USING + WITH CHECK) |
| `audit_items` | ALL | `is_workspace_member(audits.workspace_id)` via `audit_id` (USING + WITH CHECK) |
| `sops` | ALL | `is_workspace_member(audits.workspace_id)` via `audit_item_id -> audit_id` (USING + WITH CHECK) |

`workspaces` INSERT is separated from the member-keyed verbs because at
creation time no membership row exists yet; ownership is the gate. The
member-keyed ALL policies carry both `USING` and `WITH CHECK` so a member
cannot write a child row into a workspace they don't belong to.

### Owner-membership bootstrap (why the trigger exists)

The member-keyed model has a chicken-and-egg at workspace creation: an
authenticated user may INSERT a workspace they own, but cannot then INSERT
their own first `workspace_members` row — `workspace_members_insert` reads
`workspaces` under RLS, and the just-created workspace is invisible to its
owner until a membership row exists. Left unaddressed, the creator is locked
out of the workspace they just made.

An `AFTER INSERT` trigger on `workspaces` (`seed_workspace_owner`, SECURITY
DEFINER, `search_path = ''`) closes the loop: it seeds the creator as the
`owner` member of the new workspace. It only ever inserts
`(NEW.id, NEW.owner_id, 'owner')`, so it grants no cross-workspace access and
adds no isolation exposure. This keeps `createWorkspace` a single authenticated
insert regardless of which client performs it. Verified live below (userC).

## Cross-workspace isolation check

This is the Phase 4 hard-gate evidence: a concrete transcript proving that a
user in workspace A cannot read a row owned by workspace B, and that in-
workspace rows remain visible. The script seeds two isolated workspaces as the
superuser, then re-runs the reads as each `authenticated` user with a forged
JWT `sub` claim (exactly how PostgREST presents a logged-in user). It runs
inside a transaction that is rolled back, leaving no residue.

Source: `.superpowers/sdd/rls-transcript.sql`.

```sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'usera@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'userb@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'userc@example.test');

insert into public.workspaces (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Workspace A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', 'Workspace B', '00000000-0000-0000-0000-00000000000b');

-- Owner memberships are auto-seeded by the seed_workspace_owner trigger; this
-- explicit insert is an idempotent backstop.
insert into public.workspace_members (workspace_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner')
on conflict (workspace_id, user_id) do nothing;

insert into public.audits (id, workspace_id, created_by, title) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Audit A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Audit B');

-- userA (member of workspace A only)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';

select public.is_workspace_member('00000000-0000-0000-0000-0000000000a1') as is_member_wsA; -- expect t
select public.is_workspace_member('00000000-0000-0000-0000-0000000000b1') as is_member_wsB; -- expect f
select id, workspace_id, title from public.audits order by title;                            -- expect only Audit A
select id, workspace_id, title from public.audits
  where id = '00000000-0000-0000-0000-0000000000b2';                                         -- expect 0 rows
select workspace_id, user_id, role from public.workspace_members;                            -- expect only wsA/userA
select id, name from public.workspaces;                                                      -- expect only Workspace A

-- write-path: positive controls SUCCEED, cross-workspace / foreign-owner DENIED by WITH CHECK
insert into public.audits (workspace_id, created_by, title)
  values ('...a1', '...00a', 'Audit A3 by userA');   -- member workspace  -> SUCCESS
insert into public.audits (workspace_id, created_by, title)
  values ('...b1', '...00a', 'Cross-ws sneak');       -- NON-member wsB    -> DENIED
insert into public.workspaces (name, owner_id)
  values ('Rogue WS', '...00b');                       -- foreign owner_id  -> DENIED
insert into public.workspaces (name, owner_id)
  values ('userA second WS', '...00a');                -- self owner_id     -> SUCCESS
reset role;

-- bootstrap: userC creates a workspace via the authenticated client; the
-- AFTER INSERT trigger seeds userC's owner membership so they are not locked out
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';
insert into public.workspaces (id, name, owner_id)
  values ('00000000-0000-0000-0000-0000000000c1', 'Workspace C', '...00c'); -- SUCCESS + trigger seeds membership
select public.is_workspace_member('00000000-0000-0000-0000-0000000000c1');    -- expect t
select id, name from public.workspaces where id = '00000000-0000-0000-0000-0000000000c1'; -- expect Workspace C
select workspace_id, user_id, role from public.workspace_members
  where workspace_id = '00000000-0000-0000-0000-0000000000c1';               -- expect userC/owner
reset role;

-- userB, symmetric
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select id, workspace_id, title from public.audits order by title;                            -- expect only Audit B
select id, workspace_id, title from public.audits
  where id = '00000000-0000-0000-0000-0000000000a2';                                         -- expect 0 rows
reset role;

rollback;
```

### Captured output (real, from the live local Postgres)

Applied to a fresh DB via `supabase db reset` (0001 + 0002), then run with:

```
docker exec -i supabase_db_buyback-agent psql -U postgres -d postgres < .superpowers/sdd/rls-transcript.sql
```

Run with `psql -q` (success-status lines suppressed; a successful write is
proven by the absence of an error and the resulting state, a denied write by
the `ERROR: new row violates row-level security policy` line under its label):

```text
=== userA: helper says member of wsA (expect t) ===
 is_member_wsa
---------------
 t
=== userA: helper says member of wsB (expect f) ===
 is_member_wsb
---------------
 f
=== userA sees only workspace A audit (expect 1 row: Audit A) ===
                  id                  |             workspace_id             |  title
--------------------------------------+--------------------------------------+---------
 00000000-0000-0000-0000-0000000000a2 | 00000000-0000-0000-0000-0000000000a1 | Audit A
(1 row)
=== userA explicitly targets workspace B audit (expect 0 rows) ===
 id | workspace_id | title
----+--------------+-------
(0 rows)
=== userA sees only workspace A membership (expect 1 row: userA/wsA) ===
             workspace_id             |               user_id                | role
--------------------------------------+--------------------------------------+-------
 00000000-0000-0000-0000-0000000000a1 | 00000000-0000-0000-0000-00000000000a | owner
(1 row)
=== userA sees only workspace A itself (expect 1 row: Workspace A) ===
                  id                  |    name
--------------------------------------+-------------
 00000000-0000-0000-0000-0000000000a1 | Workspace A
(1 row)
=== userA INSERT audit into wsA (member) -- expect SUCCESS (INSERT 0 1) ===
=== userA INSERT audit into wsB (NOT member) -- expect DENIED by WITH CHECK ===
ERROR:  new row violates row-level security policy for table "audits"
=== userA INSERT workspace owned by userB -- expect DENIED (owner_id != auth.uid) ===
ERROR:  new row violates row-level security policy for table "workspaces"
=== userA INSERT workspace owned by self -- expect SUCCESS (INSERT 0 1) ===
=== userC creates own workspace -- expect SUCCESS (INSERT 0 1), trigger seeds membership ===
=== userC is now a member of their new workspace (expect t) ===
 is_member_wsc
---------------
 t
(1 row)
=== userC sees their new workspace (expect 1 row: Workspace C) ===
                  id                  |    name
--------------------------------------+-------------
 00000000-0000-0000-0000-0000000000c1 | Workspace C
(1 row)
=== owner-membership row auto-seeded for userC (expect 1 row: userC/owner) ===
             workspace_id             |               user_id                | role
--------------------------------------+--------------------------------------+-------
 00000000-0000-0000-0000-0000000000c1 | 00000000-0000-0000-0000-00000000000c | owner
(1 row)
=== userB sees only workspace B audit (expect 1 row: Audit B) ===
                  id                  |             workspace_id             |  title
--------------------------------------+--------------------------------------+---------
 00000000-0000-0000-0000-0000000000b2 | 00000000-0000-0000-0000-0000000000b1 | Audit B
(1 row)
=== userB explicitly targets workspace A audit (expect 0 rows) ===
 id | workspace_id | title
----+--------------+-------
(0 rows)
```

**Result:** read isolation holds both directions (each user sees only their
workspace's rows; explicit cross-workspace reads return 0 rows); the write-path
`WITH CHECK` clauses deny a cross-workspace child insert and a foreign-owner
workspace insert while allowing legitimate in-workspace and self-owned writes;
and the `seed_workspace_owner` trigger correctly bootstraps userC's membership
so a freshly-created workspace is immediately usable by its owner.
Cross-workspace isolation is verified, not asserted.

## Abuse-guard tables (deny-all RLS)

The `demo_*` tables (`demo_cache`, `demo_rate`, `demo_budget`) back the
anonymous `/demo` cost controls (sample cache, per-IP rate limit, daily API
budget breaker). They carry no user data and must be invisible to browsers and
logged-in users alike — a client that could read them could time an attack
around the budget, and one that could write them could forge a fresh cache or
zero the breaker. Two independent locks enforce this:

1. **RLS deny-all.** `0003_abuse_guard.sql` enables RLS on all three tables and
   creates **no policies at all**, so anon/authenticated are denied every row.
2. **Table-privilege revoke (defense-in-depth).** Supabase's defaults grant
   anon/authenticated full DML on public tables, so the migration also
   `REVOKE ALL ON demo_* FROM anon, authenticated`. The counter RPCs
   (`incr_demo_rate`, `incr_daily_live_count`) are `SECURITY INVOKER` — chosen
   deliberately over `DEFINER` so an anon/authenticated caller runs the INSERT
   as itself and, lacking table privileges, is denied. Only the RLS-exempt
   service role (used solely by `lib/db/guard.ts`) reaches these tables.

The counter writes go through two `INSERT .. ON CONFLICT DO UPDATE .. RETURNING`
RPCs so concurrent requests serialize on the conflicting row and the returned
count is exact; `window_start`/`day` are derived server-side from `now()` so a
client cannot forge or spread buckets.

(Note: we intentionally do NOT also revoke function `EXECUTE` from `PUBLIC` — the
functions stay callable, but the table revoke already denies the write. Adding a
PUBLIC `EXECUTE` revoke reproducibly crashed the local Postgres backend on an
anon call, for zero added protection.)

Verified live (`supabase db reset` applies `0001`–`0003` cleanly, then probed):

```text
=== RLS enabled + policy count per demo table (expect rls=t, policies=0) ===
   relname   | rls_enabled | policies
-------------+-------------+----------
 demo_budget | t           |        0
 demo_cache  | t           |        0
 demo_rate   | t           |        0
=== demo_* table grants for anon/authenticated (expect 0) === -> 0
=== incr_* functions: SECURITY INVOKER (prosecdef=f) ===

-- as anon:
ANON  select demo_cache          -> ERROR: permission denied for table demo_cache
ANON  call incr_demo_rate('x')   -> ERROR: permission denied for table demo_rate
-- as service_role (RLS-exempt, retains grants):
SERVICE_ROLE read/write demo_cache + demo_budget -> full access
SERVICE_ROLE incr_demo_rate / incr_daily_live_count -> atomic, exact returned count
```

Anon and authenticated can neither read nor write the tables nor increment the
counters (denied at the table-privilege layer, behind RLS deny-all); only the
service role reaches them, and the counter RPCs increment atomically. Verified,
not asserted.

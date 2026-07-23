# Buyback Agent — Architecture

Last updated: 2026-07-23 15:24 EST

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
  ('00000000-0000-0000-0000-00000000000b', 'userb@example.test');

insert into public.workspaces (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Workspace A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', 'Workspace B', '00000000-0000-0000-0000-00000000000b');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner');

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

<!-- CAPTURED OUTPUT PENDING — controller runs the transcript against the live DB and pastes real output here (Gate 4 evidence) -->

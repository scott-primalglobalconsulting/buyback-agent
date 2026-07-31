-- rls-isolation.sql
-- Deterministic, self-contained cross-workspace isolation proof for the RLS
-- policies in 0002_rls.sql. Run AFTER `supabase db reset` (so 0001 + 0002 are
-- applied) via, e.g.:
--   docker exec -i supabase_db_buyback-agent psql -U postgres -d postgres < supabase/tests/rls-isolation.sql
--
-- Everything runs inside a single transaction that is ROLLED BACK, so the
-- script leaves no residue and is re-runnable. Seeding happens as the
-- superuser (RLS-exempt); the assertions run as `authenticated` with a forged
-- JWT `sub` claim, which is exactly how PostgREST presents a logged-in user.
--
-- HARDCODED uuids:
--   userA = 00000000-0000-0000-0000-00000000000a
--   userB = 00000000-0000-0000-0000-00000000000b
--   wsA   = 00000000-0000-0000-0000-0000000000a1  (owned by userA)
--   wsB   = 00000000-0000-0000-0000-0000000000b1  (owned by userB)
--   auditA= 00000000-0000-0000-0000-0000000000a2  (in wsA)
--   auditB= 00000000-0000-0000-0000-0000000000b2  (in wsB)

begin;

-- Auto-savepoint each statement so an expected RLS denial (which raises an
-- ERROR) rolls back to a savepoint instead of aborting the whole transaction,
-- letting the write-path denials be captured as discrete evidence.
\set ON_ERROR_ROLLBACK on

-- --- Seed as superuser (bypasses RLS) --------------------------------------
-- auth.users: id is the only value we supply; every other column is either
-- nullable or carries a default in the local GoTrue schema.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'usera@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'userb@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'userc@example.test');

insert into public.workspaces (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Workspace A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', 'Workspace B', '00000000-0000-0000-0000-00000000000b');

-- Owner memberships for wsA/wsB are auto-seeded by the workspaces_seed_owner
-- trigger when the workspaces above are inserted; this explicit insert is a
-- deterministic backstop (idempotent) in case the trigger is ever removed.
insert into public.workspace_members (workspace_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'owner')
on conflict (workspace_id, user_id) do nothing;

insert into public.audits (id, workspace_id, created_by, title) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Audit A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Audit B');

-- --- Simulate userA (member of workspace A only) ---------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';

\echo === userA: helper says member of wsA (expect t) ===
select public.is_workspace_member('00000000-0000-0000-0000-0000000000a1') as is_member_wsA;

\echo === userA: helper says member of wsB (expect f) ===
select public.is_workspace_member('00000000-0000-0000-0000-0000000000b1') as is_member_wsB;

\echo === userA sees only workspace A audit (expect 1 row: Audit A) ===
select id, workspace_id, title from public.audits order by title;

\echo === userA explicitly targets workspace B audit (expect 0 rows) ===
select id, workspace_id, title
from public.audits
where id = '00000000-0000-0000-0000-0000000000b2';

\echo === userA sees only workspace A membership (expect 1 row: userA/wsA) ===
select workspace_id, user_id, role from public.workspace_members order by role;

\echo === userA sees only workspace A itself (expect 1 row: Workspace A) ===
select id, name from public.workspaces order by name;

-- --- WRITE-PATH isolation (userA) ------------------------------------------
-- Positive controls must SUCCEED; cross-workspace / foreign-owner writes must
-- be DENIED by the policies' WITH CHECK clauses (ERROR: new row violates RLS).

\echo === userA INSERT audit into wsA (member) -- expect SUCCESS (INSERT 0 1) ===
insert into public.audits (workspace_id, created_by, title)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Audit A3 by userA');

\echo === userA INSERT audit into wsB (NOT member) -- expect DENIED by WITH CHECK ===
insert into public.audits (workspace_id, created_by, title)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 'Cross-ws sneak');

\echo === userA INSERT workspace owned by userB -- expect DENIED (owner_id != auth.uid) ===
insert into public.workspaces (name, owner_id)
values ('Rogue WS', '00000000-0000-0000-0000-00000000000b');

\echo === userA INSERT workspace owned by self -- expect SUCCESS (INSERT 0 1) ===
insert into public.workspaces (name, owner_id)
values ('userA second WS', '00000000-0000-0000-0000-00000000000a');

reset role;

-- --- Owner-membership bootstrap (userC creates a workspace via authenticated) ---
-- Proves the AFTER INSERT trigger seeds the creator's membership, so an
-- authenticated user is NOT locked out of a workspace they just created.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';

\echo === userC creates own workspace -- expect SUCCESS (INSERT 0 1), trigger seeds membership ===
insert into public.workspaces (id, name, owner_id)
values ('00000000-0000-0000-0000-0000000000c1', 'Workspace C', '00000000-0000-0000-0000-00000000000c');

\echo === userC is now a member of their new workspace (expect t) ===
select public.is_workspace_member('00000000-0000-0000-0000-0000000000c1') as is_member_wsC;

\echo === userC sees their new workspace (expect 1 row: Workspace C) ===
select id, name from public.workspaces where id = '00000000-0000-0000-0000-0000000000c1';

\echo === owner-membership row auto-seeded for userC (expect 1 row: userC/owner) ===
select workspace_id, user_id, role from public.workspace_members
where workspace_id = '00000000-0000-0000-0000-0000000000c1';

reset role;

-- --- Simulate userB, symmetric check ---------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';

\echo === userB sees only workspace B audit (expect 1 row: Audit B) ===
select id, workspace_id, title from public.audits order by title;

\echo === userB explicitly targets workspace A audit (expect 0 rows) ===
select id, workspace_id, title
from public.audits
where id = '00000000-0000-0000-0000-0000000000a2';

reset role;

rollback;

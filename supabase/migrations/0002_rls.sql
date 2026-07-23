-- 0002_rls.sql
-- Row-Level Security for buyback-agent.
--
-- VISIBILITY MODEL (membership-keyed):
--   Every row in every table is visible/writable only to members of the
--   workspace that ultimately owns it. Membership lives in
--   `workspace_members`. `workspaces` keys off its own id; `audits` key off
--   their `workspace_id`; the child tables (`audit_items`, `sops`) join
--   upward to the owning workspace. All membership checks funnel through the
--   single SECURITY DEFINER helper `public.is_workspace_member(uuid)`.
--
-- WHY SECURITY DEFINER on the helper:
--   RLS is enabled on `workspace_members` itself. If the membership lookup
--   ran as the calling user, reading `workspace_members` to decide
--   visibility would itself be filtered by RLS on `workspace_members` — a
--   circular dependency (and, for the workspace_members SELECT policy, an
--   infinite recursion). Running the lookup as the function owner (a
--   RLS-exempt role) breaks that cycle: the helper always sees the full
--   membership table regardless of the caller's policies.
--
-- WHY search_path = '' + fully-qualified names:
--   A SECURITY DEFINER function runs with the owner's privileges. An empty
--   search_path plus schema-qualified references (`public.*`, `auth.uid()`)
--   removes any object-resolution ambiguity, so a caller cannot shadow an
--   unqualified name with an object in a schema they control and hijack the
--   elevated execution.

-- ---------------------------------------------------------------------------
-- Enable RLS on all five tables. With RLS enabled and no permissive policy
-- matching, access defaults to denied for non-owner roles.
-- ---------------------------------------------------------------------------
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.audits            enable row level security;
alter table public.audit_items       enable row level security;
alter table public.sops              enable row level security;

-- ---------------------------------------------------------------------------
-- Membership helper. SECURITY DEFINER so the lookup is not itself blocked by
-- RLS on workspace_members (see header). Empty search_path + qualified refs.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- workspaces
--   SELECT/UPDATE/DELETE: caller must be a member of the workspace.
--   INSERT: caller may only create a workspace they own (owner_id = self).
--   (INSERT is separated from the member-keyed verbs because at creation
--   time no membership row exists yet — ownership is the gate instead.)
-- ---------------------------------------------------------------------------
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.is_workspace_member(id))
  with check (public.is_workspace_member(id));

create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (public.is_workspace_member(id));

create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- workspace_members
--   SELECT: visible to any member of the same workspace.
--   INSERT/DELETE: only the workspace OWNER may add or remove members. The
--   acting user must own the target workspace (workspaces.owner_id = self).
-- ---------------------------------------------------------------------------
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    exists (
      select 1
      from public.workspaces w
      where w.id = workspace_id
        and w.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- audits
--   ALL verbs gated on membership of the audit's workspace. Both USING (for
--   read/update/delete of existing rows) and WITH CHECK (for the workspace_id
--   on inserted/updated rows) so a member cannot write a row into a workspace
--   they don't belong to.
-- ---------------------------------------------------------------------------
create policy audits_all on public.audits
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- audit_items
--   ALL verbs gated on membership of the workspace owning the parent audit.
-- ---------------------------------------------------------------------------
create policy audit_items_all on public.audit_items
  for all to authenticated
  using (
    public.is_workspace_member(
      (select a.workspace_id from public.audits a where a.id = audit_items.audit_id)
    )
  )
  with check (
    public.is_workspace_member(
      (select a.workspace_id from public.audits a where a.id = audit_items.audit_id)
    )
  );

-- ---------------------------------------------------------------------------
-- sops
--   ALL verbs gated on membership of the workspace owning the grandparent
--   audit (sops -> audit_items -> audits.workspace_id).
-- ---------------------------------------------------------------------------
create policy sops_all on public.sops
  for all to authenticated
  using (
    public.is_workspace_member(
      (select a.workspace_id
         from public.audit_items ai
         join public.audits a on a.id = ai.audit_id
        where ai.id = sops.audit_item_id)
    )
  )
  with check (
    public.is_workspace_member(
      (select a.workspace_id
         from public.audit_items ai
         join public.audits a on a.id = ai.audit_id
        where ai.id = sops.audit_item_id)
    )
  );

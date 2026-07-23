-- 0001_init.sql
-- Initial schema for buyback-agent: workspaces, membership, audits, audit
-- items, and generated SOPs. Schema only — RLS enablement and policies are
-- deferred to 0002_rls.sql.

create extension if not exists pgcrypto;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users,
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id uuid not null references auth.users,
  role text not null check (role in ('owner', 'member')),
  primary key (workspace_id, user_id)
);

create table audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  created_by uuid references auth.users,
  title text,
  created_at timestamptz not null default now()
);

create table audit_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references audits on delete cascade,
  task text not null,
  hours_per_week numeric,
  cost_to_delegate numeric,
  value_tier text,
  drip_quadrant text,
  recommendation text,
  rationale text
);

create table sops (
  id uuid primary key default gen_random_uuid(),
  audit_item_id uuid not null references audit_items on delete cascade,
  content_md text,
  created_at timestamptz not null default now()
);

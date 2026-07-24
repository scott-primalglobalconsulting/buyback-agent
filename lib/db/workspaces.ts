// Workspace + membership queries. Server-only (goes through the cookie-bound
// server client). Authorization is entirely RLS-driven — no manual user_id
// filters. See supabase/migrations/0002_rls.sql for the policies relied on.
import 'server-only';
import { createServerClient, createServiceRoleClient } from './client';
import type { WorkspaceRow, WorkspaceMemberRow } from './types';

// A SINGLE authenticated insert. owner_id must equal auth.uid() to satisfy the
// workspaces_insert WITH CHECK. The owner's workspace_members row is seeded by
// the seed_workspace_owner AFTER INSERT trigger (0002_rls.sql) — do NOT insert
// it here (it would collide with the trigger / need the service role).
export async function createWorkspace(name: string): Promise<WorkspaceRow> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('createWorkspace: no authenticated user');
  }

  // INSERT ... RETURNING is rejected here: the RETURNING projection is filtered
  // by the workspaces_select policy (is_workspace_member(id)), but the owner's
  // membership is seeded by the seed_workspace_owner AFTER INSERT trigger, which
  // has not taken effect at RETURNING time — so `.insert().select()` throws
  // "new row violates row-level security policy" despite a successful insert
  // (verified against the live DB). Supply the id app-side, insert WITHOUT
  // RETURNING, then read the row back: by the second statement the trigger has
  // fired and the owner's membership makes the row visible.
  const id = crypto.randomUUID();
  const { error: insertError } = await supabase
    .from('workspaces')
    .insert({ id, name, owner_id: user.id });
  if (insertError) throw new Error(`createWorkspace failed: ${insertError.message}`);

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`createWorkspace read-back failed: ${error.message}`);
  return data as WorkspaceRow;
}

// RLS (workspaces_select via is_workspace_member) restricts this to workspaces
// the caller belongs to, so no explicit membership filter is needed.
export async function listWorkspacesForUser(): Promise<WorkspaceRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listWorkspacesForUser failed: ${error.message}`);
  return (data ?? []) as WorkspaceRow[];
}

// Read the owner_id of a workspace the caller can see, or null. RLS
// (workspaces_select via is_workspace_member) already restricts the read to
// workspaces the caller belongs to, so a non-member gets null (indistinguishable
// from a non-existent workspace — no existence leak). The invite action compares
// this against the session user id to gate the owner-only path BEFORE any email
// lookup, so a non-owner member cannot use invite to probe which emails have
// accounts.
export async function getWorkspaceOwnerId(workspaceId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) throw new Error(`getWorkspaceOwnerId failed: ${error.message}`);
  return data ? (data as { owner_id: string }).owner_id : null;
}

// Resolve an email to an auth user id via the service-role admin API, or null if
// no account exists. SERVICE-ROLE (RLS-bypassing) — the caller MUST already be
// verified as the workspace owner before this runs (see inviteByEmail), so this
// is never an open enumeration oracle. auth-js has no filter-by-email admin
// call, so we page listUsers with a hard bound; the demo's user set is small.
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createServiceRoleClient().auth.admin;
  const target = email.trim().toLowerCase();
  const PER_PAGE = 200;
  const MAX_PAGES = 25; // hard bound: never page unboundedly on a large project
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`findUserIdByEmail failed: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < PER_PAGE) break; // last page
  }
  return null;
}

// RLS (workspace_members_insert) enforces that only the workspace owner may add
// members; the insert simply fails for a non-owner caller.
export async function inviteMember(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'member',
): Promise<WorkspaceMemberRow> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: userId, role })
    .select()
    .single();
  if (error) throw new Error(`inviteMember failed: ${error.message}`);
  return data as WorkspaceMemberRow;
}

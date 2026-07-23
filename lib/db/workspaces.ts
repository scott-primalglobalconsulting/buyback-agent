// Workspace + membership queries. Server-only (goes through the cookie-bound
// server client). Authorization is entirely RLS-driven — no manual user_id
// filters. See supabase/migrations/0002_rls.sql for the policies relied on.
import 'server-only';
import { createServerClient } from './client';
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

  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name, owner_id: user.id })
    .select()
    .single();
  if (error) throw new Error(`createWorkspace failed: ${error.message}`);
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

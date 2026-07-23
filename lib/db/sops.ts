// Generated-SOP queries. Server-only. RLS (sops_all) gates every row on
// membership of the workspace owning the grandparent audit, so no manual
// ownership filtering is done here.
import 'server-only';
import { createServerClient } from './client';
import type { SopRow } from './types';

// RLS (sops_all WITH CHECK) confirms the caller owns the chain
// sop -> audit_item -> audit.workspace before allowing the insert.
export async function saveSop(auditItemId: string, contentMd: string): Promise<SopRow> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('sops')
    .insert({ audit_item_id: auditItemId, content_md: contentMd })
    .select()
    .single();
  if (error) throw new Error(`saveSop failed: ${error.message}`);
  return data as SopRow;
}

// SOPs for an audit, found via its items. Two RLS-gated steps: first the
// audit's item ids, then the sops attached to them. Both are membership-scoped.
export async function getSopsForAudit(auditId: string): Promise<SopRow[]> {
  const supabase = await createServerClient();
  const { data: itemRows, error: itemsError } = await supabase
    .from('audit_items')
    .select('id')
    .eq('audit_id', auditId);
  if (itemsError) throw new Error(`getSopsForAudit items failed: ${itemsError.message}`);

  const itemIds = ((itemRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (itemIds.length === 0) return [];

  const { data, error } = await supabase
    .from('sops')
    .select('*')
    .in('audit_item_id', itemIds)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`getSopsForAudit failed: ${error.message}`);
  return (data ?? []) as SopRow[];
}

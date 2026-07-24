// Audit + audit-item queries. Server-only. Authorization is RLS-driven
// (audits_all / audit_items_all key off workspace membership); the `.eq()`
// filters below are row selection, not authorization.
import 'server-only';
import {
  ScoredItemSchema,
  type ScoredItem,
  type AnalysisSummary,
} from '@/lib/agent/schema';
import { createServerClient } from './client';
import type { AuditItemRow, AuditRow, AuditItemWithId, AuditWithItems, AuditMeta } from './types';

// Map a persisted audit_items row to the validated camelCase domain type.
// The DB columns are NULLABLE (schema 0001) but ScoredItemSchema requires them
// non-null (and hours/cost nonnegative), so we validate through Zod rather than
// blind-casting: a null or out-of-domain column throws a clear error here
// instead of silently producing an invalid ScoredItem downstream.
function rowToScoredItem(row: AuditItemRow): ScoredItem {
  return ScoredItemSchema.parse({
    task: row.task,
    hoursPerWeek: row.hours_per_week,
    costToDelegate: row.cost_to_delegate,
    valueTier: row.value_tier,
    dripQuadrant: row.drip_quadrant,
    recommendation: row.recommendation,
    rationale: row.rationale,
    revenueProximity: row.revenue_proximity ?? undefined,
  });
}

// Wrap the validated ScoredItem with its persisted row id. The id lives outside
// the Zod parse so ScoredItemSchema stays a pure domain shape.
function rowToItemWithId(row: AuditItemRow): AuditItemWithId {
  return { id: row.id, ...rowToScoredItem(row) };
}

// Read the LLM-judged first-hire summary off an audit row. Columns are nullable
// (migration 0004; pre-0004 audits have none), so the fields pass through as-is.
function rowToSummary(row: AuditRow): AuditWithItems['summary'] {
  return {
    firstHireRole: row.first_hire_role,
    firstHireJustification: row.first_hire_justification,
  };
}

// Insert the audit, then its items. created_by is set for provenance; RLS gates
// on workspace membership, not created_by. workspace_id on both inserts is
// checked by the audits_all / audit_items_all WITH CHECK clauses.
export async function createAudit(
  workspaceId: string,
  title: string,
  items: ScoredItem[],
  summary?: AnalysisSummary,
  meta?: AuditMeta,
): Promise<AuditWithItems> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .insert({
      workspace_id: workspaceId,
      title,
      created_by: user?.id ?? null,
      first_hire_role: summary?.firstHireRole ?? null,
      first_hire_justification: summary?.firstHireJustification ?? null,
      is_at_revenue: meta?.isAtRevenue ?? null,
      annual_income: meta?.annualIncome ?? null,
      team: meta?.team ?? null,
      tool_budget: meta?.toolBudget ?? null,
    })
    .select()
    .single();
  if (auditError || !audit) {
    throw new Error(`createAudit failed: ${auditError?.message ?? 'no row returned'}`);
  }
  const auditRow = audit as AuditRow;

  const itemRows = items.map((item) => ({
    audit_id: auditRow.id,
    task: item.task,
    hours_per_week: item.hoursPerWeek,
    cost_to_delegate: item.costToDelegate,
    value_tier: item.valueTier,
    drip_quadrant: item.dripQuadrant,
    recommendation: item.recommendation,
    rationale: item.rationale,
    revenue_proximity: item.revenueProximity ?? null,
  }));

  const { data: insertedItems, error: itemsError } = await supabase
    .from('audit_items')
    .insert(itemRows)
    .select();
  if (itemsError) throw new Error(`createAudit items failed: ${itemsError.message}`);

  return {
    ...auditRow,
    items: ((insertedItems ?? []) as AuditItemRow[]).map(rowToItemWithId),
    summary: rowToSummary(auditRow),
  };
}

// Fetch an audit and its items. The `.eq('id', ...)` is a primary-key lookup;
// RLS still decides whether the row is visible to the caller.
export async function getAudit(id: string): Promise<AuditWithItems | null> {
  const supabase = await createServerClient();
  const { data: audit, error } = await supabase
    .from('audits')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getAudit failed: ${error.message}`);
  if (!audit) return null;

  const { data: items, error: itemsError } = await supabase
    .from('audit_items')
    .select('*')
    .eq('audit_id', id);
  if (itemsError) throw new Error(`getAudit items failed: ${itemsError.message}`);

  const auditRow = audit as AuditRow;
  return {
    ...auditRow,
    items: ((items ?? []) as AuditItemRow[]).map(rowToItemWithId),
    summary: rowToSummary(auditRow),
  };
}

// List audits in a workspace. The workspace_id filter scopes the query; RLS
// still enforces that the caller is a member of that workspace.
export async function listAudits(workspaceId: string): Promise<AuditRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listAudits failed: ${error.message}`);
  return (data ?? []) as AuditRow[];
}

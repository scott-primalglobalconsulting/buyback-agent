// Hand-written row types for the five buyback-agent tables. These mirror the
// snake_case columns declared in supabase/migrations/0001_init.sql exactly
// (nullable columns are `| null`). Generated types are avoided deliberately —
// `supabase gen types` needs project linking, which is Phase 5.
//
// Pure types only: no runtime code, no server-only guard. Safe to import from
// anywhere (client or server). The camelCase domain shape (`ScoredItem`) lives
// in lib/agent; mapping between the two happens in the query modules.
import type { ScoredItem } from '@/lib/agent/schema';

export interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'member';
}

export interface AuditRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  title: string | null;
  first_hire_role: string | null;
  first_hire_justification: string | null;
  is_at_revenue: boolean | null;
  annual_income: number | null;
  team: string | null;
  tool_budget: string | null;
  created_at: string;
}

export interface AuditItemRow {
  id: string;
  audit_id: string;
  task: string;
  hours_per_week: number | null;
  cost_to_delegate: number | null;
  value_tier: string | null;
  drip_quadrant: string | null;
  recommendation: string | null;
  rationale: string | null;
  revenue_proximity: string | null;
}

export interface SopRow {
  id: string;
  audit_item_id: string;
  content_md: string | null;
  created_at: string;
}

// A validated ScoredItem carrying its persisted audit_items row id. The id is
// kept alongside the domain type (rather than folded into ScoredItemSchema) so
// the schema stays a pure domain shape; the audit-detail UI (5.3c) needs the id
// to key rows and to fetch/generate the per-item SOP.
export type AuditItemWithId = ScoredItem & { id: string };

// An audit plus its items mapped into the validated camelCase domain type, and
// the LLM-judged first-hire summary read back from the audit row. `summary`
// fields are null for audits persisted before migration 0004 (or created
// without a summary). Consumed by the audit-detail page (5.3c).
export interface AuditWithItems extends AuditRow {
  items: AuditItemWithId[];
  summary: {
    firstHireRole: string | null;
    firstHireJustification: string | null;
  };
}

// Audit-level context the founder supplies at analyze time. All optional; persisted
// on the audit row and consumed by the revenue summary, Buyback Rate, and SOP prompt.
export interface AuditMeta {
  isAtRevenue?: boolean;
  annualIncome?: number;
  team?: 'solo' | 'has-team';
  toolBudget?: 'none' | 'some';
}

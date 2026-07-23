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
}

export interface SopRow {
  id: string;
  audit_item_id: string;
  content_md: string | null;
  created_at: string;
}

// An audit plus its items mapped into the validated camelCase domain type.
export interface AuditWithItems extends AuditRow {
  items: ScoredItem[];
}

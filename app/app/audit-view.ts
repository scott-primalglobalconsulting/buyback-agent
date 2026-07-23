// Pure view helpers shared by the authed audit UI (new-audit form + persisted
// audit-detail page). No React/Next/Supabase imports — safe on client and
// server, and unit-testable in isolation. The only dependency is the HIRE_ROLES
// vocab from the agent schema.
import { HIRE_ROLES } from '@/lib/agent/schema';

export type HireRole = (typeof HIRE_ROLES)[number];

export const DEFAULT_AUDIT_TITLE = 'Weekly time audit';

// Trim the user-supplied title and fall back to the default when it is empty or
// whitespace-only. The server action resolves the title through this so a blank
// field never persists an empty audit title.
export function resolveAuditTitle(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_AUDIT_TITLE;
}

// Narrow a persisted first_hire_role (string | null — nullable since migration
// 0004, and pre-0004 audits carry none) to a HireRole, or null when it is
// absent or outside the vocab. Never throws: the detail page uses the result to
// decide whether to light a ladder rung and show the first-hire stat.
export function asHireRole(role: string | null | undefined): HireRole | null {
  return role != null && (HIRE_ROLES as readonly string[]).includes(role)
    ? (role as HireRole)
    : null;
}

'use server';

// Server actions for the authed app shell. Sign-out clears the session cookies
// (auth.signOut on the cookie-bound server client) and returns to /sign-in.
// Isolation: all Supabase access comes from lib/db (createServerClient /
// createAudit); this module never touches the Anthropic SDK.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/db/client';
import { AnalysisResultSchema } from '@/lib/agent/schema';
import { createAudit } from '@/lib/db/audits';
import { resolveAuditTitle } from './audit-view';

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}

// Persist a completed analysis to an audit the caller can write. `result` is the
// client-supplied AnalysisResult — NEVER trusted: it is re-validated through
// AnalysisResultSchema server-side (a parse throw surfaces as a failed action,
// which the form renders as an error state). createAudit is RLS-scoped on
// workspace membership, so a caller can only write to their own workspace even
// if workspaceId is tampered with. Returns the new audit id for the client to
// navigate to; revalidates /app so the audit list reflects the new row.
export async function persistAudit(
  workspaceId: string,
  title: string,
  result: unknown,
): Promise<string> {
  const parsed = AnalysisResultSchema.parse(result);
  const audit = await createAudit(
    workspaceId,
    resolveAuditTitle(title),
    parsed.items,
    parsed.summary,
  );
  revalidatePath('/app');
  return audit.id;
}

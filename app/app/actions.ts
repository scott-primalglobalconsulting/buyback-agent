'use server';

// Server actions for the authed app shell. Sign-out clears the session cookies
// (auth.signOut on the cookie-bound server client) and returns to /sign-in.
// Isolation: all Supabase access comes from lib/db (createServerClient /
// createAudit); this module never touches the Anthropic SDK.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/client';
import { AnalysisResultSchema, SopSchema } from '@/lib/agent/schema';
import { createAudit } from '@/lib/db/audits';
import { saveSop } from '@/lib/db/sops';
import { getSessionUserId } from '@/lib/db/session';
import {
  getWorkspaceOwnerId,
  findUserIdByEmail,
  inviteMember,
} from '@/lib/db/workspaces';
import { sopToMarkdown } from '@/lib/sop-markdown';
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

// Persist a generated SOP against its audit_item. `sop` is the client-supplied
// Sop returned by /api/sop — NEVER trusted: it is re-validated through SopSchema
// server-side and serialized through the SAME pure sopToMarkdown the client uses
// for display, so the stored copy and the on-screen copy match exactly. saveSop
// is RLS-gated on the sop -> audit_item -> workspace membership chain, so a
// tampered auditItemId cannot write into another workspace. Returns the stored
// markdown so the client can render the persisted form immediately.
export async function persistSop(auditItemId: string, sop: unknown): Promise<string> {
  const parsed = SopSchema.parse(sop);
  const contentMd = sopToMarkdown(parsed);
  await saveSop(auditItemId, contentMd);
  return contentMd;
}

export type InviteResult = { ok: boolean; message: string };

const InviteEmailSchema = z.string().trim().email().max(320);

// Invite a teammate to a workspace by email. Owner-only, and deliberately
// enumeration-safe: we verify the CALLER owns `workspaceId` BEFORE any email
// lookup, so a non-owner (or non-member) can never use this action to probe
// which emails have accounts. Only after the owner check do we resolve the email
// via the service-role admin API. RLS on workspace_members_insert enforces
// owner-only as defense in depth. Nothing beyond a friendly outcome is leaked.
export async function inviteByEmail(
  workspaceId: string,
  rawEmail: string,
): Promise<InviteResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, message: 'Sign in to invite teammates.' };

  // OWNER GATE FIRST — no email lookup happens for a non-owner.
  const ownerId = await getWorkspaceOwnerId(workspaceId);
  if (ownerId !== userId) {
    return { ok: false, message: 'Only the workspace owner can invite teammates.' };
  }

  const parsedEmail = InviteEmailSchema.safeParse(rawEmail);
  if (!parsedEmail.success) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  const email = parsedEmail.data;

  const inviteeId = await findUserIdByEmail(email);
  if (!inviteeId) {
    return {
      ok: false,
      message: 'That person needs to sign in once first, then try inviting them again.',
    };
  }

  try {
    await inviteMember(workspaceId, inviteeId, 'member');
  } catch {
    // Most likely already a member (unique violation) — never leak specifics.
    return { ok: false, message: 'Could not add that person. They may already be a member.' };
  }

  revalidatePath('/app');
  return { ok: true, message: `Invited ${email} to the workspace.` };
}

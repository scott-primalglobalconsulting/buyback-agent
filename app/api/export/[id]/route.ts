import { getAudit } from '@/lib/db/audits';
import { getSopsForAudit } from '@/lib/db/sops';
import { getSessionUserId } from '@/lib/db/session';
import { auditToMarkdown } from '@/lib/export';

// GET /api/export/[id] — download a single-file markdown report (audit +
// SOPs). Node runtime: the query layer is server-only.
//
// ISOLATION: consumes lib/db (getAudit / getSopsForAudit / getSessionUserId) +
// lib/export ONLY. Never imports a Supabase or Anthropic client directly.
//
// RLS IS THE TENANT GUARD: getAudit is RLS-scoped, so a caller who is not a
// member of the audit's workspace gets null -> 404 (no existence leak). The 401
// below is only a clearer response for a wholly unauthenticated caller; it is
// not the authorization boundary.
export const runtime = 'nodejs';

// Turn a title into a safe download filename: keep word chars and dashes,
// collapse the rest, bound the length. Empty/undefined -> a stable fallback.
function toFilename(title: string | null): string {
  const base = (title ?? 'audit')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'audit'}.md`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const userId = await getSessionUserId();
  if (!userId) {
    return new Response('Sign in to export an audit.', { status: 401 });
  }

  const audit = await getAudit(id);
  if (!audit) {
    return new Response('Not found.', { status: 404 });
  }

  const sops = await getSopsForAudit(id);
  const markdown = auditToMarkdown(audit, sops);

  return new Response(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${toFilename(audit.title)}"`,
    },
  });
}

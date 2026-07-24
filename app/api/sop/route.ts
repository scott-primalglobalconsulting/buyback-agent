import { z } from 'zod';
import { generateSOP, ScoredItemSchema } from '@/lib/agent';
import { GUARD_LIMITS } from '@/lib/guard';
import { getSessionUserId } from '@/lib/db/session';

// POST /api/sop — Transfer-step SOP generation for a single scored task the
// founder is delegating. Node runtime: the Anthropic client (via generateSOP)
// does not run on the edge.
//
// COST-BEARING ABUSE SURFACE. Unlike /api/analyze (which serves anonymous /demo
// under the guard), SOP generation is NEVER anonymous: an unauthenticated caller
// gets a hard 401 and never reaches the API. This closes the hole where the SOP
// endpoint could be used to bleed the Anthropic budget without a session.
//
// ISOLATION: consumes lib/agent (generateSOP) + lib/db (getSessionUserId) ONLY.
// It never imports @anthropic-ai/sdk or a Supabase client directly. The API key
// never reaches the client; only the validated Sop (or a generic error) is
// returned.
export const runtime = 'nodejs';
// generateSOP is a non-streaming Anthropic call (~10-14s); raise the serverless
// timeout so it does not hit the platform's short default (e.g. 10s on Hobby).
export const maxDuration = 60;

// Bound EVERY free-text field that flows into the prompt, not just context.
// The domain ScoredItemSchema leaves task/rationale as unbounded min(1) strings;
// an authed caller could otherwise POST a huge task/rationale and inflate the
// prompt (and thus token cost) arbitrarily. task is single-sourced with the
// analyze path via GUARD_LIMITS.maxTaskLen so the two cost-bearing routes agree.
// Over-cap -> 413.
const MAX_TASK_CHARS = GUARD_LIMITS.maxTaskLen; // 500
const MAX_RATIONALE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 2000;

// Structural shape only — the length caps are checked separately so an over-long
// field returns 413 (payload too large) rather than a generic 400. The item must
// still be a structurally valid ScoredItem (enums/numbers validated here).
const SopRequestSchema = z.object({
  item: ScoredItemSchema,
  context: z.string().optional(),
  // Tiny closed enums (audit-level operator context) — validated so the prompt
  // only ever sees a known value, never arbitrary caller text.
  team: z.enum(['solo', 'has-team']).optional(),
  toolBudget: z.enum(['none', 'some']).optional(),
});

const GENERIC_ERROR = 'SOP generation failed. Please try again in a moment.';

export async function POST(req: Request): Promise<Response> {
  // Auth gate FIRST: an anonymous caller never gets to spend an API call.
  const userId = await getSessionUserId();
  if (!userId) return jsonError(401, 'Sign in to generate an SOP.');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const parsed = SopRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'Invalid request: expected { item, context?, team?, toolBudget? }.');
  }

  // Authed callers are session-gated and accountable, so the payload is fully
  // bounded HERE rather than behind the anonymous abuse-guard (which does not
  // cover this route). Per-user rate/budget limiting is intentionally deferred.
  const { item, context, team, toolBudget } = parsed.data;
  if (item.task.length > MAX_TASK_CHARS) {
    return jsonError(413, 'Task is too long. Keep it under 500 characters.');
  }
  if (item.rationale.length > MAX_RATIONALE_CHARS) {
    return jsonError(413, 'Rationale is too long. Keep it under 2000 characters.');
  }
  if (context !== undefined && context.length > MAX_CONTEXT_CHARS) {
    return jsonError(413, 'Context is too long. Keep it under 2000 characters.');
  }

  try {
    const sop = await generateSOP(item, context ?? '', { team, toolBudget });
    return new Response(JSON.stringify(sop), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return jsonError(500, GENERIC_ERROR);
  }
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

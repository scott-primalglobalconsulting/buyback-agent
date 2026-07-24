import { z } from 'zod';
import { generateSOP, ScoredItemSchema } from '@/lib/agent';
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

// Cap the free-text workspace context so a caller cannot inflate the prompt (and
// thus token cost) with an arbitrarily long payload. Over-cap -> 413.
const MAX_CONTEXT_CHARS = 2000;

// Structural shape only — the length cap is checked separately so an over-long
// context returns 413 (payload too large) rather than a generic 400.
const SopRequestSchema = z.object({
  item: ScoredItemSchema,
  context: z.string().optional(),
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
    return jsonError(400, 'Invalid request: expected { item, context? }.');
  }

  const { item, context } = parsed.data;
  if (context !== undefined && context.length > MAX_CONTEXT_CHARS) {
    return jsonError(413, 'Context is too long. Keep it under 2000 characters.');
  }

  try {
    const sop = await generateSOP(item, context ?? '');
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

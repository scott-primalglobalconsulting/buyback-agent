// Session detection for the analyze route. SERVER-ONLY. lib/db is the ONLY
// module allowed to touch Supabase, so the route asks THIS helper "is there an
// authenticated user?" instead of constructing a Supabase client itself.
//
// Uses getUser() (not getSession()) so the token is verified against the auth
// server rather than trusted from the cookie — an anonymous /demo caller must
// never be mistaken for an authenticated one, since the two paths differ in
// cost model (metered guard vs. real user input).
import 'server-only';
import { createServerClient } from './client';

// Returns the authenticated user's id, or null for an anonymous request. Never
// throws on a missing/invalid session — a failed lookup is simply "anonymous",
// which routes the caller down the guard-metered demo path.
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

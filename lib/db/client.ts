// SERVER-ONLY Supabase clients.
//
// This module reads server-only secrets (the service-role key) and uses
// next/headers cookies, so it must never be pulled into a client bundle. The
// `server-only` import makes any client-side import of this file (directly or
// transitively) a build-time error. The browser (anon) client lives in a
// separate file (./browser-client) that imports neither next/headers nor the
// service-role key, so client components can use it safely.
import 'server-only';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Authenticated, RLS-scoped client bound to the caller's session cookies.
// Every query module goes through this; RLS does the authorization.
export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled in middleware, so this is safe to
            // ignore (per the @supabase/ssr Next.js guidance).
          }
        },
      },
    },
  );
}

// RLS-BYPASSING client keyed by the service-role secret. Used only by the
// abuse-guard layer (lib/db/guard.ts, Task 4.4) against the deny-all guard
// tables. Never expose this to user-facing queries — it sees every row.
export function createServiceRoleClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

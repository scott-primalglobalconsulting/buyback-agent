// Session-refresh helper for the root middleware. SERVER/EDGE-ONLY: only ever
// imported by ./middleware.ts (repo root), which runs in the Next.js middleware
// runtime — never in a client bundle.
//
// Isolation: the Supabase client is constructed HERE (inside lib/db), not in the
// root middleware, so lib/db stays the sole owner of every @supabase/* import.
// This is a SEPARATE client from ./client.ts: that one is next/headers-cookie
// bound (Server Components / route handlers); middleware must instead read/write
// cookies on the request/response pair, which is what this helper does.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refresh the auth session on every matched request. Follows the canonical
// @supabase/ssr middleware pattern: build a response, mirror cookie writes onto
// BOTH request and response, then call getUser() to trigger a refresh when the
// access token is near expiry. Returns the response carrying any refreshed
// cookies — the caller MUST return this object unchanged (or copy its cookies)
// or the browser and server sessions can drift and log the user out.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser(): getUser() is what
  // refreshes the session, and interleaving work here is a known source of
  // random logouts. This helper does not redirect — the /app layout owns the
  // auth gate; middleware only keeps the session fresh.
  await supabase.auth.getUser();

  return supabaseResponse;
}

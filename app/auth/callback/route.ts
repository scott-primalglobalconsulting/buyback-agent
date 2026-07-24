// Magic-link callback. The email link redirects here with a `?code=...` PKCE
// code; we exchange it for a session (which writes the auth cookies) and land
// the user in /app. On any failure we bounce back to /sign-in with an error
// marker so the form can prompt for a fresh link.
//
// Isolation: the Supabase client comes from lib/db (createServerClient). It is
// cookie-bound via next/headers, whose cookie store IS writable from a route
// handler, so exchangeCodeForSession persists the session cookies correctly
// with no divergence from the lib/db seam.
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { listWorkspacesForUser, createWorkspace } from '@/lib/db/workspaces';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`);
  }

  // First-sign-in bootstrap: guarantee at least one workspace exists. Runs once
  // per sign-in here (moved out of the /app layout) so concurrent renders can't
  // race to double-create. A bootstrap failure must NOT 500 the callback — the
  // session is already established; log and still land the user in /app. There
  // is no automatic retry path — a rare bootstrap failure leaves the user with
  // no workspace until the next sign-in re-runs this block.
  try {
    const workspaces = await listWorkspacesForUser();
    if (workspaces.length === 0) {
      await createWorkspace('Personal Workspace');
    }
  } catch (bootstrapError) {
    console.error('auth callback workspace bootstrap failed:', bootstrapError);
  }

  return NextResponse.redirect(`${origin}/app`);
}

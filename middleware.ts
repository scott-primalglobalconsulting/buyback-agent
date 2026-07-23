// Root middleware: refresh the Supabase auth session on every navigation so
// server components see a live session and cookies stay in sync. The Supabase
// client construction lives in lib/db/middleware (isolation — lib/db is the
// only module that touches @supabase/*); this file just wires it to the matcher.
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/db/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on every path EXCEPT Next internals and static assets — those never
  // carry an auth session to refresh, so skipping them avoids needless work.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

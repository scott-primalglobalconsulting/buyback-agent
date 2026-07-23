'use server';

// Server actions for the authed app shell. Sign-out clears the session cookies
// (auth.signOut on the cookie-bound server client) and returns to /sign-in.
// Isolation: the Supabase client comes from lib/db (createServerClient).
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/db/client';

export async function signOut() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}

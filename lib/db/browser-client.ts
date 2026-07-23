// Browser (anon) Supabase client. Client-bundle safe by construction: it reads
// only NEXT_PUBLIC_* env and imports neither next/headers nor the service-role
// key. Kept separate from ./client (which is server-only) so client components
// can import it without dragging server secrets into the bundle.
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

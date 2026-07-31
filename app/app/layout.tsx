import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUserId } from '@/lib/db/session';
import { signOut } from './actions';
import { ThemeToggle } from '@/components/ThemeToggle';

// Session gate for the authed app. Server component: no session -> /sign-in.
// Workspace bootstrap runs once per sign-in in the auth callback (not here) so
// concurrent layout renders can't race to double-create a workspace. All
// Supabase access goes through lib/db (session); this layout never touches the
// client directly.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = await getSessionUserId();
  if (!uid) redirect('/sign-in');

  return (
    <div className="page">
      <header className="site-head">
        <Link className="brand" href="/app">
          Buyback Agent
        </Link>
        <nav className="app-nav">
          <ThemeToggle />
          <Link className="nav-link" href="/app">
            My audits
          </Link>
          <form action={signOut}>
            <button type="submit" className="nav-link app-signout">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="wrap demo-main">{children}</main>
    </div>
  );
}

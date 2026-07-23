import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUserId } from '@/lib/db/session';
import { listWorkspacesForUser, createWorkspace } from '@/lib/db/workspaces';
import { signOut } from './actions';

// Session gate for the authed app. Server component: no session -> /sign-in.
// On first sign-in the user has no workspace yet, so bootstrap a personal one
// before rendering. All Supabase access goes through lib/db (session +
// workspaces); this layout never touches the client directly.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = await getSessionUserId();
  if (!uid) redirect('/sign-in');

  // First-sign-in bootstrap: guarantee at least one workspace exists.
  const workspaces = await listWorkspacesForUser();
  if (workspaces.length === 0) {
    await createWorkspace('Personal Workspace');
  }

  return (
    <div className="page">
      <header className="site-head">
        <Link className="brand" href="/app">
          Buyback Agent
        </Link>
        <nav className="app-nav">
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

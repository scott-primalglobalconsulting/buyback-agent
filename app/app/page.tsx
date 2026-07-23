import { listWorkspacesForUser } from '@/lib/db/workspaces';

// Minimal authed landing. Placeholder for Task 5.3b (the audit list + "New
// audit" entry form land here). For now it confirms the session gate and the
// first-sign-in workspace bootstrap: it shows the caller's workspace(s), which
// are only readable once RLS sees an authenticated member.
export default async function AppHome() {
  const workspaces = await listWorkspacesForUser();

  return (
    <section className="section">
      <div className="section-head">
        <span className="eyebrow">Signed in</span>
        <h2>Your workspace</h2>
      </div>
      <ul className="toplist">
        {workspaces.map((ws) => (
          <li key={ws.id} className="topitem">
            <span className="name">{ws.name}</span>
          </li>
        ))}
      </ul>
      <p className="disclaimer">
        Audit history and the new-audit form arrive next. This screen confirms
        your session and personal workspace are set up.
      </p>
    </section>
  );
}

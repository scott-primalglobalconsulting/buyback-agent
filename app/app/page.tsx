import Link from 'next/link';
import { listWorkspacesForUser } from '@/lib/db/workspaces';
import { listAudits } from '@/lib/db/audits';
import { NewAuditForm } from './new-audit-form';

// Authed home: the user's audit history + the new-audit entry form. Server
// component — reads through lib/db only (RLS scopes both queries to the caller's
// workspaces). The workspace is the personal one seeded at first sign-in
// (auth callback bootstrap); [0] is the newest, which for a personal account is
// the only one. All agent/persistence reach happens inside NewAuditForm.
export default async function AppHome() {
  const workspaces = await listWorkspacesForUser();
  const ws = workspaces[0];

  // Defensive: the auth-callback bootstrap seeds a workspace on first sign-in, so
  // this should not happen for a signed-in user — but never render the form
  // without a workspace to write to.
  if (!ws) {
    return (
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">Setup incomplete</span>
          <h2>No workspace yet</h2>
        </div>
        <p className="disclaimer">
          Your workspace has not finished setting up. Sign out and back in to
          finish, or try again in a moment.
        </p>
      </section>
    );
  }

  const audits = await listAudits(ws.id);
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

  return (
    <>
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">New analysis</span>
          <h2>Audit your week</h2>
        </div>
        <NewAuditForm workspaceId={ws.id} />
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">History</span>
          <h2>Your audits</h2>
        </div>
        {audits.length === 0 ? (
          <div className="audit-empty">
            <p>
              No audits yet. Enter a week above (or load the sample week) and run
              your first analysis — it will appear here.
            </p>
          </div>
        ) : (
          <ul className="audit-list">
            {audits.map((a) => (
              <li key={a.id}>
                <Link className="audit-link" href={`/app/audit/${a.id}`}>
                  <span className="audit-title">{a.title ?? 'Untitled audit'}</span>
                  <span className="audit-date tnum">{fmt.format(new Date(a.created_at))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

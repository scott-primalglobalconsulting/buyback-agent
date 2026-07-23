import { notFound } from 'next/navigation';
import { getAudit } from '@/lib/db/audits';
import { asHireRole } from '../../audit-view';
import { BuybackRate } from '@/components/BuybackRate';
import { DripDashboard } from '@/components/DripDashboard';
import { TopTasks } from '@/components/TopTasks';
import { ReplacementLadder } from '@/components/ReplacementLadder';
import { AuditTable } from '@/components/AuditTable';

// Persisted audit detail. Server component — getAudit is RLS-scoped, so a caller
// who is not a member of the audit's workspace gets null -> 404 (no leak of
// existence). Renders the SAME dashboard as /demo from the PERSISTED rows.
//
// NULL-SUMMARY: summary.firstHireRole is `string | null` — null for audits
// stored before migration 0004 (or without a summary). asHireRole narrows it:
// when it is a real HIRE_ROLES value we light the ladder rung and show the
// first-hire stat; when null the components degrade gracefully (no rung lit, no
// first-hire stat) instead of crashing. Audits created through the new-audit
// form always carry a summary, so the null path is the legacy/edge case.
//
// The SOP generation button + workspace invite are Task 5.3d — NOT here.
export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();

  const { items, summary } = audit;
  const firstHireRole = asHireRole(summary.firstHireRole);

  return (
    <>
      <div className="section-head">
        <span className="eyebrow">Audit</span>
        <h2>{audit.title ?? 'Untitled audit'}</h2>
      </div>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">The number it turns on</span>
          <h2>Your buyback rate</h2>
        </div>
        <BuybackRate items={items} firstHireRole={firstHireRole} />
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">DRIP allocation</span>
          <h2>Where your week goes</h2>
        </div>
        <DripDashboard items={items} />
      </section>

      <div className="dash-grid">
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Shed first</span>
            <h2>Offload these tasks</h2>
          </div>
          <TopTasks items={items} />
        </section>
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Replacement ladder</span>
            <h2>Your first hire</h2>
          </div>
          <ReplacementLadder
            firstHireRole={firstHireRole}
            justification={summary.firstHireJustification ?? ''}
          />
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">The full ledger</span>
          <h2>Every task, scored</h2>
        </div>
        <AuditTable items={items} />
      </section>
    </>
  );
}

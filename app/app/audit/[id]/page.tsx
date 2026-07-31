import { notFound } from 'next/navigation';
import { getAudit } from '@/lib/db/audits';
import { getSopsForAudit } from '@/lib/db/sops';
import { asHireRole } from '../../audit-view';
import { buybackHourlyRate } from '@/lib/buyback/rate';
import { BuybackRate } from '@/components/BuybackRate';
import { RevenueSummary } from '@/components/RevenueSummary';
import { DripDashboard } from '@/components/DripDashboard';
import { TopTasks } from '@/components/TopTasks';
import { ReplacementLadder } from '@/components/ReplacementLadder';
import { AuditTable } from '@/components/AuditTable';
import { SopPanel } from './sop-panel';

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

  // Tasks the analysis says to hand off — each gets a Generate SOP control.
  const delegateItems = items.filter((it) => it.recommendation === 'delegate');

  // Already-persisted SOPs, keyed by audit_item id. getSopsForAudit orders newest
  // first, so the first row seen per item is the latest; keep that one.
  const persistedSops = await getSopsForAudit(audit.id);
  const initialSops: Record<string, string> = {};
  for (const row of persistedSops) {
    if (row.content_md != null && !(row.audit_item_id in initialSops)) {
      initialSops[row.audit_item_id] = row.content_md;
    }
  }

  return (
    <>
      <div className="section-head">
        <span className="eyebrow">Audit</span>
        <h2>{audit.title ?? 'Untitled audit'}</h2>
        <a className="btn btn-ghost" href={`/api/export/${audit.id}`}>
          Download markdown
        </a>
      </div>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">The number it turns on</span>
          <h2>Your reclaimable time</h2>
        </div>
        <BuybackRate
          items={items}
          firstHireRole={firstHireRole}
          annualIncome={audit.annual_income ?? undefined}
        />
        <RevenueSummary items={items} isAtRevenue={audit.is_at_revenue ?? false} />
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">DRIP allocation</span>
          <h2>Where your week goes</h2>
        </div>
        <DripDashboard items={items} />
      </section>

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

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">The full ledger</span>
          <h2>Every task, scored</h2>
        </div>
        <AuditTable
          items={items}
          hourlyRate={
            audit.annual_income != null && audit.annual_income > 0
              ? buybackHourlyRate(audit.annual_income)
              : undefined
          }
        />
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">Transfer step</span>
          <h2>Delegation SOPs</h2>
        </div>
        <SopPanel
          items={delegateItems}
          initialSops={initialSops}
          team={audit.team === 'solo' || audit.team === 'has-team' ? audit.team : undefined}
          toolBudget={
            audit.tool_budget === 'none' || audit.tool_budget === 'some'
              ? audit.tool_budget
              : undefined
          }
        />
      </section>
    </>
  );
}

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnalysisResult } from '@/lib/agent';
import { BuybackRate } from '@/components/BuybackRate';
import { DripDashboard } from '@/components/DripDashboard';
import { ReplacementLadder } from '@/components/ReplacementLadder';
import { TopTasks } from '@/components/TopTasks';
import { AuditTable } from '@/components/AuditTable';

// Scored SAMPLE_WEEK: the fixed demo week (40 hrs) scored per the approved
// mockup. Delegate 15 + Replace 5 = 20 shed hrs -> buyback rate 20/40 = 50%.
const FIXTURE: AnalysisResult = {
  items: [
    { task: 'Bookkeeping and reconciliation', hoursPerWeek: 4, costToDelegate: 40, valueTier: '$10', dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'low value' },
    { task: 'Inbox triage and scheduling', hoursPerWeek: 6, costToDelegate: 30, valueTier: '$10', dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'low value' },
    { task: 'Customer support tickets', hoursPerWeek: 5, costToDelegate: 45, valueTier: '$100', dripQuadrant: 'Delegate', recommendation: 'delegate', rationale: 'hand off' },
    { task: 'CRM data entry', hoursPerWeek: 3, costToDelegate: 25, valueTier: '$10', dripQuadrant: 'Replace', recommendation: 'eliminate', rationale: 'automatable' },
    { task: 'Manual invoicing', hoursPerWeek: 2, costToDelegate: 35, valueTier: '$100', dripQuadrant: 'Replace', recommendation: 'eliminate', rationale: 'automatable' },
    { task: 'Hiring and interviews', hoursPerWeek: 3, costToDelegate: 120, valueTier: '$1000', dripQuadrant: 'Invest', recommendation: 'keep', rationale: 'durable asset' },
    { task: 'Content and thought leadership', hoursPerWeek: 4, costToDelegate: 90, valueTier: '$1000', dripQuadrant: 'Invest', recommendation: 'keep', rationale: 'durable asset' },
    { task: 'Sales calls discovery', hoursPerWeek: 6, costToDelegate: 150, valueTier: '$1000', dripQuadrant: 'Produce', recommendation: 'keep', rationale: 'founder output' },
    { task: 'Product strategy and roadmap', hoursPerWeek: 5, costToDelegate: 250, valueTier: '$10000', dripQuadrant: 'Produce', recommendation: 'keep', rationale: 'founder output' },
    { task: 'Investor updates', hoursPerWeek: 2, costToDelegate: 200, valueTier: '$1000', dripQuadrant: 'Produce', recommendation: 'keep', rationale: 'founder output' },
  ],
  summary: {
    firstHireRole: 'admin',
    firstHireJustification: 'Unloads roughly 20 delegatable hours across bookkeeping, inbox, and support.',
  },
};

describe('BuybackRate', () => {
  it('renders the fraction as a 50% hero, reclaimable hours, and the first hire', () => {
    const html = renderToStaticMarkup(
      <BuybackRate items={FIXTURE.items} firstHireRole={FIXTURE.summary.firstHireRole} />,
    );
    expect(html).toContain('50%');
    expect(html).toContain('of 40 hrs/wk');
    expect(html).toContain('>20<'); // reclaimable = Delegate 15 + Replace 5
    expect(html).not.toContain('$62'); // no dollar rate
    // Second support stat is the first hire, not a total-logged figure.
    expect(html).toContain('First hire');
    expect(html).toContain('Admin');
    expect(html).not.toContain('Total logged');
  });
});

describe('DripDashboard', () => {
  it('renders the per-quadrant hours from the rollup', () => {
    const html = renderToStaticMarkup(<DripDashboard items={FIXTURE.items} />);
    // Delegate 15, Replace 5, Invest 7, Produce 13 hrs/wk. Anchor Replace=5 with
    // a leading `>` so it cannot match Delegate's "15" as a substring.
    expect(html).toMatch(/15<small> hrs\/wk/);
    expect(html).toMatch(/>5<small> hrs\/wk/);
    expect(html).toMatch(/7<small> hrs\/wk/);
    expect(html).toMatch(/13<small> hrs\/wk/);
    // Shed = 20, Keep = 20 brackets
    expect(html).toContain('Shed');
    expect(html).toContain('Keep');
    // task chip landed in its quadrant cell
    expect(html).toContain('CRM data entry');
    // each of the four quadrants direct-labeled
    for (const q of ['Delegate', 'Replace', 'Invest', 'Produce']) {
      expect(html).toContain(q);
    }
  });
});

describe('ReplacementLadder', () => {
  it('highlights the given firstHireRole and dims the rest', () => {
    const html = renderToStaticMarkup(
      <ReplacementLadder
        firstHireRole={FIXTURE.summary.firstHireRole}
        justification={FIXTURE.summary.firstHireJustification}
      />,
    );
    // Admin rung is lit and tagged hire-first
    expect(html).toMatch(/class="rung on"[\s\S]*?Admin/);
    expect(html).toContain('Hire first');
    // a non-recommended rung is dimmed
    expect(html).toMatch(/class="rung off"[\s\S]*?Sales/);
    expect(html).toContain(FIXTURE.summary.firstHireJustification);
  });

  it('follows firstHireRole when it is a different rung', () => {
    const html = renderToStaticMarkup(
      <ReplacementLadder firstHireRole="delivery" justification="x" />,
    );
    expect(html).toMatch(/class="rung on"[\s\S]*?Delivery/);
    expect(html).toMatch(/class="rung off"[\s\S]*?Admin/);
  });
});

describe('TopTasks', () => {
  it('lists the top non-keep tasks by hours', () => {
    const html = renderToStaticMarkup(<TopTasks items={FIXTURE.items} />);
    const rows = (html.match(/class="topitem"/g) || []).length;
    expect(rows).toBe(3); // top 3 offload candidates
    expect(html).toContain('Customer support tickets'); // 5 hrs, delegate
    expect(html).not.toContain('Investor updates'); // keep, excluded
  });
});

describe('AuditTable', () => {
  it('renders a row per item with quadrant and call chips', () => {
    const html = renderToStaticMarkup(<AuditTable items={FIXTURE.items} />);
    const rows = (html.match(/class="t-task"/g) || []).length;
    expect(rows).toBe(FIXTURE.items.length);
    expect(html).toContain('rec delegate');
    expect(html).toContain('rec eliminate');
    expect(html).toContain('rec keep');
    // value tier formatting with thousands separators
    expect(html).toContain('$1,000');
    expect(html).toContain('$10,000');
    // DRIP chip is direct-labeled, not color alone
    expect(html).toContain('>Delegate<');
  });
});

import { describe, it, expect } from 'vitest';
import { auditToMarkdown } from '@/lib/export';
import type { AuditWithItems, SopRow } from '@/lib/db/types';

// A three-task audit with known numbers so the buyback math is exact:
// total 20 hrs/wk, low-value (Delegate+Replace) 15 -> buyback rate 75%.
const AUDIT: AuditWithItems = {
  id: 'audit-1',
  workspace_id: 'ws-1',
  created_by: 'user-1',
  title: 'Q3 Founder Audit',
  first_hire_role: 'admin',
  first_hire_justification: 'Admin work eats the most low-value hours.',
  is_at_revenue: null,
  annual_income: null,
  team: null,
  tool_budget: null,
  created_at: '2026-07-23T00:00:00.000Z',
  items: [
    {
      id: 'item-book',
      task: 'Reconcile the books',
      hoursPerWeek: 10,
      costToDelegate: 30,
      valueTier: '$100',
      dripQuadrant: 'Delegate',
      recommendation: 'delegate',
      rationale: 'Repetitive, rules-based, low judgment.',
    },
    {
      id: 'item-support',
      task: 'Answer support tickets',
      hoursPerWeek: 5,
      costToDelegate: 25,
      valueTier: '$10',
      dripQuadrant: 'Replace',
      recommendation: 'delegate',
      rationale: 'Draining and low value.',
    },
    {
      id: 'item-vision',
      task: 'Set product vision',
      hoursPerWeek: 5,
      costToDelegate: 500,
      valueTier: '$10000',
      dripQuadrant: 'Produce',
      recommendation: 'keep',
      rationale: 'Only the founder can do this.',
    },
  ],
  summary: {
    firstHireRole: 'admin',
    firstHireJustification: 'Admin work eats the most low-value hours.',
  },
};

const SOPS: SopRow[] = [
  {
    id: 'sop-1',
    audit_item_id: 'item-book',
    content_md: '# Standard Operating Procedure\n\nBOOKKEEPING_SOP_BODY',
    created_at: '2026-07-23T01:00:00.000Z',
  },
  {
    id: 'sop-2',
    audit_item_id: 'item-support',
    content_md: '# Standard Operating Procedure\n\nSUPPORT_SOP_BODY',
    created_at: '2026-07-23T01:05:00.000Z',
  },
];

// Same shape as AUDIT, but its items carry revenueProximity so the sold-vs-built
// line has something to report. revenue-direct = 5 (vision), other = 15.
const AUDIT_WITH_PROXIMITY: AuditWithItems = {
  ...AUDIT,
  items: [
    { ...AUDIT.items[0], revenueProximity: 'non-revenue' },
    { ...AUDIT.items[1], revenueProximity: 'revenue-adjacent' },
    { ...AUDIT.items[2], revenueProximity: 'revenue-direct' },
  ],
};

// annual_income drives the real Buyback Rate: 200000/2000/4 = $25/hr.
const AUDIT_WITH_INCOME: AuditWithItems = {
  ...AUDIT,
  annual_income: 200000,
};

describe('auditToMarkdown', () => {
  it('renders the audit title as the top-level heading', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    expect(md).toContain('# Q3 Founder Audit');
  });

  it('renders the reclaimable time as the exact whole percent with reclaimable vs total hours', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    // Anchor the exact formatted token, not a loose "75%" substring.
    expect(md).toContain('**Reclaimable time: 75%**: 15 of 20 weekly hours are reclaimable.');
  });

  it('renders the DRIP quadrant-hour rollup in the DRIP allocation section', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    // Anchor to the allocation section's `- Quadrant: N hrs/wk` lines, so this
    // does not pass merely because the quadrant words appear as table columns.
    // Fixture rollup: Delegate 10, Replace 5, Invest 0, Produce 5.
    expect(md).toContain('## DRIP allocation');
    expect(md).toContain('- Delegate: 10 hrs/wk');
    expect(md).toContain('- Replace: 5 hrs/wk');
    expect(md).toContain('- Invest: 0 hrs/wk');
    expect(md).toContain('- Produce: 5 hrs/wk');
  });

  it('renders a scored table row for every item with a polished value-tier label', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    // The export shows thousands-separated tier labels, not the raw enum.
    const TIER_LABEL: Record<string, string> = {
      $10: '$10',
      $100: '$100',
      $1000: '$1,000',
      $10000: '$10,000',
    };
    for (const item of AUDIT.items) {
      expect(md).toContain(item.task);
      expect(md).toContain(TIER_LABEL[item.valueTier]);
    }
    // The $10,000 tier renders formatted, never as the raw enum.
    expect(md).toContain('$10,000');
    expect(md).not.toContain('$10000');
    // A markdown table header row exists.
    expect(md).toMatch(/\|\s*Task\s*\|/);
  });

  it('lists every HIRE_ROLES rung and marks the recommended first hire', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    for (const role of ['admin', 'delivery', 'marketing', 'sales', 'leadership']) {
      expect(md).toContain(role);
    }
    // The recommended role is emphasized and the justification is present.
    expect(md).toContain('**admin**');
    expect(md).toContain('Admin work eats the most low-value hours.');
  });

  it('embeds each SOP body under a heading naming its task', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    const bookHeading = md.indexOf('Reconcile the books');
    const bookBody = md.indexOf('BOOKKEEPING_SOP_BODY');
    const supportHeading = md.lastIndexOf('Answer support tickets');
    const supportBody = md.indexOf('SUPPORT_SOP_BODY');
    expect(bookBody).toBeGreaterThan(-1);
    expect(supportBody).toBeGreaterThan(-1);
    // The SOP body appears after a heading that names its task.
    expect(bookBody).toBeGreaterThan(bookHeading);
    expect(supportBody).toBeGreaterThan(supportHeading);
  });

  it('handles a null summary without crashing and omits the highlight/justification', () => {
    const audit: AuditWithItems = {
      ...AUDIT,
      first_hire_role: null,
      first_hire_justification: null,
      summary: { firstHireRole: null, firstHireJustification: null },
    };
    const md = auditToMarkdown(audit, SOPS);
    // Still renders the ladder rungs, but nothing is marked recommended.
    expect(md).toContain('admin');
    expect(md).not.toContain('**admin**');
    expect(md).not.toContain('Admin work eats the most low-value hours.');
  });

  it('embeds a regenerated SOP only once per audit item', () => {
    // A regenerated SOP produces two rows for the same audit_item_id (newest
    // first, matching getSopsForAudit). Only the first-seen (latest) body should
    // appear — mirrors the audit-detail page dedup.
    const sops: SopRow[] = [
      {
        id: 'sop-book-v2',
        audit_item_id: 'item-book',
        content_md: '# Standard Operating Procedure\n\nBOOKKEEPING_SOP_LATEST',
        created_at: '2026-07-23T03:00:00.000Z',
      },
      {
        id: 'sop-book-v1',
        audit_item_id: 'item-book',
        content_md: '# Standard Operating Procedure\n\nBOOKKEEPING_SOP_STALE',
        created_at: '2026-07-23T01:00:00.000Z',
      },
    ];
    const md = auditToMarkdown(AUDIT, sops);
    // The latest body is embedded exactly once; the stale one is dropped.
    const occurrences = (s: string) => md.split(s).length - 1;
    expect(occurrences('BOOKKEEPING_SOP_LATEST')).toBe(1);
    expect(md).not.toContain('BOOKKEEPING_SOP_STALE');
    // Exactly one SOP heading for the item (no duplicate section).
    expect(occurrences('### SOP: Reconcile the books')).toBe(1);
  });

  it('renders the sold-vs-built line when proximity is present', () => {
    const md = auditToMarkdown(AUDIT_WITH_PROXIMITY, SOPS);
    expect(md).toMatch(/revenue-direct/i);
    // revenue-direct = 5 (vision), everything else = 15.
    expect(md).toContain('5 hrs/wk revenue-direct');
    expect(md).toContain('15 hrs/wk everything else');
  });

  it('omits the sold-vs-built line when no item carries proximity', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    expect(md).not.toContain('Sold vs built');
  });

  it('renders the Buyback Rate line when annual_income is set', () => {
    const md = auditToMarkdown(AUDIT_WITH_INCOME, SOPS); // annual_income: 200000
    expect(md).toContain('$25/hr'); // 200000/2000/4
  });

  it('omits the Buyback Rate line when annual_income is null', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    expect(md).not.toContain('Buyback Rate');
  });

  it('renders a Revenue column in the scored table', () => {
    const md = auditToMarkdown(AUDIT_WITH_PROXIMITY, SOPS);
    expect(md).toMatch(/\|\s*Revenue\s*\|/);
    expect(md).toContain('revenue-adjacent');
  });

  it('renders "not scored" in the Revenue column for untagged items', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    expect(md).toMatch(/\|\s*Revenue\s*\|/);
    expect(md).toContain('not scored');
  });

  it('skips SOP rows with null content_md', () => {
    const sops: SopRow[] = [
      ...SOPS,
      { id: 'sop-3', audit_item_id: 'item-vision', content_md: null, created_at: '2026-07-23T02:00:00.000Z' },
    ];
    const md = auditToMarkdown(AUDIT, sops);
    // The keep task has no SOP body embedded (no crash, no empty heading spam).
    expect(md).toContain('BOOKKEEPING_SOP_BODY');
  });
});

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

describe('auditToMarkdown', () => {
  it('renders the audit title as the top-level heading', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    expect(md).toContain('# Q3 Founder Audit');
  });

  it('renders the buyback rate as a whole percent with reclaimable vs total hours', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    expect(md).toContain('75%');
    expect(md).toContain('15');
    expect(md).toContain('20');
  });

  it('renders the DRIP quadrant-hour rollup', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    expect(md).toContain('Delegate');
    expect(md).toContain('Replace');
    expect(md).toContain('Invest');
    expect(md).toContain('Produce');
  });

  it('renders a scored table row for every item', () => {
    const md = auditToMarkdown(AUDIT, SOPS);
    for (const item of AUDIT.items) {
      expect(md).toContain(item.task);
      expect(md).toContain(item.valueTier);
    }
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

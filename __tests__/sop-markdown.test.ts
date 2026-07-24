import { describe, it, expect } from 'vitest';
import { sopToMarkdown } from '@/lib/sop-markdown';
import type { Sop } from '@/lib/agent/schema';

const SOP: Sop = {
  purpose: 'Keep the books reconciled so the cash position is always accurate.',
  steps: [
    'Open the bank feed in the accounting tool.',
    'Match each transaction to a recorded entry.',
    'Flag any unmatched line for founder review.',
  ],
  definitionOfDone: 'Every transaction is matched and the report shows a $0 difference.',
  toolsNeeded: ['QuickBooks', 'Bank login'],
};

describe('sopToMarkdown', () => {
  it('serializes the purpose, every step, the definition of done, and every tool', () => {
    const md = sopToMarkdown(SOP);

    expect(md).toContain(SOP.purpose);
    for (const step of SOP.steps) expect(md).toContain(step);
    expect(md).toContain(SOP.definitionOfDone);
    for (const tool of SOP.toolsNeeded) expect(md).toContain(tool);
  });

  it('numbers the steps as an ordered list', () => {
    const md = sopToMarkdown(SOP);
    expect(md).toContain('1. Open the bank feed in the accounting tool.');
    expect(md).toContain('2. Match each transaction to a recorded entry.');
    expect(md).toContain('3. Flag any unmatched line for founder review.');
  });

  it('renders tools as a bulleted list', () => {
    const md = sopToMarkdown(SOP);
    expect(md).toContain('- QuickBooks');
    expect(md).toContain('- Bank login');
  });

  it('falls back to "None" when no tools are needed', () => {
    const md = sopToMarkdown({ ...SOP, toolsNeeded: [] });
    expect(md).toContain('None');
  });

  it('includes section headings', () => {
    const md = sopToMarkdown(SOP);
    expect(md).toContain('## Purpose');
    expect(md).toContain('## Steps');
    expect(md).toContain('## Definition of Done');
    expect(md).toContain('## Tools Needed');
  });
});

// Pure serializer: turn a persisted audit + its SOPs into ONE self-contained
// markdown report (the same sections the dashboard renders, flattened to text).
//
// PURE: imports only lib/buyback (domain math) + lib/db types + the agent-layer
// HIRE_ROLES enum. NEVER touches React/Next/Supabase/Anthropic, and never reads
// the clock — any timestamp must be passed in by the caller. This keeps it
// unit-testable and safe to import from anywhere.
import { HIRE_ROLES } from '@/lib/agent/schema';
import { buybackRate } from '@/lib/buyback/rate';
import { quadrantHourRollup } from '@/lib/buyback/rollups';
import { DRIP_QUADRANTS } from '@/lib/buyback/types';
import type { AuditWithItems, SopRow } from '@/lib/db/types';

// A markdown table cell must not contain a raw pipe (it would split the row) or
// a newline (it would break the table). Escape the pipe, flatten whitespace.
function cell(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

export function auditToMarkdown(audit: AuditWithItems, sops: SopRow[]): string {
  const { items, summary } = audit;
  const title = audit.title ?? 'Untitled audit';

  const total = items.reduce((sum, i) => sum + i.hoursPerWeek, 0);
  const rollup = quadrantHourRollup(items);
  const reclaimable = rollup.Delegate + rollup.Replace;
  const ratePct = Math.round(buybackRate(items) * 100);

  const lines: string[] = [];

  lines.push(`# ${title}`, '');
  lines.push(
    `**Buyback rate: ${ratePct}%**: ${reclaimable} of ${total} weekly hours are reclaimable.`,
    '',
  );

  // DRIP allocation — hours per quadrant, fixed quadrant order.
  lines.push('## DRIP allocation', '');
  for (const q of DRIP_QUADRANTS) {
    lines.push(`- ${q}: ${rollup[q]} hrs/wk`);
  }
  lines.push('');

  // The full ledger, one row per scored task.
  lines.push('## Every task, scored', '');
  lines.push('| Task | Hrs/wk | $/hr | Value | DRIP | Call |');
  lines.push('| --- | ---: | ---: | --- | --- | --- |');
  for (const it of items) {
    lines.push(
      `| ${cell(it.task)} | ${it.hoursPerWeek} | ${it.costToDelegate} | ${cell(it.valueTier)} | ${it.dripQuadrant} | ${it.recommendation} |`,
    );
  }
  lines.push('');

  // Replacement ladder — the fixed hire order, with the recommended rung marked.
  // Null summary (legacy/pre-0004 audits): render the rungs plain, no highlight,
  // no justification.
  lines.push('## Replacement ladder', '');
  const recommended = summary.firstHireRole;
  for (const role of HIRE_ROLES) {
    if (role === recommended) {
      lines.push(`- **${role}** (recommended first hire)`);
    } else {
      lines.push(`- ${role}`);
    }
  }
  lines.push('');
  if (summary.firstHireJustification) {
    lines.push(summary.firstHireJustification, '');
  }

  // Delegation SOPs — embed each persisted SOP body under a heading naming the
  // task it belongs to. content_md is already markdown (lib/sop-markdown), so it
  // goes in as-is. Rows with null content_md or an unknown item are skipped.
  const itemById = new Map(items.map((it) => [it.id, it]));
  const embeddable = sops.filter((s) => s.content_md != null);
  if (embeddable.length > 0) {
    lines.push('## Delegation SOPs', '');
    for (const sop of embeddable) {
      const item = itemById.get(sop.audit_item_id);
      const heading = item ? item.task : 'Task';
      lines.push(`### SOP: ${heading}`, '');
      lines.push(sop.content_md as string, '');
    }
  }

  return lines.join('\n');
}

// Pure serializer: turn a persisted audit + its SOPs into ONE self-contained
// markdown report (the same sections the dashboard renders, flattened to text).
//
// PURE: imports only lib/buyback (domain math) + lib/db types + the agent-layer
// HIRE_ROLES enum. NEVER touches React/Next/Supabase/Anthropic, and never reads
// the clock — any timestamp must be passed in by the caller. This keeps it
// unit-testable and safe to import from anywhere.
import { HIRE_ROLES } from '@/lib/agent/schema';
import { buybackHourlyRate, buybackRate } from '@/lib/buyback/rate';
import { soldVsBuilt } from '@/lib/buyback/revenue';
import { quadrantHourRollup } from '@/lib/buyback/rollups';
import { DRIP_QUADRANTS } from '@/lib/buyback/types';
import type { ValueTier } from '@/lib/buyback/types';
import type { AuditWithItems, SopRow } from '@/lib/db/types';

// Client-facing labels for the value-tier enum: the raw enum stores `$10000`,
// but the export should read as polished as the UI (which shows `$10,000`).
// Local const map keeps lib/export pure — no UI imports.
const VALUE_TIER_LABEL: Record<ValueTier, string> = {
  $10: '$10',
  $100: '$100',
  $1000: '$1,000',
  $10000: '$10,000',
};

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
    `**Reclaimable time: ${ratePct}%**: ${reclaimable} of ${total} weekly hours are reclaimable.`,
    '',
  );

  // Sold vs built — hours that move money vs everything else. Self-hide when no
  // item carries proximity (pre-0005 audits), so old data never reads as if all
  // hours were "everything else". Mirrors the render layer's `anyTagged` gate.
  const anyTagged = items.some((i) => i.revenueProximity != null);
  if (anyTagged) {
    const { revenueDirect, other } = soldVsBuilt(items);
    lines.push(
      `**Sold vs built:** ${revenueDirect} hrs/wk revenue-direct, ${other} hrs/wk everything else.`,
      '',
    );
  }

  // The true Buyback Rate (annual income / 2000 / 4). Only when the founder gave
  // a positive income, so we never print a bogus $0/hr line.
  const income = audit.annual_income;
  if (income != null && income > 0) {
    lines.push(
      `**Buyback Rate:** $${buybackHourlyRate(income)}/hr (delegate work worth less than this).`,
      '',
    );
  }

  // DRIP allocation — hours per quadrant, fixed quadrant order.
  lines.push('## DRIP allocation', '');
  for (const q of DRIP_QUADRANTS) {
    lines.push(`- ${q}: ${rollup[q]} hrs/wk`);
  }
  lines.push('');

  // The full ledger, one row per scored task.
  lines.push('## Every task, scored', '');
  lines.push('| Task | Hrs/wk | $/hr | Value | Revenue | DRIP | Call |');
  lines.push('| --- | ---: | ---: | --- | --- | --- | --- |');
  for (const it of items) {
    lines.push(
      `| ${cell(it.task)} | ${it.hoursPerWeek} | ${it.costToDelegate} | ${cell(VALUE_TIER_LABEL[it.valueTier])} | ${cell(it.revenueProximity ?? 'not scored')} | ${it.dripQuadrant} | ${it.recommendation} |`,
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
  // Dedup by audit_item_id: a regenerated SOP produces multiple rows for one
  // item, and only one belongs in the report. Keep the FIRST content-bearing
  // row seen per item — mirrors app/app/audit/[id]/page.tsx, which relies on
  // getSopsForAudit's newest-first ordering so "first seen" is the latest SOP.
  const embeddable: SopRow[] = [];
  const seenItems = new Set<string>();
  for (const s of sops) {
    if (s.content_md == null || seenItems.has(s.audit_item_id)) continue;
    seenItems.add(s.audit_item_id);
    embeddable.push(s);
  }
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

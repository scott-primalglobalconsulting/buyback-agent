import type { TaskInput } from '@/lib/buyback/types';

// The fixed demo dataset. The anonymous /demo path IGNORES the request body and
// always analyzes this exact week, so the demo is deterministic, cacheable, and
// safe to serve to everyone from one shared cache row. The rows are a believable
// founder's week spanning all four DRIP quadrants — cheap admin (bookkeeping,
// inbox, CRM) through founder-defining work (product strategy, investor
// updates) — and total 40 hrs/week. Matches the approved design mockup exactly
// (see docs/architecture/design-system.md, "Viz treatments").
//
// PURE DATA: no React/Next/Supabase/Anthropic imports. `costToDelegate` is $/hr.
export const SAMPLE_WEEK: TaskInput[] = [
  { task: 'Bookkeeping & reconciliation', hoursPerWeek: 4, costToDelegate: 40 },
  { task: 'Inbox triage & scheduling', hoursPerWeek: 6, costToDelegate: 30 },
  { task: 'Customer support tickets', hoursPerWeek: 5, costToDelegate: 45 },
  { task: 'CRM data entry', hoursPerWeek: 3, costToDelegate: 25 },
  { task: 'Manual invoicing', hoursPerWeek: 2, costToDelegate: 35 },
  { task: 'Hiring & interviews', hoursPerWeek: 3, costToDelegate: 120 },
  { task: 'Content & thought leadership', hoursPerWeek: 4, costToDelegate: 90 },
  { task: 'Sales calls — discovery', hoursPerWeek: 6, costToDelegate: 150 },
  { task: 'Product strategy & roadmap', hoursPerWeek: 5, costToDelegate: 250 },
  { task: 'Investor updates', hoursPerWeek: 2, costToDelegate: 200 },
];

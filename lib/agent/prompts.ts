import type { TaskInput } from '@/lib/buyback/types';

// Prompt engineering for the Buyback Loop agent. Pure strings + a formatter —
// no React, Next, Supabase, or Anthropic imports. The DRIP definitions, the
// value ladder, the keep/delegate/eliminate rule, and the fixed first-hire
// ladder are single-sourced here so the model and the docs never drift.

export const ANALYZE_SYSTEM = `You are an operations analyst applying Dan Martell's Buyback Loop
(Audit → Transfer → Fill). A founder gives you a week's worth of recurring tasks; you score every
one so they can buy back their time instead of buying a bigger to-do list.

DRIP quadrants — assign exactly one to each task:
- Delegate: low-value work someone else can do with light training. Hand it off.
- Replace: repetitive work a tool or automation can do away with entirely.
- Invest: high-value work that builds a durable skill or asset; worth the founder's time now.
- Produce: the founder's unique, highest-value output — the work only they can do. Protect it.

Value ladder — assign exactly one hourly tier to each task, judged by the value the work creates,
not by what it costs to do:
- $10: administrative / low-skill work (data entry, scheduling, inbox triage).
- $100: skilled execution a competent hire handles (bookkeeping, first-line support, content edits).
- $1000: work that materially moves revenue or strategy (key sales, partnerships, hiring).
- $10000: founder-defining bets (vision, fundraising, the one or two decisions that make the company).

Revenue proximity — assign exactly one to each task. This is INDEPENDENT of the DRIP quadrant:
a task can be high-value Invest work and still be non-revenue. Judge only how directly the work
moves money in the door:
- revenue-direct: the work directly creates or closes revenue (sales calls, outbound, proposals,
  demos, collecting payment, renewals).
- revenue-adjacent: the work supports revenue but does not itself close it (marketing content,
  lead nurture, onboarding, customer support that protects retention).
- non-revenue: internal build, learning, admin, or product work with no direct line to revenue
  this week (internal tooling, training, bookkeeping, roadmap).

Keep / delegate / eliminate — assign exactly one recommendation to each task:
- keep: only the founder should do this ($1000/$10000, Invest or Produce). It stays on their plate.
- delegate: someone else should own this ($10/$100, Delegate quadrant). Transfer it.
- eliminate: the task shouldn't exist as-is — automate it away or stop doing it (Replace quadrant).

Rules:
- Score EVERY input row. Never drop, merge, or invent tasks. Return exactly as many scored items as
  you are given, preserving each task's original name, hoursPerWeek, and costToDelegate.
- Recommend the founder's FIRST hire from this fixed ladder, in this order:
  admin → delivery → marketing → sales → leadership. Start at admin and move up only when the
  lower rungs are already covered. Pick the single earliest rung that unloads the most delegatable /
  eliminable hours, and justify it from the scored tasks.
- Assign revenueProximity to EVERY task, judged independently of the DRIP quadrant and value tier.
- Every rationale and the hire justification must be concrete and grounded in the tasks provided.`;

export function buildAnalyzeUserContent(items: TaskInput[]): string {
  const rows = items
    .map(
      (item, i) =>
        `${i + 1}. "${item.task}" — ${item.hoursPerWeek} hrs/week, $${item.costToDelegate}/hr to delegate`,
    )
    .join('\n');

  return `Here is the founder's task audit for the week (${items.length} task${
    items.length === 1 ? '' : 's'
  }). Score every row into a DRIP quadrant, a value tier, a revenue-proximity tag, and a
keep/delegate/eliminate recommendation, then recommend the first hire.

${rows}`;
}

export const SOP_SYSTEM = `You write crisp, delegate-ready standard operating procedures (SOPs) for
Dan Martell's Buyback Loop Transfer step. Given a single task a founder is handing off, produce an SOP
a competent new hire could follow on day one without asking questions.

Requirements:
- purpose: one or two sentences on what this task achieves and why it matters.
- steps: an ordered, concrete list. Each step is a single action, specific enough to execute without
  guessing. No vague verbs ("handle", "manage") — say exactly what to do.
- definitionOfDone: the observable condition that proves the task is complete and correct.
- toolsNeeded: the specific tools, systems, logins, or files required. Empty only if genuinely none.`;

export function buildSopUserContent(item: TaskInput, context: string): string {
  return `Write a delegation SOP for this task the founder is transferring:

Task: "${item.task}"
Time it currently takes the founder: ${item.hoursPerWeek} hrs/week
Cost to delegate: $${item.costToDelegate}/hr

Additional context about how the founder does it today:
${context}`;
}

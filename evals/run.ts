import { analyzeAudit } from '@/lib/agent/analyze';
import { ScoredItemSchema, REVENUE_PROXIMITY } from '@/lib/agent/schema';
import { FIXTURES } from './fixtures';

// On-demand eval harness (npm run eval). NOT run in CI: it calls the live Anthropic
// API and costs real spend. Asserts three things per fixture:
//   (a) structure — the returned item parses ScoredItemSchema (always required);
//   (b) sanity    — its quadrant/recommendation fall inside the fixture's accepted set;
//   (c) revenue   — revenueProximity is PRESENT and in the vocab. The field is
//                   optional in ScoredItemSchema (read back-compat), so structure
//                   alone cannot prove the live model emits it — this gate does.
// Items are matched to fixtures by index/order (analyzeAudit preserves input order).
// Exits non-zero on ANY structure, sanity, or revenue failure, or if ANTHROPIC_API_KEY is unset.

interface RowResult {
  task: string;
  structureOk: boolean;
  quadrantOk: boolean;
  recommendationOk: boolean;
  revenueOk: boolean;
  detail: string;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY is not set. This eval calls the live Anthropic API; ' +
        'set the key before running `npm run eval`.',
    );
    process.exit(1);
  }

  const result = await analyzeAudit(
    FIXTURES.map((f) => ({
      task: f.task,
      hoursPerWeek: f.hoursPerWeek,
      costToDelegate: f.costToDelegate,
    })),
  );

  const rows: RowResult[] = [];

  if (result.items.length !== FIXTURES.length) {
    console.error(
      `Item count mismatch: expected ${FIXTURES.length}, got ${result.items.length}. ` +
        'Cannot match items to fixtures by index.',
    );
    process.exit(1);
  }

  for (let i = 0; i < FIXTURES.length; i++) {
    const fixture = FIXTURES[i];
    const raw = result.items[i];

    // (a) Structure — always asserted, even for well-scored items.
    const parsed = ScoredItemSchema.safeParse(raw);
    if (!parsed.success) {
      rows.push({
        task: fixture.task,
        structureOk: false,
        quadrantOk: false,
        recommendationOk: false,
        revenueOk: false,
        detail: parsed.error.issues.map((iss) => iss.message).join('; '),
      });
      continue;
    }

    // (b) Sanity — quadrant/recommendation inside the accepted range.
    const quadrantOk = fixture.expectQuadrant.includes(parsed.data.dripQuadrant);
    const recommendationOk = fixture.expectRecommendation.includes(parsed.data.recommendation);
    // (c) Revenue — the model must actually emit a valid revenueProximity. Optional
    // in the schema (old-data read compat), so assert presence + vocab explicitly.
    const revenueOk =
      parsed.data.revenueProximity != null &&
      (REVENUE_PROXIMITY as readonly string[]).includes(parsed.data.revenueProximity);
    const detailParts: string[] = [];
    if (!quadrantOk) {
      detailParts.push(
        `quadrant ${parsed.data.dripQuadrant} not in {${fixture.expectQuadrant.join(', ')}}`,
      );
    }
    if (!recommendationOk) {
      detailParts.push(
        `recommendation ${parsed.data.recommendation} not in {${fixture.expectRecommendation.join(', ')}}`,
      );
    }
    if (!revenueOk) {
      detailParts.push(
        `revenueProximity ${parsed.data.revenueProximity ?? '(missing)'} not in {${REVENUE_PROXIMITY.join(', ')}}`,
      );
    }

    rows.push({
      task: fixture.task,
      structureOk: true,
      quadrantOk,
      recommendationOk,
      revenueOk,
      detail: detailParts.join('; ') || 'ok',
    });
  }

  // Per-fixture PASS/FAIL table.
  console.log('\nEval results');
  console.log(
    `${pad('TASK', 44)} ${pad('STRUCT', 8)} ${pad('QUAD', 6)} ${pad('REC', 6)} ${pad('REV', 6)} RESULT`,
  );
  console.log('-'.repeat(92));
  for (const row of rows) {
    const pass = row.structureOk && row.quadrantOk && row.recommendationOk && row.revenueOk;
    console.log(
      `${pad(row.task, 44)} ${pad(row.structureOk ? 'ok' : 'FAIL', 8)} ` +
        `${pad(row.quadrantOk ? 'ok' : 'FAIL', 6)} ${pad(row.recommendationOk ? 'ok' : 'FAIL', 6)} ` +
        `${pad(row.revenueOk ? 'ok' : 'FAIL', 6)} ${pass ? 'PASS' : 'FAIL — ' + row.detail}`,
    );
  }

  const failures = rows.filter(
    (r) => !r.structureOk || !r.quadrantOk || !r.recommendationOk || !r.revenueOk,
  );
  console.log('-'.repeat(92));
  console.log(`${rows.length - failures.length}/${rows.length} passed\n`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Eval harness crashed:', err);
  process.exit(1);
});

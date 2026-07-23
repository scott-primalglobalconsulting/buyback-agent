import type { DripQuadrant, Recommendation } from '@/lib/buyback/types';

// Eval fixtures: input tasks paired with *ranges* of acceptable outputs, not exact
// strings. The harness asserts output structure always, plus sanity that each item's
// quadrant/recommendation falls inside the fixture's accepted set. Ranges (not single
// values) absorb reasonable model variation while still catching gross misclassification.
export interface EvalFixture {
  task: string;
  hoursPerWeek: number;
  costToDelegate: number;
  expectQuadrant: DripQuadrant[];
  expectRecommendation: Recommendation[];
}

export const FIXTURES: EvalFixture[] = [
  {
    task: 'Reconcile bank statements each week',
    hoursPerWeek: 5,
    costToDelegate: 25,
    expectQuadrant: ['Delegate'],
    expectRecommendation: ['delegate', 'eliminate'],
  },
  {
    task: 'Manually copy leads from email into the CRM',
    hoursPerWeek: 3,
    costToDelegate: 20,
    expectQuadrant: ['Replace', 'Delegate'],
    expectRecommendation: ['delegate', 'eliminate'],
  },
  {
    task: 'Close enterprise deals with new logos',
    hoursPerWeek: 8,
    costToDelegate: 300,
    expectQuadrant: ['Produce'],
    expectRecommendation: ['keep'],
  },
  {
    task: 'Design next-quarter company strategy',
    hoursPerWeek: 4,
    costToDelegate: 500,
    expectQuadrant: ['Invest', 'Produce'],
    expectRecommendation: ['keep'],
  },
];

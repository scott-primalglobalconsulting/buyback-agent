export type DripQuadrant = 'Delegate' | 'Replace' | 'Invest' | 'Produce';
export type ValueTier = '$10' | '$100' | '$1000' | '$10000'; // hourly value ladder rung
export type Recommendation = 'keep' | 'delegate' | 'eliminate';

export interface TaskInput {
  task: string;
  hoursPerWeek: number;
  costToDelegate: number; // $/hr
}

export interface ScoredItem extends TaskInput {
  valueTier: ValueTier;
  dripQuadrant: DripQuadrant;
  recommendation: Recommendation;
  rationale: string;
}

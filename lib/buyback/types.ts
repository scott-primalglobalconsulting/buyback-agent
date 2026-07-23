export const DRIP_QUADRANTS = ['Delegate', 'Replace', 'Invest', 'Produce'] as const;
export type DripQuadrant = (typeof DRIP_QUADRANTS)[number];

export const VALUE_TIERS = ['$10', '$100', '$1000', '$10000'] as const; // hourly value ladder rungs
export type ValueTier = (typeof VALUE_TIERS)[number];

export const RECOMMENDATIONS = ['keep', 'delegate', 'eliminate'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

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

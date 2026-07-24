import { z } from 'zod';
import { DRIP_QUADRANTS, VALUE_TIERS, RECOMMENDATIONS, REVENUE_PROXIMITY } from '@/lib/buyback/types';

// DRIP_QUADRANTS / VALUE_TIERS / RECOMMENDATIONS are single-sourced in
// lib/buyback/types (the domain vocab). HIRE_ROLES is an LLM-contract-only
// enum with no domain-math consumer, so it stays local to the agent layer.
export { DRIP_QUADRANTS, VALUE_TIERS, RECOMMENDATIONS, REVENUE_PROXIMITY };
export const HIRE_ROLES = ['admin', 'delivery', 'marketing', 'sales', 'leadership'] as const;

export const ScoredItemSchema = z.object({
  task: z.string().min(1),
  hoursPerWeek: z.number().nonnegative(),
  costToDelegate: z.number().nonnegative(),
  valueTier: z.enum(VALUE_TIERS),
  dripQuadrant: z.enum(DRIP_QUADRANTS),
  recommendation: z.enum(RECOMMENDATIONS),
  rationale: z.string().min(1),
  revenueProximity: z.enum(REVENUE_PROXIMITY).optional(),
});

export const AnalysisSummarySchema = z.object({
  firstHireRole: z.enum(HIRE_ROLES),
  firstHireJustification: z.string().min(1),
});

export const AnalysisResultSchema = z.object({
  items: z.array(ScoredItemSchema).min(1),
  summary: AnalysisSummarySchema,
});

export const SopSchema = z.object({
  purpose: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  definitionOfDone: z.string().min(1),
  toolsNeeded: z.array(z.string().min(1)),
});

export type ScoredItem = z.infer<typeof ScoredItemSchema>;
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type Sop = z.infer<typeof SopSchema>;

// Hand-written Anthropic tool input_schemas (the model is forced into these).
// additionalProperties:false + required on every object; a drift test asserts
// these stay in lockstep with the Zod enums above.
export const analysisToolJsonSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          hoursPerWeek: { type: 'number' },
          costToDelegate: { type: 'number' },
          valueTier: { type: 'string', enum: [...VALUE_TIERS] },
          dripQuadrant: { type: 'string', enum: [...DRIP_QUADRANTS] },
          recommendation: { type: 'string', enum: [...RECOMMENDATIONS] },
          rationale: { type: 'string' },
          revenueProximity: { type: 'string', enum: [...REVENUE_PROXIMITY] },
        },
        required: ['task', 'hoursPerWeek', 'costToDelegate', 'valueTier', 'dripQuadrant', 'recommendation', 'rationale', 'revenueProximity'],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'object',
      properties: {
        firstHireRole: { type: 'string', enum: [...HIRE_ROLES] },
        firstHireJustification: { type: 'string' },
      },
      required: ['firstHireRole', 'firstHireJustification'],
      additionalProperties: false,
    },
  },
  required: ['items', 'summary'],
  additionalProperties: false,
} as const;

export const sopToolJsonSchema = {
  type: 'object',
  properties: {
    purpose: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    definitionOfDone: { type: 'string' },
    toolsNeeded: { type: 'array', items: { type: 'string' } },
  },
  required: ['purpose', 'steps', 'definitionOfDone', 'toolsNeeded'],
  additionalProperties: false,
} as const;

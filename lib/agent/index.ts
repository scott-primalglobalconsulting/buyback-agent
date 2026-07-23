// Public surface of the agent layer. Routes and components consume the agent
// through this barrel — never @anthropic-ai/sdk directly.
//
// generateSOP is intentionally NOT re-exported yet: it lands in Task 3.3. Adding
// it here now would break `tsc` (the module doesn't exist).

export { analyzeAudit, streamAnalyzeAudit, type AnalyzeStreamEvent } from '@/lib/agent/analyze';
export {
  AnalysisResultSchema,
  SopSchema,
  type AnalysisResult,
  type ScoredItem,
  type Sop,
} from '@/lib/agent/schema';
export type { TaskInput } from '@/lib/buyback/types';

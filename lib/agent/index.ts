// Public surface of the agent layer. Routes and components consume the agent
// through this barrel — never @anthropic-ai/sdk directly.

export { analyzeAudit, streamAnalyzeAudit, type AnalyzeStreamEvent } from '@/lib/agent/analyze';
export { generateSOP } from '@/lib/agent/sop';
export {
  AnalysisResultSchema,
  ScoredItemSchema,
  SopSchema,
  type AnalysisResult,
  type ScoredItem,
  type Sop,
} from '@/lib/agent/schema';
export type { TaskInput } from '@/lib/buyback/types';

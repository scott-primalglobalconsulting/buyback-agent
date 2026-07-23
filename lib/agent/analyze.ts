import Anthropic from '@anthropic-ai/sdk';
import type { TaskInput } from '@/lib/buyback/types';
import {
  type ToolCaller,
  createAnthropicToolCaller,
  structuredToolCall,
  StructuredCallError,
} from '@/lib/agent/client';
import { AnalysisResultSchema, analysisToolJsonSchema, type AnalysisResult } from '@/lib/agent/schema';
import { ANALYZE_SYSTEM, buildAnalyzeUserContent } from '@/lib/agent/prompts';

// Two entry points into the analyze agent:
//   analyzeAudit        — non-streaming, validated-with-one-retry (via structuredToolCall).
//                         Takes an injectable caller so tests run without the network.
//   streamAnalyzeAudit  — streaming, surfaces summarized thinking as it arrives, then the
//                         final validated result. No retry: a schema-invalid final tool_use
//                         throws; the route falls back to analyzeAudit's retry path.
// This module imports @anthropic-ai/sdk, zod (transitively), and sibling agent modules only —
// never React, Next, or Supabase.

const TOOL_NAME = 'submit_analysis';
const MODEL = 'claude-sonnet-5';

export async function analyzeAudit(
  items: TaskInput[],
  caller: ToolCaller = createAnthropicToolCaller(MODEL),
): Promise<AnalysisResult> {
  return structuredToolCall({
    caller,
    system: ANALYZE_SYSTEM,
    userContent: buildAnalyzeUserContent(items),
    toolName: TOOL_NAME,
    toolSchema: analysisToolJsonSchema,
    validate: (raw) => AnalysisResultSchema.parse(raw),
  });
}

export type AnalyzeStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'result'; data: AnalysisResult };

// Streaming variant. Yields incremental summarized-thinking chunks, then one final result.
// Intentionally NOT unit-tested — it hits the real Anthropic API. Kept fully type-safe so
// `tsc` covers the call surface (stream params, event narrowing, finalMessage extraction).
export async function* streamAnalyzeAudit(
  items: TaskInput[],
): AsyncGenerator<AnalyzeStreamEvent> {
  const client = new Anthropic();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    // Adaptive thinking with summarized display: on first-party Sonnet 5, forcing a tool via
    // tool_choice does not require disabling thinking (that constraint is Bedrock-only).
    thinking: { type: 'adaptive', display: 'summarized' },
    system: ANALYZE_SYSTEM,
    tools: [
      {
        name: TOOL_NAME,
        description: `Submit the ${TOOL_NAME} result.`,
        // as const makes the literal readonly; InputSchema wants mutable arrays,
        // so widen through unknown (structurally identical at runtime).
        input_schema: analysisToolJsonSchema as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: buildAnalyzeUserContent(items) }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'thinking_delta') {
      yield { type: 'thinking', text: event.delta.thinking };
    }
  }

  const final = await stream.finalMessage();
  const block = final.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new StructuredCallError('model returned no tool_use block');
  }

  // No retry on the streaming path: a validation failure throws so the caller can fall back
  // to analyzeAudit (the validated-retry path).
  let data: AnalysisResult;
  try {
    data = AnalysisResultSchema.parse(block.input);
  } catch (err) {
    throw new StructuredCallError(`streaming tool_use failed validation: ${String(err)}`);
  }

  yield { type: 'result', data };
}

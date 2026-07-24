import {
  type ToolCaller,
  createAnthropicToolCaller,
  structuredToolCall,
} from '@/lib/agent/client';
import { SopSchema, sopToolJsonSchema, type ScoredItem, type Sop } from '@/lib/agent/schema';
import { SOP_SYSTEM, buildSopUserContent } from '@/lib/agent/prompts';

// Transfer-step SOP generator: given one scored task the founder is handing off,
// force a single structured tool call and validate it against SopSchema (with the
// shared one-retry path). Injectable caller keeps tests off the network. This
// module imports sibling agent modules + zod (transitively) only — never React,
// Next, or Supabase.

const TOOL_NAME = 'submit_sop';
const MODEL = 'claude-sonnet-5';

export async function generateSOP(
  item: ScoredItem,
  workspaceContext: string,
  opts?: { team?: 'solo' | 'has-team'; toolBudget?: 'none' | 'some' },
  caller: ToolCaller = createAnthropicToolCaller(MODEL),
): Promise<Sop> {
  return structuredToolCall({
    caller,
    system: SOP_SYSTEM,
    userContent: buildSopUserContent(item, workspaceContext, opts),
    toolName: TOOL_NAME,
    toolSchema: sopToolJsonSchema,
    validate: (raw) => SopSchema.parse(raw),
  });
}

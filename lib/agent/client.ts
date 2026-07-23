import Anthropic from '@anthropic-ai/sdk';

// Structured tool-call wrapper: forces the model into a single tool call whose
// input is our JSON schema, then validates the parsed input against Zod. The
// only external deps here are @anthropic-ai/sdk and zod (via the caller's
// validate fn) — this module never imports React, Next, or Supabase.

export type AnthropicMessage = { role: 'user' | 'assistant'; content: string };

export class StructuredCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructuredCallError';
  }
}

// A minimal seam so tests can inject a fake Anthropic without hitting the
// network. Returns the parsed tool_use.input for the single forced tool call.
export interface ToolCaller {
  call(args: {
    system: string;
    messages: AnthropicMessage[];
    toolName: string;
    toolSchema: object;
  }): Promise<unknown>;
}

export function createAnthropicToolCaller(model = 'claude-sonnet-5'): ToolCaller {
  const client = new Anthropic();
  return {
    async call({ system, messages, toolName, toolSchema }) {
      // First-party Claude API + Sonnet 5: adaptive thinking is the on-mode,
      // and forcing a tool via tool_choice does NOT require disabling thinking
      // (that constraint is Bedrock-only). No beta header needed.
      const res = await client.messages.create({
        model,
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        system,
        tools: [
          {
            name: toolName,
            description: `Submit the ${toolName} result.`,
            input_schema: toolSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: toolName }, // force the structured tool call
        messages,
      });
      const block = res.content.find((b) => b.type === 'tool_use');
      if (!block || block.type !== 'tool_use') {
        throw new StructuredCallError('model returned no tool_use block');
      }
      return block.input; // parse + validate happens in structuredToolCall
    },
  };
}

export async function structuredToolCall<T>(opts: {
  caller: ToolCaller;
  system: string;
  userContent: string;
  toolName: string;
  toolSchema: object;
  validate: (raw: unknown) => T;
}): Promise<T> {
  const { caller, system, userContent, toolName, toolSchema, validate } = opts;

  const raw = await caller.call({
    system,
    messages: [{ role: 'user', content: userContent }],
    toolName,
    toolSchema,
  });

  try {
    return validate(raw);
  } catch (err) {
    // A schema-invalid tool response is the one recoverable LLM failure mode:
    // feeding the exact validation error back once reliably fixes it. A second
    // failure is a real bug, so we throw rather than loop.
    const feedback = `Your previous ${toolName} output failed validation: ${String(
      err,
    )}. Return a corrected, schema-valid tool call.`;
    const retryMessages: AnthropicMessage[] = [
      { role: 'user', content: userContent },
      { role: 'assistant', content: 'Submitting analysis.' },
      { role: 'user', content: feedback },
    ];
    const retried = await caller.call({
      system,
      messages: retryMessages,
      toolName,
      toolSchema,
    });
    try {
      return validate(retried);
    } catch (err2) {
      throw new StructuredCallError(`validation failed after retry: ${String(err2)}`);
    }
  }
}

// Pure serializer: turn a validated Sop into a clean markdown string. This is
// the ONE canonical rendering — the SOP route returns the structured Sop, and
// both the fresh-generation display (client) and the persisted copy (saveSop)
// pass it through here, so a freshly generated SOP and a reloaded one are
// byte-identical. No imports beyond the Sop type: safe on client and server,
// never touches React/Next/Supabase/Anthropic.
import type { Sop } from '@/lib/agent/schema';

export function sopToMarkdown(sop: Sop): string {
  const steps = sop.steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  const tools =
    sop.toolsNeeded.length > 0
      ? sop.toolsNeeded.map((tool) => `- ${tool}`).join('\n')
      : 'None';

  return [
    '# Standard Operating Procedure',
    '',
    '## Purpose',
    sop.purpose,
    '',
    '## Steps',
    steps,
    '',
    '## Definition of Done',
    sop.definitionOfDone,
    '',
    '## Tools Needed',
    tools,
    '',
  ].join('\n');
}

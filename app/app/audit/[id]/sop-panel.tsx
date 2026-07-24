'use client';

// Per-delegate-task SOP generation + display, on the persisted audit-detail page.
//
// ISOLATION: the only reach into the agent is fetch('/api/sop'); the only write
// is the persistSop server action. NO @/lib/agent-over-Anthropic / Supabase on
// the client. sopToMarkdown is a PURE serializer (no Supabase/Anthropic), shared
// with the server action, so a freshly generated SOP and a reloaded one render
// identically — both as the same markdown string.
//
// SAFETY: the SOP body is rendered as pre-wrapped TEXT (React escapes it) — never
// dangerouslySetInnerHTML. Both fresh and persisted SOPs are plain markdown text.
import { useState } from 'react';
import type { Sop } from '@/lib/agent';
import type { AuditItemWithId } from '@/lib/db/types';
import { sopToMarkdown } from '@/lib/sop-markdown';
import { persistSop } from '../../actions';

type ItemStatus = 'idle' | 'generating' | 'error';

const DEFAULT_ERROR = 'SOP generation failed. Please try again in a moment.';

async function messageOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : DEFAULT_ERROR;
  } catch {
    return DEFAULT_ERROR;
  }
}

export function SopPanel({
  items,
  initialSops,
}: {
  items: AuditItemWithId[];
  initialSops: Record<string, string>;
}) {
  // markdown-by-audit-item-id; seeded with any already-persisted SOPs.
  const [sops, setSops] = useState<Record<string, string>>(initialSops);
  const [status, setStatus] = useState<Record<string, ItemStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function generate(item: AuditItemWithId) {
    const { id } = item;
    setStatus((s) => ({ ...s, [id]: 'generating' }));
    setErrors((e) => ({ ...e, [id]: '' }));

    // Send only the ScoredItem fields (the route validates via ScoredItemSchema).
    const { id: _id, ...scored } = item;
    void _id;

    let res: Response;
    try {
      res = await fetch('/api/sop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item: scored }),
      });
    } catch {
      setStatus((s) => ({ ...s, [id]: 'error' }));
      setErrors((e) => ({ ...e, [id]: DEFAULT_ERROR }));
      return;
    }

    if (!res.ok) {
      const msg = await messageOf(res);
      setStatus((s) => ({ ...s, [id]: 'error' }));
      setErrors((e) => ({ ...e, [id]: msg }));
      return;
    }

    let sop: Sop;
    try {
      sop = (await res.json()) as Sop;
    } catch {
      setStatus((s) => ({ ...s, [id]: 'error' }));
      setErrors((e) => ({ ...e, [id]: DEFAULT_ERROR }));
      return;
    }

    // Render immediately from the SAME pure serializer the server persists with.
    const md = sopToMarkdown(sop);
    setSops((prev) => ({ ...prev, [id]: md }));
    setStatus((s) => ({ ...s, [id]: 'idle' }));

    // Persist server-side (re-validated + RLS-gated). A save failure leaves the
    // generated SOP on screen but surfaces a note — it just is not stored yet.
    try {
      await persistSop(id, sop);
    } catch {
      setErrors((e) => ({
        ...e,
        [id]: 'Generated, but could not be saved. Reload to retry.',
      }));
    }
  }

  if (items.length === 0) {
    return (
      <p className="disclaimer">
        No tasks are recommended for delegation, so there is nothing to hand off yet.
      </p>
    );
  }

  return (
    <ul className="sop-list">
      {items.map((item) => {
        const md = sops[item.id];
        const st = status[item.id] ?? 'idle';
        const err = errors[item.id];
        return (
          <li key={item.id} className="sop-item">
            <div className="sop-head">
              <span className="sop-task">{item.task}</span>
              {!md ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => generate(item)}
                  disabled={st === 'generating'}
                >
                  {st === 'generating' ? 'Generating.' : 'Generate SOP'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => generate(item)}
                  disabled={st === 'generating'}
                >
                  {st === 'generating' ? 'Generating.' : 'Regenerate'}
                </button>
              )}
            </div>
            {err ? (
              <p className="signin-error" role="alert">
                {err}
              </p>
            ) : null}
            {md ? <pre className="sop-body">{md}</pre> : null}
          </li>
        );
      })}
    </ul>
  );
}

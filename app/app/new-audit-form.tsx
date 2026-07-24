'use client';

// The authed new-audit entry form. Editable task rows -> POST { items } to
// /api/analyze (same-origin, so the session cookie selects the AUTHENTICATED
// path, which analyzes the user's REAL input) -> on the single `result` event,
// call the persistAudit server action and navigate to the persisted audit.
//
// ISOLATION: the only reach into the agent is fetch('/api/analyze'); the only
// write is the persistAudit server action. NO @/lib/agent / Anthropic / Supabase
// on the client. This makes ONE live Anthropic call per submit — never loop it.
//
// HONEST STATES: while the request is in flight (running) and while the result
// persists (saving) we show the same polished skeleton as /demo — never a
// fabricated "thinking" log. Guard/validation verdicts arrive as plain-JSON
// status codes (400/413/429/503), so we branch on status BEFORE reading a stream.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AnalysisResult } from '@/lib/agent';
import { SAMPLE_WEEK } from '@/lib/sample';
import { DEFAULT_AUDIT_TITLE } from './audit-view';
import { persistAudit } from './actions';

type Row = { task: string; hours: string; cost: string };
type Status =
  | 'editing'
  | 'running'
  | 'saving'
  | 'rate_limited'
  | 'unavailable'
  | 'error';

// Outcome of a single /api/analyze round-trip (status branch + SSE read).
type RunOutcome =
  | { kind: 'result'; result: AnalysisResult }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string };

// Mirror of the route's SSE event shape (app/api/analyze/route.ts).
type SseEvent =
  | { type: 'thinking'; text: string }
  | { type: 'result'; result: AnalysisResult }
  | { type: 'error'; message: string };

const DEFAULT_ERROR = 'Analysis failed. Please try again in a moment.';
const BLANK_ROW: Row = { task: '', hours: '', cost: '' };

async function messageOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : DEFAULT_ERROR;
  } catch {
    return DEFAULT_ERROR;
  }
}

function parseSse(block: string): SseEvent | null {
  const line = block.split('\n').find((l) => l.startsWith('data:'));
  if (!line) return null;
  try {
    return JSON.parse(line.replace(/^data:\s*/, '')) as SseEvent;
  } catch {
    return null;
  }
}

// Read the SSE body to the first terminal event. Ignores `thinking` (honest
// states); resolves on the single `result` or an `error`.
async function readStream(body: ReadableStream<Uint8Array>): Promise<RunOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const ev = parseSse(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
        if (!ev) continue;
        if (ev.type === 'result') return { kind: 'result', result: ev.result };
        if (ev.type === 'error') return { kind: 'error', message: ev.message };
        // 'thinking' events are intentionally dropped — no reasoning theater.
      }
    }
  } catch {
    return { kind: 'error', message: DEFAULT_ERROR };
  }
  return { kind: 'error', message: DEFAULT_ERROR };
}

async function runAnalyze(
  items: { task: string; hoursPerWeek: number; costToDelegate: number }[],
  signal: AbortSignal,
): Promise<RunOutcome> {
  let res: Response;
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
      signal,
    });
  } catch {
    return { kind: 'error', message: DEFAULT_ERROR };
  }

  // Branch on the status BEFORE touching a stream — guard/validation verdicts
  // are plain JSON, only the 200 path is an event-stream.
  if (res.status === 429) return { kind: 'rate_limited', message: await messageOf(res) };
  if (res.status === 503) return { kind: 'unavailable', message: await messageOf(res) };
  if (!res.ok || !res.body) return { kind: 'error', message: await messageOf(res) };

  return readStream(res.body);
}

// Coerce the editable rows into API items. A row counts only when it has a task
// and a positive hours value; cost defaults to 0. Mirrors the route's
// AnalyzeRequestSchema (hoursPerWeek positive, costToDelegate nonnegative) so a
// bad row is caught before spending an API call.
function buildItems(
  rows: Row[],
): { task: string; hoursPerWeek: number; costToDelegate: number }[] {
  return rows
    .map((r) => ({
      task: r.task.trim(),
      hoursPerWeek: Number(r.hours),
      costToDelegate: r.cost.trim() === '' ? 0 : Number(r.cost),
    }))
    .filter(
      (r) =>
        r.task.length > 0 &&
        Number.isFinite(r.hoursPerWeek) &&
        r.hoursPerWeek > 0 &&
        Number.isFinite(r.costToDelegate) &&
        r.costToDelegate >= 0,
    );
}

export function NewAuditForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([{ ...BLANK_ROW }]);
  const [status, setStatus] = useState<Status>('editing');
  const [message, setMessage] = useState<string>(DEFAULT_ERROR);
  const [validation, setValidation] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight analyze if the form unmounts mid-request.
  useEffect(() => () => abortRef.current?.abort(), []);

  function updateRow(i: number, key: keyof Row, value: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { ...BLANK_ROW }]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)));
  }
  function loadSample() {
    setValidation(null);
    setTitle((t) => (t.trim() === '' ? DEFAULT_AUDIT_TITLE : t));
    setRows(
      SAMPLE_WEEK.map((s) => ({
        task: s.task,
        hours: String(s.hoursPerWeek),
        cost: String(s.costToDelegate),
      })),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const items = buildItems(rows);
    if (items.length === 0) {
      setValidation('Add at least one task with a positive weekly hours value.');
      return;
    }
    setValidation(null);

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('running');

    const outcome = await runAnalyze(items, controller.signal);
    if (controller.signal.aborted) return;

    if (outcome.kind === 'rate_limited') {
      setStatus('rate_limited');
      setMessage(outcome.message);
      return;
    }
    if (outcome.kind === 'unavailable') {
      setStatus('unavailable');
      setMessage(outcome.message);
      return;
    }
    if (outcome.kind === 'error') {
      setStatus('error');
      setMessage(outcome.message);
      return;
    }

    // result -> re-validate + persist server-side, then open the saved audit.
    setStatus('saving');
    try {
      const id = await persistAudit(workspaceId, title, outcome.result);
      router.push(`/app/audit/${id}`);
    } catch {
      setStatus('error');
      setMessage('The analysis completed but could not be saved. Please try again.');
    }
  }

  if (status === 'running' || status === 'saving') {
    return <RunningSkeleton phase={status} />;
  }

  if (status === 'rate_limited' || status === 'unavailable' || status === 'error') {
    return (
      <div className="state-card" role="alert">
        <span className={`state-badge ${status === 'rate_limited' ? 'warn' : 'crit'}`}>
          <span className="dot" aria-hidden="true" />
          {status === 'rate_limited'
            ? 'Limit reached'
            : status === 'unavailable'
              ? 'Briefly unavailable'
              : 'Something broke'}
        </span>
        <h2>The analysis did not complete</h2>
        <p>{message}</p>
        <div className="state-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStatus('editing')}
          >
            Back to my week
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="audit-form">
      <div className="af-title">
        <label className="signin-label" htmlFor="audit-title">
          Audit title
        </label>
        <input
          id="audit-title"
          className="signin-input"
          placeholder={DEFAULT_AUDIT_TITLE}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="af-table" role="group" aria-label="Weekly tasks">
        <div className="af-row af-head" aria-hidden="true">
          <span>Task</span>
          <span>Hours / wk</span>
          <span>$ / hr to delegate</span>
          <span />
        </div>
        {rows.map((row, i) => (
          <div className="af-row" key={i}>
            <input
              className="signin-input af-task"
              placeholder="e.g. Inbox triage & scheduling"
              aria-label={`Task ${i + 1}`}
              value={row.task}
              onChange={(e) => updateRow(i, 'task', e.target.value)}
            />
            <input
              className="signin-input af-num"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              placeholder="0"
              aria-label={`Hours per week for task ${i + 1}`}
              value={row.hours}
              onChange={(e) => updateRow(i, 'hours', e.target.value)}
            />
            <input
              className="signin-input af-num"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              placeholder="0"
              aria-label={`Cost per hour to delegate task ${i + 1}`}
              value={row.cost}
              onChange={(e) => updateRow(i, 'cost', e.target.value)}
            />
            <button
              type="button"
              className="af-remove"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              aria-label={`Remove task ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {validation ? <p className="signin-error">{validation}</p> : null}

      <div className="af-actions">
        <div className="af-actions-left">
          <button type="button" className="btn btn-ghost" onClick={addRow}>
            Add task
          </button>
          <button type="button" className="btn btn-ghost" onClick={loadSample}>
            Load sample week
          </button>
        </div>
        <button type="submit" className="btn btn-primary">
          Analyze my week
        </button>
      </div>
    </form>
  );
}

function RunningSkeleton({ phase }: { phase: 'running' | 'saving' }) {
  return (
    <div className="state-loading">
      <div className="loading-head">
        <span className="eyebrow">{phase === 'saving' ? 'Saving' : 'Analyzing'}</span>
        <h2>{phase === 'saving' ? 'Saving your audit' : 'Reading your week'}</h2>
        <p>
          {phase === 'saving'
            ? 'Storing the scored tasks and opening your audit.'
            : 'Scoring each task into DRIP quadrants, computing your reclaimable time, and picking the first hire.'}
        </p>
      </div>
      <div className="skel-grid" aria-hidden="true">
        <div className="skel skel-hero" />
        <div className="skel skel-block" />
        <div className="skel skel-block" />
        <div className="skel skel-wide" />
      </div>
      <span className="sr-only" role="status">
        {phase === 'saving' ? 'Saving your audit, one moment.' : 'Analyzing your week, one moment.'}
      </span>
    </div>
  );
}

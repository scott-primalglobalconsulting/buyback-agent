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

// Running-total display: keep halves, drop a trailing ".0" so "12" beats "12.0".
function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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
  const [isAtRevenue, setIsAtRevenue] = useState<'yes' | 'no'>('no');
  const [annualIncome, setAnnualIncome] = useState('');
  const [team, setTeam] = useState<'solo' | 'has-team'>('solo');
  const [toolBudget, setToolBudget] = useState<'none' | 'some'>('none');
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
    // Assemble audit-context meta in the shape AuditMetaSchema validates: an
    // empty/non-positive income drops out entirely rather than persisting 0.
    const income = annualIncome.trim() === '' ? undefined : Number(annualIncome);
    const meta = {
      isAtRevenue: isAtRevenue === 'yes',
      annualIncome:
        Number.isFinite(income) && (income ?? 0) > 0 && (income ?? 0) <= 100_000_000
          ? income
          : undefined,
      team,
      toolBudget,
    };
    setStatus('saving');
    try {
      const id = await persistAudit(workspaceId, title, outcome.result, meta);
      router.push(`/app/audit/${id}`);
    } catch {
      setStatus('error');
      setMessage('The analysis completed but could not be saved. Please try again.');
    }
  }

  // Live orientation readout under the task table — the only feedback a
  // first-timer gets that the rows are actually landing.
  const filledCount = rows.filter((r) => r.task.trim() !== '').length;
  const totalHours = rows.reduce((sum, r) => {
    const h = Number(r.hours);
    return sum + (Number.isFinite(h) && h > 0 ? h : 0);
  }, 0);

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
      {/* ---------------- STEP 1 — context first: it frames every later answer ---- */}
      <section className="af-step">
        <div className="af-step-head">
          <span className="af-step-num" aria-hidden="true">
            1
          </span>
          <div className="af-step-copy">
            <h3>About your business</h3>
            <p>
              Four quick questions. They decide who we tell you to hire first and
              what kind of help we recommend.
            </p>
          </div>
        </div>

        <fieldset className="af-step-body">
          <legend className="sr-only">About your business</legend>

          <div className="af-field">
            <div className="af-label-row">
              <span className="af-label" id="af-rev-label">
                Are you at consistent revenue yet?
              </span>
              <Help id="help-rev">
                Consistent means money comes in every month without you chasing
                it. If income still swings a lot, pick Not yet — we will keep the
                advice cheap and low risk.
              </Help>
            </div>
            <div className="af-radios" role="radiogroup" aria-labelledby="af-rev-label">
              <label>
                <input
                  type="radio"
                  name="rev"
                  checked={isAtRevenue === 'no'}
                  onChange={() => setIsAtRevenue('no')}
                />{' '}
                Not yet
              </label>
              <label>
                <input
                  type="radio"
                  name="rev"
                  checked={isAtRevenue === 'yes'}
                  onChange={() => setIsAtRevenue('yes')}
                />{' '}
                Yes
              </label>
            </div>
          </div>

          <div className="af-field">
            <div className="af-label-row">
              <span className="af-label" id="af-team-label">
                Do you have anyone helping you?
              </span>
              <Help id="help-team">
                Anyone you can already hand work to counts — an assistant, a
                contractor, a part timer. Solo means every task lands on you.
              </Help>
            </div>
            <div className="af-radios" role="radiogroup" aria-labelledby="af-team-label">
              <label>
                <input
                  type="radio"
                  name="team"
                  checked={team === 'solo'}
                  onChange={() => setTeam('solo')}
                />{' '}
                Just me
              </label>
              <label>
                <input
                  type="radio"
                  name="team"
                  checked={team === 'has-team'}
                  onChange={() => setTeam('has-team')}
                />{' '}
                I have help
              </label>
            </div>
          </div>

          <div className="af-field">
            <div className="af-label-row">
              <span className="af-label" id="af-tools-label">
                Can you spend money on software?
              </span>
              <Help id="help-tools">
                If you would rather not add another monthly bill, pick free tools
                only and we will stick to what you already have.
              </Help>
            </div>
            <div className="af-radios" role="radiogroup" aria-labelledby="af-tools-label">
              <label>
                <input
                  type="radio"
                  name="tools"
                  checked={toolBudget === 'none'}
                  onChange={() => setToolBudget('none')}
                />{' '}
                Free tools only
              </label>
              <label>
                <input
                  type="radio"
                  name="tools"
                  checked={toolBudget === 'some'}
                  onChange={() => setToolBudget('some')}
                />{' '}
                Yes, some budget
              </label>
            </div>
          </div>

          <div className="af-field af-field-narrow">
            <div className="af-label-row">
              <label className="af-label" htmlFor="income">
                Target annual income
              </label>
              <span className="af-optional">optional</span>
              <Help id="help-income">
                We use this to work out roughly what one hour of your time is
                worth, which sets the bar for what is worth paying someone else
                to do. Leave it blank if you would rather not say.
              </Help>
            </div>
            <p className="af-hint">What you want the business to pay you in a year.</p>
            <input
              id="income"
              className="signin-input"
              type="number"
              min="0"
              max="100000000"
              step="1000"
              inputMode="decimal"
              placeholder="200000"
              value={annualIncome}
              onChange={(e) => setAnnualIncome(e.target.value)}
            />
          </div>
        </fieldset>
      </section>

      {/* ---------------- STEP 2 — the week itself ------------------------------ */}
      <section className="af-step">
        <div className="af-step-head">
          <span className="af-step-num" aria-hidden="true">
            2
          </span>
          <div className="af-step-copy">
            <h3>Your week</h3>
            <p>
              List what you personally spent time on in a normal week. One line
              per task. Five to ten lines is plenty, and rough guesses are fine.
            </p>
          </div>
        </div>

        <div className="af-step-body">
          <p className="af-sample">
            Not sure where to start?{' '}
            <button type="button" className="af-linkbtn" onClick={loadSample}>
              Fill in a sample week
            </button>{' '}
            and edit it.
          </p>

          <div className="af-table" role="group" aria-label="Weekly tasks">
            <div className="af-row af-head">
              <span className="af-h">What you did</span>
              <span className="af-h af-h-num">
                Hours / wk
                <Help id="help-hours" align="right">
                  Your best guess at how long it takes you in a normal week,
                  added up. Half hours are fine.
                </Help>
              </span>
              <span className="af-h af-h-num">
                $ per hour
                <Help id="help-cost" align="right">
                  Roughly what you would expect to pay someone else per hour to
                  take this off you. If you have no idea, leave it at 0 and we
                  will still score the task.
                </Help>
              </span>
              <span className="af-h" />
            </div>
            {rows.map((row, i) => (
              <div className="af-row" key={i}>
                <input
                  className="signin-input af-task"
                  placeholder={i === 0 ? 'Answering emails and booking calls' : ''}
                  aria-label={`Task ${i + 1}`}
                  value={row.task}
                  onChange={(e) => updateRow(i, 'task', e.target.value)}
                />
                {/* The wrapping label carries a per-row column name that only
                    shows on narrow screens, where the header row is hidden and
                    two bare number boxes would otherwise be unlabelled. */}
                <label className="af-cell">
                  <span className="af-cell-label">Hours / wk</span>
                  <input
                    className="signin-input af-num"
                    type="number"
                    min="0"
                    step="0.5"
                    inputMode="decimal"
                    placeholder={i === 0 ? '6' : ''}
                    aria-label={`Hours per week for task ${i + 1}`}
                    value={row.hours}
                    onChange={(e) => updateRow(i, 'hours', e.target.value)}
                  />
                </label>
                <label className="af-cell">
                  <span className="af-cell-label">$ per hour</span>
                  <input
                    className="signin-input af-num"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    placeholder={i === 0 ? '25' : ''}
                    aria-label={`Cost per hour to delegate task ${i + 1}`}
                    value={row.cost}
                    onChange={(e) => updateRow(i, 'cost', e.target.value)}
                  />
                </label>
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

          <button type="button" className="af-add" onClick={addRow}>
            + Add another task
          </button>

          <p className="af-total" role="status">
            {filledCount === 0
              ? 'No tasks yet.'
              : `${filledCount} task${filledCount === 1 ? '' : 's'} · ${formatHours(totalHours)} hours a week`}
          </p>
        </div>
      </section>

      {/* ---------------- STEP 3 — name it and run ------------------------------ */}
      <section className="af-step">
        <div className="af-step-head">
          <span className="af-step-num" aria-hidden="true">
            3
          </span>
          <div className="af-step-copy">
            <h3>Run the analysis</h3>
            <p>Give it a name so you can find it later, then run it. Takes about a minute.</p>
          </div>
        </div>

        <div className="af-step-body">
          <div className="af-field af-field-narrow">
            <div className="af-label-row">
              <label className="af-label" htmlFor="audit-title">
                Name this audit
              </label>
              <span className="af-optional">optional</span>
            </div>
            <input
              id="audit-title"
              className="signin-input"
              placeholder={DEFAULT_AUDIT_TITLE}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {validation ? <p className="signin-error">{validation}</p> : null}

          <div className="af-actions">
            <button type="submit" className="btn btn-primary">
              Analyze my week
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}

// Inline explainer. Opens on hover/keyboard focus (CSS) and on click (state), so
// it works for a mouse, a keyboard, and a touch screen — a hover-only tooltip
// would be invisible to half the people who need it most.
function Help({
  id,
  align,
  children,
}: {
  id: string;
  align?: 'right';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // Touch has no hover, so a tapped-open popover otherwise has exactly one way
  // out: hitting the same small button again. Close on any outside pointer or
  // on Escape. Only listens while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span className="af-help-wrap" ref={wrapRef}>
      <button
        type="button"
        className="af-help"
        aria-expanded={open}
        aria-controls={id}
        aria-label="What does this mean?"
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        className={`af-help-pop${align === 'right' ? ' af-help-right' : ''}`}
        data-open={open ? 'true' : undefined}
      >
        {children}
      </span>
    </span>
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

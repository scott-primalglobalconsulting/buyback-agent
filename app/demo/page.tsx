'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AnalysisResult } from '@/lib/agent';
import { SAMPLE_WEEK } from '@/lib/sample';
import { BuybackRate } from '@/components/BuybackRate';
import { DripDashboard } from '@/components/DripDashboard';
import { TopTasks } from '@/components/TopTasks';
import { ReplacementLadder } from '@/components/ReplacementLadder';
import { AuditTable } from '@/components/AuditTable';

// The anonymous demo. It POSTs to /api/analyze (the route ignores the body for
// the demo path and analyzes the fixed SAMPLE_WEEK under the abuse guard), then
// renders the scored result with the presentational components. ISOLATION: the
// only reach into the agent is fetch('/api/analyze') — never @/lib/agent or the
// Anthropic/Supabase clients on the client.
//
// HONEST STATES: while the request is in flight we show a polished loading
// skeleton, not a fabricated "thinking" log. The route may still DEFINE thinking
// events (live path / future use); we simply ignore them and reveal the
// dashboard on the single `result` event. Guard verdicts arrive as plain-JSON
// status codes (429/503/400/413), not streams, so we branch on the status BEFORE
// reading any body.

type DemoState =
  | { kind: 'loading' }
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
async function readStream(body: ReadableStream<Uint8Array>): Promise<DemoState> {
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

async function runDemo(signal: AbortSignal): Promise<DemoState> {
  let res: Response;
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal,
    });
  } catch {
    return { kind: 'error', message: DEFAULT_ERROR };
  }

  // Branch on the status BEFORE touching a stream — guard verdicts are JSON.
  if (res.status === 429) return { kind: 'rate_limited', message: await messageOf(res) };
  if (res.status === 503) return { kind: 'unavailable', message: await messageOf(res) };
  if (!res.ok || !res.body) return { kind: 'error', message: await messageOf(res) };

  // 200 + event-stream body: read the SSE to the terminal event.
  return readStream(res.body);
}

export default function DemoPage() {
  const [state, setState] = useState<DemoState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    runDemo(controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => controller.abort();
  }, []);

  return (
    <div className="page">
      <header className="site-head">
        <Link className="brand" href="/">
          Buyback Agent
        </Link>
        <nav>
          <Link className="nav-link" href="/app">
            Sign in
          </Link>
        </nav>
      </header>

      {state.kind === 'loading' && <LoadingState />}
      {state.kind === 'rate_limited' && (
        <StateCard
          tone="warn"
          badge="Demo limit reached"
          title="You have hit the demo limit"
          message={state.message}
          cta={{ href: '/app', label: 'Sign in for unlimited' }}
        />
      )}
      {state.kind === 'unavailable' && (
        <StateCard
          tone="crit"
          badge="Briefly unavailable"
          title="The demo is paused"
          message={state.message}
        />
      )}
      {state.kind === 'error' && (
        <StateCard
          tone="crit"
          badge="Something broke"
          title="The analysis did not complete"
          message={state.message}
        />
      )}
      {state.kind === 'result' && <Dashboard result={state.result} />}

      <footer className="site-foot wrap">
        <p className="disclaimer">
          Independent demo. Not affiliated with, endorsed by, or associated with
          Martell Group or Dan Martell.
        </p>
      </footer>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="state-loading wrap">
      <div className="loading-head">
        <span className="eyebrow">Analyzing</span>
        <h2>Reading your week</h2>
        <p>
          Scoring {SAMPLE_WEEK.length} tasks into DRIP quadrants, computing your
          reclaimable time, and picking the first hire.
        </p>
      </div>
      <div className="skel-grid" aria-hidden="true">
        <div className="skel skel-hero" />
        <div className="skel skel-block" />
        <div className="skel skel-block" />
        <div className="skel skel-wide" />
      </div>
      <span className="sr-only" role="status">
        Analyzing your week, one moment.
      </span>
    </main>
  );
}

function StateCard({
  tone,
  badge,
  title,
  message,
  cta,
}: {
  tone: 'warn' | 'crit';
  badge: string;
  title: string;
  message: string;
  cta?: { href: string; label: string };
}) {
  return (
    <main className="wrap">
      <div className="state-card" role="alert">
        <span className={`state-badge ${tone}`}>
          <span className="dot" aria-hidden="true" />
          {badge}
        </span>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="state-actions">
          {cta ? (
            <Link className="btn btn-primary" href={cta.href}>
              {cta.label}
            </Link>
          ) : null}
          <Link className="btn btn-ghost" href="/">
            Back to start
          </Link>
        </div>
      </div>
    </main>
  );
}

function Dashboard({ result }: { result: AnalysisResult }) {
  const { items, summary } = result;
  return (
    <main className="demo-main wrap">
      <section className="section">
        <div className="section-head">
          <span className="eyebrow">The number it turns on</span>
          <h2>Your reclaimable time</h2>
        </div>
        <BuybackRate items={items} firstHireRole={summary.firstHireRole} />
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">DRIP allocation</span>
          <h2>Where your week goes</h2>
        </div>
        <DripDashboard items={items} />
      </section>

      <div className="dash-grid">
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Shed first</span>
            <h2>Offload these tasks</h2>
          </div>
          <TopTasks items={items} />
        </section>
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Replacement ladder</span>
            <h2>Your first hire</h2>
          </div>
          <ReplacementLadder
            firstHireRole={summary.firstHireRole}
            justification={summary.firstHireJustification}
          />
        </section>
      </div>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">The full ledger</span>
          <h2>Every task, scored</h2>
        </div>
        <AuditTable items={items} />
      </section>
    </main>
  );
}

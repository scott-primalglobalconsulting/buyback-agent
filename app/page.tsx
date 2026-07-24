import Link from "next/link";

// Public landing. Server component — no client state. Styling comes entirely
// from globals.css design-token classes (no inline styles). The non-affiliation
// disclaimer stands on this public surface (design-system.md, "Independent demo").
export default function Home() {
  return (
    <div className="page">
      <header className="site-head">
        <span className="brand">Buyback Agent</span>
        <nav>
          <Link className="nav-link" href="/app">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="wrap hero">
        <span className="eyebrow">The Buyback Loop, operationalized</span>
        <h1>
          Score a week of work into DRIP quadrants, find where your hours leak,
          and name your first hire.
        </h1>
        <p className="lede">
          Log a week of tasks. An engineered agent sorts each into Delegate,
          Replace, Invest, or Produce, shows how much of your week is
          reclaimable, and recommends the first role to hire, with delegation
          SOPs to hand off.
        </p>

        <div className="cta-row">
          <Link className="btn btn-primary" href="/demo">
            Try with sample data
          </Link>
          <Link className="btn btn-ghost" href="/app">
            Sign in
          </Link>
        </div>

        <p className="disclaimer">
          Independent demo. Not affiliated with, endorsed by, or associated with
          Martell Group or Dan Martell.
        </p>
      </main>
    </div>
  );
}

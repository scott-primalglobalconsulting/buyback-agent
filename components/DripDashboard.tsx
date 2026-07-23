import type { ScoredItem, DripQuadrant } from "@/lib/buyback/types";
import { DRIP_QUADRANTS } from "@/lib/buyback/types";
import { quadrantHourRollup } from "@/lib/buyback/rollups";

// The signature viz: an honest 4-bucket allocation of the real week, not a
// scatter with fabricated axes. Shed (Delegate + Replace) on the left, Keep
// (Invest + Produce) on the right, each cell washed with its validated hue.
// Hours come from quadrantHourRollup; nothing is recomputed here beyond display
// scaling (bar length + % of week).
const ACTION: Record<DripQuadrant, string> = {
  Delegate: "Hand off",
  Replace: "Automate",
  Invest: "Build",
  Produce: "Protect",
};

export function DripDashboard({ items }: { items: ScoredItem[] }) {
  const rollup = quadrantHourRollup(items);
  const total = items.reduce((sum, i) => sum + i.hoursPerWeek, 0);
  const maxHrs = Math.max(...DRIP_QUADRANTS.map((q) => rollup[q]), 0);

  const tasksByQuadrant = DRIP_QUADRANTS.reduce(
    (acc, q) => {
      acc[q] = items.filter((i) => i.dripQuadrant === q).map((i) => i.task);
      return acc;
    },
    {} as Record<DripQuadrant, string[]>,
  );

  const shed = rollup.Delegate + rollup.Replace;
  const keep = rollup.Invest + rollup.Produce;

  return (
    <div>
      <div className="bracket-row">
        <div className="bracket">
          <b>Shed</b> {shed} hrs, delegate or automate
        </div>
        <div className="bracket">
          <b>Keep</b> {keep} hrs, your leverage
        </div>
      </div>
      <div className="drip-grid">
        {DRIP_QUADRANTS.map((q) => {
          const hrs = rollup[q];
          const pct = total > 0 ? Math.round((hrs / total) * 100) : 0;
          const barW = maxHrs > 0 ? (hrs / maxHrs) * 100 : 0;
          const tasks = tasksByQuadrant[q];
          return (
            <div key={q} className={`qcell q--${q.toLowerCase()}`}>
              <div className="qhead">
                <span className="qname">
                  <span className="qdot" aria-hidden="true" />
                  {q}
                </span>
                <span className="qact">{ACTION[q]}</span>
              </div>
              <div className="qhrs tnum">
                {hrs}
                <small> hrs/wk</small>
              </div>
              <div className="qpct tnum">{pct}% of the week</div>
              <svg
                className="qbar"
                viewBox="0 0 100 5"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <rect className="qbar-track" x="0" y="0" width="100" height="5" rx="2.5" />
                <rect className="qbar-fill" x="0" y="0" width={barW} height="5" rx="2.5" />
              </svg>
              {tasks.length > 0 ? (
                <div className="qtasks">
                  {tasks.map((t) => (
                    <span key={t} className="qtask">
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="qtasks-empty">No tasks in this quadrant</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

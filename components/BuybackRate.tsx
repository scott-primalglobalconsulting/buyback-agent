import type { ScoredItem } from "@/lib/buyback/types";
import { buybackRate, buybackHourlyRate } from "@/lib/buyback/rate";
import { quadrantHourRollup } from "@/lib/buyback/rollups";
import { HIRE_ROLES } from "@/lib/agent/schema";

type HireRole = (typeof HIRE_ROLES)[number];

function cap(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// The number the product turns on. buybackRate() returns a 0..1 fraction — the
// reclaimable share of the week — rendered here as a percent hero figure in the
// display face + cobalt. No dollar rate: the mockup's "$62/hr" was illustrative
// and does not match the code. All math comes from lib/buyback. The two support
// stats are reclaimable hrs/wk and the recommended first hire (design-system.md).
//
// firstHireRole is nullable: persisted audits from before migration 0004 carry
// no summary. When null, the first-hire stat is omitted (the buyback % and
// reclaimable hours stay) rather than crashing.
export function BuybackRate({
  items,
  firstHireRole,
  annualIncome,
}: {
  items: ScoredItem[];
  firstHireRole: HireRole | null;
  annualIncome?: number;
}) {
  const pct = Math.round(buybackRate(items) * 100);
  const rollup = quadrantHourRollup(items);
  const reclaimable = rollup.Delegate + rollup.Replace;
  const total = items.reduce((sum, i) => sum + i.hoursPerWeek, 0);
  const hourly =
    annualIncome && annualIncome > 0 ? buybackHourlyRate(annualIncome) : null;

  return (
    <div className="rate-panel">
      <div className="rate-main">
        {/* Left: the headline figure and what it means. */}
        <div className="rate-lead">
          <span className="rate-label">Your reclaimable time</span>
          <div className="rate-fig">
            <span className="amt tnum">{pct}%</span>
          </div>
          <p className="rate-def">
            The reclaimable share of your week. Hand off or automate everything
            below your leverage and you buy that time back.
          </p>
        </div>
        {/* Right: the supporting stats, which used to sit in a half-empty row
            under the figure and left the panel's right side dead. */}
        <div className="rate-side">
          <div className="stat">
            <div className="n tnum">
              {reclaimable}
              <small> of {total} hrs/wk</small>
            </div>
            <div className="k">Reclaimable now</div>
          </div>
          {firstHireRole ? (
            <div className="stat">
              <div className="n">{cap(firstHireRole)}</div>
              <div className="k">First hire</div>
            </div>
          ) : null}
          {hourly ? (
            <p className="rate-buyback">
              Your Buyback Rate is <b className="tnum">${hourly}/hr</b>. Delegate
              anything whose work is worth less than that.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

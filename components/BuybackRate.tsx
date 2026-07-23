import type { ScoredItem } from "@/lib/buyback/types";
import { buybackRate } from "@/lib/buyback/rate";
import { quadrantHourRollup } from "@/lib/buyback/rollups";

// The number the product turns on. buybackRate() returns a 0..1 fraction — the
// reclaimable share of the week — rendered here as a percent hero figure in the
// display face + cobalt. No dollar rate: the mockup's "$62/hr" was illustrative
// and does not match the code. All math comes from lib/buyback.
export function BuybackRate({ items }: { items: ScoredItem[] }) {
  const pct = Math.round(buybackRate(items) * 100);
  const rollup = quadrantHourRollup(items);
  const reclaimable = rollup.Delegate + rollup.Replace;
  const total = items.reduce((sum, i) => sum + i.hoursPerWeek, 0);

  return (
    <div className="rate-panel">
      <span className="rate-label">Your buyback rate</span>
      <div className="rate-fig">
        <span className="amt tnum">{pct}%</span>
      </div>
      <p className="rate-def">
        The reclaimable share of your week. Hand off or automate everything below
        your leverage and you buy that time back.
      </p>
      <div className="stat-2">
        <div className="stat">
          <div className="n tnum">
            {reclaimable}
            <small> of {total} hrs/wk</small>
          </div>
          <div className="k">Reclaimable now</div>
        </div>
        <div className="stat">
          <div className="n tnum">{total}</div>
          <div className="k">Total logged</div>
        </div>
      </div>
    </div>
  );
}

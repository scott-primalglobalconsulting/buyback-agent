import type { ScoredItem } from "@/lib/buyback/types";
import { soldVsBuilt, revenueCaution } from "@/lib/buyback/revenue";

// The sold-vs-built one-liner plus a caution when non-revenue "keep" time crowds
// out selling. Both come from lib/buyback (pure). Renders nothing when there is
// no proximity data (old audits) and no caution.
export function RevenueSummary({
  items,
  isAtRevenue,
}: {
  items: (ScoredItem & { id?: string })[];
  isAtRevenue: boolean;
}) {
  const { revenueDirect, other } = soldVsBuilt(items);
  const caution = revenueCaution(items, { isAtRevenue });
  const anyTagged = items.some((i) => i.revenueProximity != null);
  if (!anyTagged) return null;

  return (
    <div className="rev-summary">
      <p className="rev-line">
        <b className="tnum">{revenueDirect} hrs/wk</b> on revenue-direct work,{" "}
        <b className="tnum">{other} hrs/wk</b> on everything else.
      </p>
      {caution ? (
        <div className="rev-caution" role="note">
          <span className="rev-caution-badge">Heads up</span>
          <p>{caution.message}</p>
        </div>
      ) : null}
    </div>
  );
}

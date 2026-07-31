import type { ScoredItem, ValueTier } from "@/lib/buyback/types";
import { isAboveBuybackRate } from "@/lib/buyback/rate";

// The full ledger: every task scored and called. Numbers are mono, tabular, and
// right-aligned; the DRIP quadrant reads as a labeled chip (dot + label, never
// color alone); the call is keep / delegate / eliminate.
const TIER_LABEL: Record<ValueTier, string> = {
  $10: "$10",
  $100: "$100",
  $1000: "$1,000",
  $10000: "$10,000",
};

// Accept an optional id per item: the authed/persisted flow supplies stable
// audit_item ids (AuditItemWithId), the demo flow passes plain ScoredItem with
// none. Key off id when present, else fall back to a task+index key so two tasks
// sharing a name don't collide.
export function AuditTable({
  items,
  hourlyRate,
}: {
  items: (ScoredItem & { id?: string })[];
  // The founder's Buyback Rate ($/hr). When present (> 0), each row gets a marker
  // showing whether the task's value is at/above vs below the rate. Absent (e.g.
  // the demo, which has no income) -> no markers, identical to the prior render.
  hourlyRate?: number;
}) {
  const showRate = hourlyRate != null && hourlyRate > 0;
  // Drop the Revenue column entirely when nothing is scored (pre-0005 audits and
  // the cached demo result). A column of ten "not scored" chips is dead weight
  // that reads as a broken feature rather than an absent one.
  const showRevenue = items.some((it) => it.revenueProximity != null);
  return (
    <div className="tbl-wrap">
      <div className="tbl-scroll">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Task</th>
              <th className="num">Hrs/wk</th>
              <th className="num">$/hr</th>
              <th>Value tier</th>
              <th>DRIP</th>
              {showRevenue ? <th>Revenue</th> : null}
              <th>Call</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id ?? `${it.task}-${i}`}>
                <td className="t-task">{it.task}</td>
                <td className="num">{it.hoursPerWeek}</td>
                <td className="num">{it.costToDelegate}</td>
                <td className="tier">
                  {TIER_LABEL[it.valueTier]}
                  {showRate ? (
                    isAboveBuybackRate(it, hourlyRate) ? (
                      <span className="rate-mark rate-mark--above">at your rate</span>
                    ) : (
                      <span className="rate-mark rate-mark--below">below your rate</span>
                    )
                  ) : null}
                </td>
                <td>
                  <span className={`qchip q--${it.dripQuadrant.toLowerCase()}`}>
                    <span className="d" aria-hidden="true" />
                    {it.dripQuadrant}
                  </span>
                </td>
                {showRevenue ? (
                  <td>
                    {it.revenueProximity ? (
                      <span className={`rchip r--${it.revenueProximity}`}>
                        {it.revenueProximity}
                      </span>
                    ) : (
                      <span className="rchip r--unknown">not scored</span>
                    )}
                  </td>
                ) : null}
                <td>
                  <span className={`rec ${it.recommendation}`}>
                    {it.recommendation}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

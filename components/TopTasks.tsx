import type { ScoredItem } from "@/lib/buyback/types";
import { topTasksToOffload } from "@/lib/buyback/rollups";

// The heaviest non-keep tasks: what to offload first. Ranking comes from
// topTasksToOffload (top non-keep tasks by hours); the component only renders.
export function TopTasks({ items }: { items: ScoredItem[] }) {
  const tasks = topTasksToOffload(items);
  return (
    <ol className="toplist">
      {tasks.map((t, i) => (
        <li key={t.task} className="topitem">
          <span className="rank tnum">{i + 1}</span>
          <span className="name">{t.task}</span>
          <span className={`qchip q--${t.dripQuadrant.toLowerCase()}`}>
            <span className="d" aria-hidden="true" />
            {t.dripQuadrant}
          </span>
          <span className={`rec ${t.recommendation}`}>{t.recommendation}</span>
          <span className="hrs tnum">{t.hoursPerWeek} hrs/wk</span>
        </li>
      ))}
    </ol>
  );
}

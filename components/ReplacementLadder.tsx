import { HIRE_ROLES } from "@/lib/agent/schema";

type HireRole = (typeof HIRE_ROLES)[number];

function cap(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// The fixed hire order (admin -> delivery -> marketing -> sales -> leadership)
// as a vertical ladder. The recommended firstHireRole is lit in cobalt at its
// rung with the justification; the rest are dimmed. Rendered column-reversed so
// admin (rung 01, hire first) sits at the bottom of the ladder.
//
// LAYOUT: the rungs and the reasoning are ONE panel (.hire-panel), rungs on the
// left and the "<Role>, first." rationale on the right. They used to render as
// siblings — a bordered card with a bare heading + paragraph loose underneath,
// which read as two unrelated blocks stacked by accident.
//
// firstHireRole is nullable: persisted audits from before migration 0004 carry
// no summary. When null, no rung is lit and the panel shows a "no recommendation
// recorded" note instead of the highlighted hire, rather than crashing.
export function ReplacementLadder({
  firstHireRole,
  justification,
}: {
  firstHireRole: HireRole | null;
  justification: string;
}) {
  return (
    <div className="hire-panel">
      <ol className="rungs">
        {HIRE_ROLES.map((role, i) => {
          const on = role === firstHireRole;
          return (
            <li key={role} className={`rung ${on ? "on" : "off"}`}>
              <span className="idx">{String(i + 1).padStart(2, "0")}</span>
              <span className="role">{cap(role)}</span>
              {on ? (
                <span className="tag-now">Hire first</span>
              ) : (
                <span className="note">later</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="rep-why">
        <h3>{firstHireRole ? `${cap(firstHireRole)}, first.` : 'No recommendation recorded.'}</h3>
        <p>
          The ladder is fixed: admin, delivery, marketing, sales, leadership. You
          climb it only when the rung below is covered. The agent picks the
          earliest rung that unloads the most hours.
        </p>
        {firstHireRole ? (
          <div className="just">
            <span className="just-label">Why this rung</span>
            <p>{justification}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

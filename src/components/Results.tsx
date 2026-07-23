import { Lock, Unlock } from "lucide-react";
import { DATA, TIER_NAMES, type Assignment, type BuilderState, type Recommendation } from "../model";

interface ResultsProps {
  state: BuilderState;
  recommendations: Recommendation[];
  mutate: (recipe: (draft: BuilderState) => void) => void;
}

function FitMeter({ score }: { score: number }) {
  return <span className="fit-meter" aria-label={`${score} out of 5 fit`}>{[1, 2, 3, 4, 5].map((dot) => <i key={dot} className={dot <= score ? "filled" : ""} />)}</span>;
}

export function Results({ state, recommendations, mutate }: ResultsProps) {
  const assigned = recommendations.filter((result) => result.assignments.length > 0);
  const lockAssignment = (assignment: Assignment) => mutate((draft) => {
    const index = draft.lockedAssignments.findIndex((lock) => lock.immortalId === assignment.immortalId && lock.runeId === assignment.runeId && lock.tier === assignment.tier);
    if (index >= 0) draft.lockedAssignments.splice(index, 1);
    else if (draft.lockedAssignments.filter((lock) => lock.immortalId === assignment.immortalId).length < 2) {
      draft.lockedAssignments.push({ immortalId: assignment.immortalId, runeId: assignment.runeId, tier: assignment.tier });
    }
  });

  return (
    <section className="work-section results-section" aria-labelledby="results-title">
      <div className="section-heading">
        <div><span className="step-number">3</span><h2 id="results-title">Best setup</h2><span className="section-count">{assigned.length} equipped</span></div>
      </div>
      {assigned.length === 0 ? (
        <div className="empty-state"><img src="/assets/ui/rune-smith.png" alt="" /><strong>No assignments yet</strong><span>Add owned runes and keep at least one Immortal selected.</span></div>
      ) : (
        <div className="results-list">
          {assigned.map((result) => {
            const immortal = DATA.immortals.find((item) => item.id === result.immortalId)!;
            return (
              <article className="result-card" key={result.immortalId}>
                <header><img src={immortal.image} alt="" /><div><h3>{immortal.name}</h3><span>{immortal.role} · {state.mode.toUpperCase()}</span></div></header>
                <div className="assignment-list">
                  {[0, 1].map((slot) => {
                    const assignment = result.assignments[slot];
                    if (!assignment) return <div className="assignment-row empty-slot" key={slot}><span>Open rune slot</span></div>;
                    const rune = DATA.runes.find((item) => item.id === assignment.runeId)!;
                    return (
                      <div className="assignment-row" key={`${assignment.runeId}:${assignment.tier}`}>
                        <img src={rune.image} alt="" />
                        <div className="assignment-copy"><strong>{rune.name.replace("Rune of ", "")}</strong><span className={`tier-label tier-${assignment.tier}`}>{TIER_NAMES[assignment.tier]}</span><FitMeter score={assignment.score} /></div>
                        {assignment.confidence === "provisional" && <span className="provisional-dot" title="Provisional rating">P</span>}
                        <button className="icon-button lock-button" onClick={() => lockAssignment(assignment)} title={assignment.locked ? "Unlock assignment" : "Lock assignment"} aria-label={assignment.locked ? "Unlock assignment" : "Lock assignment"}>{assignment.locked ? <Lock /> : <Unlock />}</button>
                        {assignment.alternatives.length > 0 && <details><summary>Alternatives</summary><ul>{assignment.alternatives.map((alternative) => <li key={alternative.immortalId}>{DATA.immortals.find((item) => item.id === alternative.immortalId)?.name}<FitMeter score={alternative.score} /></li>)}</ul></details>}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

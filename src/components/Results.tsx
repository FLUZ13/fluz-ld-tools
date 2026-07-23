import { DATA, ratingsFor, TIERS, TIER_NAMES, type BuilderState, type Recommendation, type RuneDefinition, type RuneTier } from "../model";

interface ResultsProps {
  state: BuilderState;
  recommendations: Recommendation[];
}

interface RuneAlternative {
  rune: RuneDefinition;
  tier: RuneTier;
  score: number;
}

function FitMeter({ score }: { score: number }) {
  return <span className="fit-meter" aria-label={`${score} out of 5 fit`}>{[1, 2, 3, 4, 5].map((dot) => <i key={dot} className={dot <= score ? "filled" : ""} />)}</span>;
}

function alternativeRunes(state: BuilderState, immortalId: string, equippedRuneIds: Set<string>): RuneAlternative[] {
  const ratings = ratingsFor(state.metaVersion);
  return DATA.runes
    .filter((rune) => !equippedRuneIds.has(rune.id))
    .flatMap((rune) => {
      const tier = [...rune.availableTiers]
        .filter((candidate): candidate is RuneTier => TIERS.includes(candidate) && (state.inventory[rune.id]?.[candidate] ?? 0) > 0)
        .sort((left, right) => right - left)[0];
      const score = ratings[rune.id]?.[immortalId]?.[state.mode] ?? 0;
      return tier && score >= 3 ? [{ rune, tier, score }] : [];
    })
    .sort((left, right) => right.score - left.score || right.tier - left.tier || left.rune.name.localeCompare(right.rune.name))
    .slice(0, 4);
}

export function Results({ state, recommendations }: ResultsProps) {
  const assigned = recommendations.filter((result) => result.assignments.length > 0);

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
            const alternatives = alternativeRunes(state, immortal.id, new Set(result.assignments.map((assignment) => assignment.runeId)));
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
                      </div>
                    );
                  })}
                </div>
                <details className="rune-alternatives"><summary>Alternative runes</summary>{alternatives.length > 0 ? <ul>{alternatives.map((alternative) => <li key={alternative.rune.id}><img src={alternative.rune.image} alt="" /><span>{alternative.rune.name.replace("Rune of ", "")}</span><em className={`tier-label tier-${alternative.tier}`}>{TIER_NAMES[alternative.tier]}</em><FitMeter score={alternative.score} /></li>)}</ul> : <p>No other owned runes have a Good rating or higher.</p>}</details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

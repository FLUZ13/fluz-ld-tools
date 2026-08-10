import { Lock, LockOpen } from "lucide-react";
import { DATA, LATEST_META_VERSION, conditionalPairsFor, ratingsFor, reservedRuneCount, TIERS, TIER_NAMES, type Assignment, type BuilderState, type Recommendation, type RuneDefinition, type RuneTier } from "../model";

interface ResultsProps {
  state: BuilderState;
  recommendations: Recommendation[];
  mutate: (recipe: (draft: BuilderState) => void) => void;
}

interface RuneAlternative {
  rune: RuneDefinition;
  tier: RuneTier;
  score: number;
}

function FitMeter({ score, maximum = 5 }: { score: number; maximum?: number }) {
  return <span className="fit-meter" aria-label={`${score} out of ${maximum} fit`}>{Array.from({ length: maximum }, (_, index) => index + 1).map((dot) => <i key={dot} className={dot <= score ? "filled" : ""} />)}</span>;
}

function alternativeRunes(state: BuilderState, immortalId: string, equippedRuneIds: Set<string>): RuneAlternative[] {
  const ratings = ratingsFor(state.metaVersion);
  return DATA.runes
    .filter((rune) => !equippedRuneIds.has(rune.id))
    .flatMap((rune) => {
      const tier = [...rune.availableTiers]
        .filter((candidate): candidate is RuneTier => TIERS.includes(candidate) && (state.inventory[rune.id]?.[candidate] ?? 0) - reservedRuneCount(state, rune.id, candidate) > 0)
        .sort((left, right) => right - left)[0];
      const score = ratings[rune.id]?.[immortalId]?.[state.mode] ?? 0;
      return tier && score >= 3 ? [{ rune, tier, score }] : [];
    })
    .sort((left, right) => right.score - left.score || right.tier - left.tier || left.rune.name.localeCompare(right.rune.name))
    .slice(0, 4);
}

function ownsRune(state: BuilderState, runeId: string) {
  return TIERS.some((tier) => (state.inventory[runeId]?.[tier] ?? 0) > 0);
}

function replaceFirstSlotLock(draft: BuilderState, immortalId: string, runeId?: string, tier?: RuneTier) {
  draft.lockedAssignments = draft.lockedAssignments.filter((lock) => !(lock.immortalId === immortalId && lock.slot === 0));
  if (runeId && tier) draft.lockedAssignments.push({ immortalId, runeId, tier, slot: 0 });
}

function CustomRuneSelect({ state, immortalId, mutate, compact = false }: { state: BuilderState; immortalId: string; mutate: ResultsProps["mutate"]; compact?: boolean }) {
  const slotZeroLock = state.lockedAssignments.find((lock) => lock.immortalId === immortalId && lock.slot === 0);
  const slotOneLock = state.lockedAssignments.find((lock) => lock.immortalId === immortalId && lock.slot === 1);
  const options = DATA.runes.flatMap((rune) => [...rune.availableTiers]
    .filter((tier): tier is RuneTier => {
      if (!TIERS.includes(tier) || slotOneLock?.runeId === rune.id) return false;
      const reservedElsewhere = state.lockedAssignments.filter((lock) =>
        lock.runeId === rune.id && lock.tier === tier && !(lock.immortalId === immortalId && lock.slot === 0)).length;
      return (state.inventory[rune.id]?.[tier] ?? 0) - reservedElsewhere > 0;
    })
    .map((tier) => ({ rune, tier })))
    .sort((left, right) => left.rune.name.localeCompare(right.rune.name) || right.tier - left.tier);
  const value = slotZeroLock ? `${slotZeroLock.runeId}:${slotZeroLock.tier}` : "";

  const selectCustomRune = (nextValue: string) => mutate((draft) => {
    if (!nextValue) return replaceFirstSlotLock(draft, immortalId);
    const separator = nextValue.lastIndexOf(":");
    const runeId = nextValue.slice(0, separator);
    const tier = Number(nextValue.slice(separator + 1)) as RuneTier;
    replaceFirstSlotLock(draft, immortalId, runeId, tier);
  });

  return <label className={`custom-rune-select ${compact ? "compact" : ""}`}>
    <span>Custom rune</span>
    <select value={value} onChange={(event) => selectCustomRune(event.target.value)} disabled={options.length === 0 && !slotZeroLock} aria-label={`Custom first-slot rune for ${DATA.immortals.find((immortal) => immortal.id === immortalId)?.name}`}>
      <option value="">Automatic first slot</option>
      {options.map(({ rune, tier }) => {
        const reservedElsewhere = state.lockedAssignments.filter((lock) => lock.runeId === rune.id && lock.tier === tier && !(lock.immortalId === immortalId && lock.slot === 0)).length;
        const free = (state.inventory[rune.id]?.[tier] ?? 0) - reservedElsewhere;
        const availability = slotZeroLock?.runeId === rune.id && slotZeroLock.tier === tier ? "selected" : `${free} free`;
        return <option key={`${rune.id}:${tier}`} value={`${rune.id}:${tier}`}>{rune.name.replace("Rune of ", "")} — {TIER_NAMES[tier]} ({availability})</option>;
      })}
    </select>
  </label>;
}

export function Results({ state, recommendations, mutate }: ResultsProps) {
  const assigned = recommendations.filter((result) => result.assignments.length > 0);
  const unassigned = recommendations.filter((result) => result.assignments.length === 0);
  const toggleAssignmentLock = (assignment: Assignment) => mutate((draft) => {
    const index = draft.lockedAssignments.findIndex((lock) => lock.immortalId === assignment.immortalId && lock.slot === assignment.slot);
    if (assignment.locked) {
      if (index >= 0) draft.lockedAssignments.splice(index, 1);
      return;
    }
    if (index >= 0) draft.lockedAssignments.splice(index, 1);
    draft.lockedAssignments.push({ immortalId: assignment.immortalId, runeId: assignment.runeId, tier: assignment.tier, slot: assignment.slot });
  });
  const selectAlternative = (immortalId: string, alternative: RuneAlternative) => mutate((draft) => {
    replaceFirstSlotLock(draft, immortalId, alternative.rune.id, alternative.tier);
  });

  return (
    <section className="work-section results-section" aria-labelledby="results-title">
      <div className="section-heading">
        <div><span className="step-number">3</span><h2 id="results-title">Best setup</h2><span className="section-count">{assigned.length} equipped</span></div>
      </div>
      {recommendations.length === 0 ? (
        <div className="empty-state"><img src="/assets/ui/rune-smith.png" alt="" /><strong>No assignments yet</strong><span>Add owned runes and keep at least one Immortal selected.</span></div>
      ) : (
        <div className="results-list">
          {assigned.length === 0 && <div className="empty-state"><img src="/assets/ui/rune-smith.png" alt="" /><strong>No automatic assignments</strong><span>Choose a custom first-slot rune below to create a reserved setup.</span></div>}
          {assigned.map((result) => {
            const immortal = DATA.immortals.find((item) => item.id === result.immortalId)!;
            const alternatives = alternativeRunes(state, immortal.id, new Set(result.assignments.map((assignment) => assignment.runeId)));
            const availableConditionalPairs = conditionalPairsFor(state.metaVersion, immortal.id, state.mode)
              .filter((pair) => pair.runes.every((runeId) => ownsRune(state, runeId)));
            return (
              <article className="result-card" key={result.immortalId}>
                <header><img src={immortal.image} alt="" /><div><h3>{immortal.name}</h3><span>{immortal.role} · {state.mode.toUpperCase()}</span></div></header>
                <div className="assignment-list">
                  {[0, 1].map((slot) => {
                    const assignment = result.assignments.find((candidate) => candidate.slot === slot);
                    if (!assignment) return <div className="assignment-row empty-slot" key={slot}><span>Open rune slot</span></div>;
                    const rune = DATA.runes.find((item) => item.id === assignment.runeId)!;
                    return (
                      <div className={`assignment-row ${assignment.locked ? "locked-assignment" : ""}`} key={slot}>
                        <img src={rune.image} alt="" />
                        <div className="assignment-copy"><strong>{rune.name.replace("Rune of ", "")}</strong><span className={`tier-label tier-${assignment.tier}`}>{TIER_NAMES[assignment.tier]}</span><FitMeter score={assignment.score} maximum={state.metaVersion === LATEST_META_VERSION ? 6 : 5} /></div>
                        <button type="button" className={`icon-button lock-button ${assignment.locked ? "active" : ""}`} onClick={() => toggleAssignmentLock(assignment)} title={assignment.locked ? "Unlock this rune" : "Lock this rune to this Immortal"} aria-label={`${assignment.locked ? "Unlock" : "Lock"} ${rune.name.replace("Rune of ", "")} ${TIER_NAMES[assignment.tier]} on ${immortal.name}`}>{assignment.locked ? <Lock /> : <LockOpen />}</button>
                      </div>
                    );
                  })}
                </div>
                <details className="rune-alternatives">
                  <summary><span>Alternative runes</span><small>{alternatives.length}</small></summary>
                  {availableConditionalPairs.map((pair) => <p className="alternative-combo-tip" key={pair.runes.join(":")}><strong>{pair.label}: {pair.runes.map((runeId) => DATA.runes.find((rune) => rune.id === runeId)?.name.replace("Rune of ", "")).join(" + ")}</strong><span>{pair.note}</span></p>)}
                  {alternatives.length > 0 ? <ul>{alternatives.map((alternative) => <li key={alternative.rune.id}><button type="button" onClick={() => selectAlternative(immortal.id, alternative)} title="Use as the locked first-slot rune" aria-label={`Use ${alternative.rune.name.replace("Rune of ", "")} ${TIER_NAMES[alternative.tier]} on ${immortal.name} and lock it in the first slot`}><img src={alternative.rune.image} alt="" /><span>{alternative.rune.name.replace("Rune of ", "")}</span><em className={`tier-label tier-${alternative.tier}`}>{TIER_NAMES[alternative.tier]}</em><FitMeter score={alternative.score} maximum={state.metaVersion === LATEST_META_VERSION ? 6 : 5} /></button></li>)}</ul> : <p>No other owned runes have a Good rating or higher.</p>}
                </details>
                <footer className="result-card-footer">
                  <CustomRuneSelect state={state} immortalId={immortal.id} mutate={mutate} />
                  <a className="best-in-slot-link" href={`/runes?immortal=${encodeURIComponent(immortal.id)}`}>
                    <span>Best in Slot Rune</span>
                    <strong>{immortal.name}</strong>
                  </a>
                </footer>
              </article>
            );
          })}
          {unassigned.length > 0 && <details className="unassigned-immortals">
            <summary><span>Unassigned Immortals</span><small>{unassigned.length}</small></summary>
            <div>{unassigned.map((result) => {
              const immortal = DATA.immortals.find((item) => item.id === result.immortalId)!;
              return <div className="unassigned-immortal-row" key={immortal.id}><img src={immortal.image} alt="" /><strong>{immortal.name}</strong><CustomRuneSelect state={state} immortalId={immortal.id} mutate={mutate} compact /></div>;
            })}</div>
          </details>}
        </div>
      )}
    </section>
  );
}

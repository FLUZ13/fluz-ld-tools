import { Check, CheckCheck, Minus, Plus, RotateCcw, Star, X } from "lucide-react";
import { defaultImmortalPriorityTier, IMMORTAL_PRIORITY_TIERS, immortalPriorityTier } from "../data/immortal-priority";
import { DATA, type BuilderState, type ImmortalPriorityTier } from "../model";

interface RosterProps {
  state: BuilderState;
  mutate: (recipe: (draft: BuilderState) => void) => void;
}

export function Roster({ state, mutate }: RosterProps) {
  const selected = new Set(state.selectedImmortalIds);
  const favorites = new Set(state.favoriteImmortalIds);
  const toggle = (id: string) => mutate((draft) => {
    if (draft.selectedImmortalIds.includes(id)) {
      draft.selectedImmortalIds = draft.selectedImmortalIds.filter((value) => value !== id);
    } else draft.selectedImmortalIds.push(id);
  });
  const toggleFavorite = (id: string) => mutate((draft) => {
    if (draft.favoriteImmortalIds.includes(id)) draft.favoriteImmortalIds = draft.favoriteImmortalIds.filter((value) => value !== id);
    else draft.favoriteImmortalIds.push(id);
  });
  const cyclePriority = (id: string) => mutate((draft) => {
    draft.immortalPriorityOverrides ??= {};
    const current = immortalPriorityTier(draft.mode, id, draft.immortalPriorityOverrides);
    const next = IMMORTAL_PRIORITY_TIERS[(IMMORTAL_PRIORITY_TIERS.indexOf(current) + 1) % IMMORTAL_PRIORITY_TIERS.length] as ImmortalPriorityTier;
    const defaultTier = defaultImmortalPriorityTier(draft.mode, id);
    draft.immortalPriorityOverrides[draft.mode] ??= {};
    if (next === defaultTier) delete draft.immortalPriorityOverrides[draft.mode]![id];
    else draft.immortalPriorityOverrides[draft.mode]![id] = next;
    if (Object.keys(draft.immortalPriorityOverrides[draft.mode]!).length === 0) delete draft.immortalPriorityOverrides[draft.mode];
  });
  const resetModePriorities = () => mutate((draft) => {
    if (draft.immortalPriorityOverrides) delete draft.immortalPriorityOverrides[draft.mode];
  });
  const changeLevel = (id: string, amount: number) => mutate((draft) => {
    const current = draft.immortalLevels[id] ?? 15;
    draft.immortalLevels[id] = Math.max(15, Math.min(25, current + amount));
  });

  return (
    <section className="work-section roster-section" aria-labelledby="roster-title">
      <div className="section-heading">
        <div><span className="step-number">2</span><h2 id="roster-title">Immortal forms</h2><span className="section-count">{selected.size}/{DATA.immortals.length}</span></div>
        <div className="heading-actions">
          <button className="text-button" onClick={resetModePriorities} disabled={!state.immortalPriorityOverrides?.[state.mode]} title={`Reset ${state.mode.toUpperCase()} priorities to FLUZ defaults`}><RotateCcw />Reset ranks</button>
          <button className="text-button" onClick={() => mutate((draft) => { draft.selectedImmortalIds = DATA.immortals.map((item) => item.id); })}><CheckCheck />All</button>
          <button className="text-button" onClick={() => mutate((draft) => { draft.selectedImmortalIds = []; })}><X />Clear</button>
        </div>
      </div>
      <div className="roster-grid">
        {DATA.immortals.map((immortal) => {
          const priorityTier = immortalPriorityTier(state.mode, immortal.id, state.immortalPriorityOverrides);
          const isFavorite = favorites.has(immortal.id);
          const displayedPriorityTier = isFavorite ? "S+" : priorityTier;
          const nextPriorityTier = IMMORTAL_PRIORITY_TIERS[(IMMORTAL_PRIORITY_TIERS.indexOf(priorityTier) + 1) % IMMORTAL_PRIORITY_TIERS.length];
          const priorityDescription = isFavorite
            ? `S+ personal favorite for ${state.mode.toUpperCase()}. Remove the star to edit its saved ${priorityTier} priority.`
            : `${priorityTier}-tier ${state.mode.toUpperCase()} usage preference. Press to change to ${nextPriorityTier}. This only breaks equal rune-fit decisions.`;
          return <div className={`immortal-card ${isFavorite ? "favorite" : ""}`} key={immortal.id}>
            <button
              className={`immortal-toggle ${selected.has(immortal.id) ? "selected" : ""}`}
              onClick={() => toggle(immortal.id)}
              aria-pressed={selected.has(immortal.id)}
            >
              <span className="portrait-wrap"><img src={immortal.image} alt="" />{selected.has(immortal.id) && <Check className="selected-mark" />}</span>
              <span>{immortal.name}</span>
            </button>
            <button
              className={`mode-priority-badge ${isFavorite ? "priority-s-plus" : `priority-${priorityTier.toLowerCase()}`}`}
              aria-label={priorityDescription}
              title={priorityDescription}
              onClick={() => cyclePriority(immortal.id)}
              disabled={isFavorite}
            >{displayedPriorityTier}</button>
            <button
              className={`favorite-immortal ${isFavorite ? "active" : ""}`}
              onClick={() => toggleFavorite(immortal.id)}
              aria-label={`${isFavorite ? "Remove" : "Add"} ${immortal.name} ${isFavorite ? "from" : "to"} favorites`}
              aria-pressed={isFavorite}
              title={isFavorite ? "Remove S+ favorite" : "Promote to S+ favorite"}
            ><Star /></button>
            {immortal.limitBreak && <div className="limit-break-control" aria-label={`${immortal.name} Limit Break level`}>
              <button onClick={() => changeLevel(immortal.id, -1)} disabled={(state.immortalLevels[immortal.id] ?? 15) <= 15} aria-label={`Decrease ${immortal.name} level`} title="Decrease Limit Break level"><Minus /></button>
              <span><b>LB</b> Lv {state.immortalLevels[immortal.id] ?? 15}</span>
              <button onClick={() => changeLevel(immortal.id, 1)} disabled={(state.immortalLevels[immortal.id] ?? 15) >= 25} aria-label={`Increase ${immortal.name} level`} title="Increase Limit Break level"><Plus /></button>
            </div>}
          </div>;
        })}
      </div>
    </section>
  );
}

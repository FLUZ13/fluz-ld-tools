import { Check, CheckCheck, Star, X } from "lucide-react";
import { DATA, type BuilderState } from "../model";

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
      draft.lockedAssignments = draft.lockedAssignments.filter((lock) => lock.immortalId !== id);
    } else draft.selectedImmortalIds.push(id);
  });
  const toggleFavorite = (id: string) => mutate((draft) => {
    if (draft.favoriteImmortalIds.includes(id)) draft.favoriteImmortalIds = draft.favoriteImmortalIds.filter((value) => value !== id);
    else draft.favoriteImmortalIds.push(id);
  });

  return (
    <section className="work-section roster-section" aria-labelledby="roster-title">
      <div className="section-heading">
        <div><span className="step-number">2</span><h2 id="roster-title">Immortal forms</h2><span className="section-count">{selected.size}/{DATA.immortals.length}</span></div>
        <div className="heading-actions">
          <button className="text-button" onClick={() => mutate((draft) => { draft.selectedImmortalIds = DATA.immortals.map((item) => item.id); })}><CheckCheck />All</button>
          <button className="text-button" onClick={() => mutate((draft) => { draft.selectedImmortalIds = []; draft.lockedAssignments = []; })}><X />Clear</button>
        </div>
      </div>
      <div className="roster-grid">
        {DATA.immortals.map((immortal) => (
          <div className={`immortal-card ${favorites.has(immortal.id) ? "favorite" : ""}`} key={immortal.id}>
            <button
              className={`immortal-toggle ${selected.has(immortal.id) ? "selected" : ""}`}
              onClick={() => toggle(immortal.id)}
              aria-pressed={selected.has(immortal.id)}
            >
              <span className="portrait-wrap"><img src={immortal.image} alt="" />{selected.has(immortal.id) && <Check className="selected-mark" />}</span>
              <span>{immortal.name}</span>
              {immortal.provisional && <small>Provisional</small>}
            </button>
            <button
              className={`favorite-immortal ${favorites.has(immortal.id) ? "active" : ""}`}
              onClick={() => toggleFavorite(immortal.id)}
              aria-label={`${favorites.has(immortal.id) ? "Remove" : "Add"} ${immortal.name} ${favorites.has(immortal.id) ? "from" : "to"} favorites`}
              aria-pressed={favorites.has(immortal.id)}
              title={favorites.has(immortal.id) ? "Remove favorite" : "Favorite"}
            ><Star /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

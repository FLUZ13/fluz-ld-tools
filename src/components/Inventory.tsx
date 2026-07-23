import { FileDown, FileUp, Minus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DATA, TIERS, TIER_NAMES, type BuilderState, type RuneTier } from "../model";

interface InventoryProps {
  state: BuilderState;
  mutate: (recipe: (draft: BuilderState) => void) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}

export function Inventory({ state, mutate, onExport, onImport }: InventoryProps) {
  const [query, setQuery] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => DATA.runes.filter((rune) => {
    const matches = rune.name.toLowerCase().includes(query.toLowerCase());
    const owned = Object.values(state.inventory[rune.id] ?? {}).some((count) => (count ?? 0) > 0);
    return matches && (!ownedOnly || owned);
  }), [ownedOnly, query, state.inventory]);

  const setCount = (runeId: string, tier: RuneTier, value: number) => mutate((draft) => {
    draft.inventory[runeId] ??= {};
    draft.inventory[runeId][tier] = Math.max(0, Math.min(99, Math.floor(value)));
  });

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await onImport(file);
      setBackupMessage("Backup loaded.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Could not load that backup file.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <section className="work-section inventory-section" aria-labelledby="inventory-title">
      <div className="section-heading">
        <div><span className="step-number">1</span><h2 id="inventory-title">Your runes</h2></div>
        <div className="heading-actions inventory-actions">
          <button className="text-button" onClick={onExport} title="Save a local backup file"><FileDown /><span>Save file</span></button>
          <button className="text-button" onClick={() => fileInput.current?.click()} title="Load a local backup file"><FileUp /><span>Load file</span></button>
          <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { void loadFile(event.target.files?.[0]); }} />
          <button className="icon-button quiet" onClick={() => mutate((draft) => { draft.inventory = {}; })} title="Clear inventory" aria-label="Clear inventory"><Trash2 /></button>
        </div>
      </div>
      <div className="inventory-tools">
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runes" /></label>
        <label className="checkbox-label"><input type="checkbox" checked={ownedOnly} onChange={(event) => setOwnedOnly(event.target.checked)} />Owned</label>
      </div>
      {backupMessage && <div className="backup-message" aria-live="polite">{backupMessage}</div>}
      <div className="rune-list">
        <div className="tier-header" aria-hidden="true">
          <span />
          <div className="tier-labels">
            {TIERS.map((tier) => <span key={tier} className={`tier-${tier}`}>{TIER_NAMES[tier]}</span>)}
          </div>
        </div>
        {filtered.map((rune) => (
          <div className="rune-row" key={rune.id}>
            <div className="rune-identity">
              <img src={rune.image} alt="" />
              <div><strong>{rune.name.replace("Rune of ", "")}</strong><span>Tier {rune.tierLabel}</span></div>
            </div>
            <div className="tier-inputs">
              {TIERS.map((tier) => {
                const available = rune.availableTiers.includes(tier);
                const count = state.inventory[rune.id]?.[tier] ?? 0;
                return (
                  <div className={`quantity-control tier-${tier} ${!available ? "unavailable" : ""}`} key={tier}>
                    <button onClick={() => setCount(rune.id, tier, count - 1)} disabled={!available || count === 0} aria-label={`Remove ${TIER_NAMES[tier]} ${rune.name}`}><Minus /></button>
                    <input
                      aria-label={`${TIER_NAMES[tier]} ${rune.name} count`}
                      type="number" min="0" max="99" inputMode="numeric" value={available ? count : ""}
                      disabled={!available}
                      onChange={(event) => setCount(rune.id, tier, Number(event.target.value) || 0)}
                    />
                    <button onClick={() => setCount(rune.id, tier, count + 1)} disabled={!available || count >= 99} aria-label={`Add ${TIER_NAMES[tier]} ${rune.name}`}><Plus /></button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DATA, ratingsFor, type GameMode, type ImmortalDefinition, type MetaVersion } from "../model";

const roles: Array<{ id: ImmortalDefinition["role"]; label: string }> = [
  { id: "support", label: "Support" },
  { id: "physical", label: "Physical DPS" },
  { id: "magic", label: "Magic DPS" },
  { id: "hybrid", label: "Hybrid" },
];
const modes: Array<{ id: GameMode; label: string }> = [
  { id: "pve", label: "PvE" },
  { id: "pvp", label: "PvP" },
  { id: "guild", label: "Guild" },
];
const scoreLabels = ["X", "Low", "Maybe", "Good", "Great", "Best"];

export function RunesReference() {
  const [mode, setMode] = useState<GameMode>("pve");
  const [metaVersion, setMetaVersion] = useState<MetaVersion>("1.1");
  const [query, setQuery] = useState("");
  const ratings = ratingsFor(metaVersion);
  const groupedImmortals = useMemo(() => roles.map((role) => ({
    ...role,
    immortals: DATA.immortals.filter((immortal) => immortal.role === role.id),
  })).filter((group) => group.immortals.length > 0), []);
  const orderedImmortals = groupedImmortals.flatMap((group) => group.immortals);
  const filteredRunes = DATA.runes.filter((rune) => `${rune.name} ${rune.notes} ${rune.tierLabel}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="runes-reference">
      <section className="reference-toolbar" aria-labelledby="runes-title">
        <div className="reference-title">
          <img src="/assets/ui/rune-smith.png" alt="" />
          <div><h1 id="runes-title">Rune data</h1><p>{DATA.runes.length} runes compared across {DATA.immortals.length} Immortals</p></div>
        </div>
        <label className="search-field reference-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runes or remarks" /></label>
        <nav className="meta-version-control" aria-label="Rune meta version">
          <button className={metaVersion === "1.0" ? "active" : ""} onClick={() => setMetaVersion("1.0")}>v1.0</button>
          <button className={metaVersion === "1.1" ? "active" : ""} onClick={() => setMetaVersion("1.1")}>v1.1</button>
        </nav>
        <nav className="reference-mode" aria-label="Rating mode">
          {modes.map((item) => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>{item.label}</button>)}
        </nav>
      </section>

      <section className="reference-legend" aria-label="Recommendation score legend">
        <strong>Meta v{metaVersion} recommendation score</strong>
        {scoreLabels.map((label, score) => <span key={label} className={`score-chip score-${score}`}><b>{label}</b><small>{score}/5</small></span>)}
        <span className="legend-note">New Guardian ratings marked provisional</span>
      </section>

      <div className="runes-table-wrap">
        <table className="runes-data-table">
          <thead>
            <tr>
              <th rowSpan={2} className="rune-name-column">Rune</th>
              <th rowSpan={2} className="description-column legendary-column">Legendary</th>
              <th rowSpan={2} className="description-column mythic-column">Mythic</th>
              <th rowSpan={2} className="description-column immortal-description-column">Immortal</th>
              <th rowSpan={2} className="rank-column">Tier</th>
              <th rowSpan={2} className="remarks-column">Special remarks</th>
              {groupedImmortals.map((group) => <th key={group.id} colSpan={group.immortals.length} className={`role-group role-${group.id}`}>{group.label}</th>)}
            </tr>
            <tr>
              {orderedImmortals.map((immortal) => (
                <th key={immortal.id} className="immortal-column" title={immortal.name}>
                  <img src={immortal.image} alt="" />
                  <span>{immortal.name}</span>
                  {immortal.provisional && <i title="Provisional rating">P</i>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRunes.map((rune) => (
              <tr key={rune.id}>
                <th scope="row" className="rune-name-column"><img src={rune.image} alt="" /><span>{rune.name.replace("Rune of ", "")}</span></th>
                <td className="description-column">{rune.descriptions.legendary}</td>
                <td className="description-column">{rune.descriptions.mythic}</td>
                <td className="description-column">{rune.descriptions.immortal}</td>
                <td className="rank-column"><b>{rune.tierLabel}</b></td>
                <td className="remarks-column">{rune.notes || "-"}</td>
                {orderedImmortals.map((immortal) => {
                  const rating = ratings[rune.id]?.[immortal.id];
                  const score = rating?.[mode];
                  const label = score == null ? "-" : scoreLabels[score] ?? String(score);
                  return (
                    <td key={immortal.id} className={`rating-cell ${score == null ? "score-null" : `score-${score}`} ${metaVersion === "1.0" && rating?.confidence === "provisional" ? "provisional" : ""}`} title={`${rune.name} on ${immortal.name}: ${score == null ? "not rated" : `${score}/5 (${label})`}`}>
                      <span>{label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRunes.length === 0 && <div className="reference-empty">No runes match that search.</div>}
      </div>
    </main>
  );
}

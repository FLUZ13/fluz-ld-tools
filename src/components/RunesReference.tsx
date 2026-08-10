import { ChevronDown, ChevronRight, ChevronUp, FlaskConical, MessageCircle, Minus, Plus, RotateCcw, Search } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DATA, DEFAULT_META_VERSION, LATEST_META_VERSION, META_VERSIONS, bisGuideFor, bisPairFor, conditionalPairsFor, metaVersionLabel, ratingsFor, specialRuneFor, type GameMode, type ImmortalDefinition, type MetaVersion } from "../model";

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
const scoreLabels = ["X", "Low", "Maybe", "Good", "Great", "Best", "BiS"];
const MIN_TABLE_ZOOM = 25;
const MAX_TABLE_ZOOM = 125;
const TABLE_ZOOM_STEP = 10;
const runeName = (runeId: string) => DATA.runes.find((rune) => rune.id === runeId)?.name.replace("Rune of ", "") ?? runeId;

const specialRemarks: Record<string, string> = {
  "onslaught": "Special X/6: Awakened Hailey below level 23 only. Test only with multiple Kitty Mages, very high Mana regeneration, and high attack speed; this is never a normal BiS rune.",
  "execution": "Special X/6: Grand Mama in Guild Raid only. Use as a boss finisher only when the team can defeat the boss in one round; otherwise it has no practical value.",
  "undying-oath": "Special X/6: Reaper Dian in Guild Raid only. This is a high-risk 25% revive gamble; whether Skill DMG buffs survive the revive is still unconfirmed.",
  "immobility": "Special X/6: Primeval Bomba in PvP or Guild Raid only. Consider it only in a completely safe fixed position; surviving by moving Bomba always takes priority.",
};

const validationTests = [
  {
    name: "Captain Roka PvP - final open BiS decision",
    question: "Is Focus or Amplification the better second rune in PvP?",
    pairs: "Slayer + Focus vs Slayer + Amplification",
    steps: "Use the same PvP setup and play each pair 3 times. Change only the runes.",
    send: "At the final wave, take a screenshot of the final damage/result screen for all 6 runs. Also tell us Roka's level and both rune tiers.",
    optional: false,
  },
  {
    name: "Hunter Guild pairs - post-patch verification",
    question: "Does Hunter remain the best Guild Raid rune after its Immortal bonus dropped from +12% to +11% while several competing damage runes improved?",
    pairs: "Current Hunter BiS pair vs the strongest equivalent pair with Hunter replaced by Strength, Magic, Amplification, or Focus as appropriate",
    steps: "Choose one affected Immortal and use the same Guild boss, team, position, level, and rune tiers. Play the current Hunter pair 3 times and the best non-Hunter comparison 3 times. Affected: Dr. Pulse, I Am Meow, Blob Squad, Dark Lord Dragon, Reaper Dian, Ace Bat Man: Pitcher, Colony Tar, Sage Kun, Genie Wiz Zap, Azure Dragon Taoist, Awakened Hailey, Captain Roka, Boss Birdraw, Savior Ray, and Knight Lancelot.",
    send: "Send the final Guild boss-damage screen for all 6 runs. Include the Immortal, boss and boss level, exact two pairs, Immortal level, and every rune tier. Separate results are welcome for each affected Immortal.",
    optional: false,
  },
  {
    name: "Chrono Ato - Scatter Shot comparison",
    question: "Does Scatter Shot's improved -10% damage penalty make it better than Imperfect Spell for Chrono Ato's team output?",
    pairs: "Mastery + Imperfect Spell vs Mastery + Scatter Shot",
    steps: "Test one mode at a time in PvE or Guild. Keep the map, team, formation, Chrono level, and rune tiers identical, then play each pair 3 times. Do not reposition units between the two setups.",
    send: "Send the final team damage/result screen for all 6 runs plus one board screenshot showing the formation. Include the mode, Chrono level, and all three rune tiers.",
    optional: false,
  },
  {
    name: "Awakened Hailey - optional Onslaught check",
    question: "Can Onslaught win below level 23 with very strong Mana and attack-speed support?",
    pairs: "Onslaught + Magic vs Mastery + Magic",
    steps: "Use Hailey below level 23. Keep the same map and team, then play each pair 3 times.",
    send: "At the final wave, take a screenshot of the final damage/result screen for all 6 runs. Include Hailey's exact level. Do not test this at level 23 or higher.",
    optional: true,
  },
  {
    name: "Reaper Dian - optional Guild revive check",
    question: "Can Undying Oath's revive produce more Guild boss damage?",
    pairs: "Hunter + Time Reversal vs Hunter + Undying Oath",
    steps: "Use the same Guild boss and team. Play each pair 5 times because the revive is random.",
    send: "At the end of every run, take a screenshot of the final Guild boss-damage result. Mark which Undying Oath runs revived Dian.",
    optional: true,
  },
  {
    name: "Primeval Bomba - optional Immobility check",
    question: "Is Immobility worth using when Bomba can stay completely still and safe?",
    pairs: "Iron Body + Strength vs Iron Body + Immobility",
    steps: "Use the same safe fixed position in PvP or Guild and play each pair 3 times.",
    send: "At the final wave, take a screenshot of the final damage/result screen for all 6 runs. Mention if Bomba moved or died in any run.",
    optional: true,
  },
  {
    name: "Primeval Bomba - optional rune-pair check",
    question: "Can Haste + Chain outperform Iron Body + Strength?",
    pairs: "Iron Body + Strength vs Haste + Chain",
    steps: "Use the same map, team, and position, then play each pair 3 times.",
    send: "At the final wave, take a screenshot of the final damage/result screen for all 6 runs. Include Bomba's level and all four rune tiers.",
    optional: true,
  },
];

function ValidationGuide() {
  const [open, setOpen] = useState(false);

  return (
    <details className="meta-research-guide" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <FlaskConical />
        <span className="guide-summary-copy"><strong>v2.0.9 research</strong><small>Three required tests; four optional special-rune checks</small></span>
        <span className="guide-cta"><strong>Help improve v2.0.9</strong><ChevronRight /></span>
        <span className="guide-toggle-action"><span className="guide-toggle-open">Collapse guide</span><span className="guide-toggle-closed">Open testing guide</span><ChevronDown /></span>
      </summary>
      <div className="meta-research-content">
        <header>
          <div><span>Latest dataset</span><h2>Help us validate v2.0.9</h2></div>
          <div className="meta-research-header-actions"><a href="https://ld.fluz-tools.com/runes">https://ld.fluz-tools.com/runes</a></div>
        </header>
        <p>We reviewed every Immortal and locked 83 of 84 mode pairs. Captain Roka's second PvP rune remains open, and two post-patch comparisons now require community data. The other four tests are optional checks for unusual special-rune setups.</p>
        <section className="validation-protocol">
          <h3>Simple testing rules</h3>
          <ul>
            <li>Change only the two runes. Keep the team, position, level, map, and rune tiers the same.</li>
            <li>Play each setup 3 times unless the test says 5.</li>
            <li>At the final wave, screenshot the final damage/result screen. Send it with the Immortal level and rune tiers to FLUZ.</li>
          </ul>
        </section>
        <ol className="validation-test-list">
          {validationTests.map((test) => <li key={test.name} className={test.optional ? "optional-test" : "required-test"}><h3>{test.name}<span>{test.optional ? "Optional" : "Required"}</span></h3><p><strong>Question:</strong> {test.question}</p><p><strong>Compare:</strong> {test.pairs}</p><p><strong>Do:</strong> {test.steps}</p><p><strong>Send:</strong> {test.send}</p></li>)}
        </ol>
        <div className="validation-contact"><MessageCircle /><p><strong>Have useful data or results?</strong> Please DM <b>FLUZ</b> in the Lucky Defense community Discord.</p></div>
        <button type="button" className="guide-collapse-bottom" onClick={() => setOpen(false)}><ChevronUp />Collapse testing guide</button>
      </div>
    </details>
  );
}

function readReferenceState() {
  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("mode") as GameMode | null;
  const immortalId = params.get("immortal") ?? "";
  return {
    mode: modes.some((item) => item.id === requestedMode) ? requestedMode! : "pve" as GameMode,
    metaVersion: DEFAULT_META_VERSION,
    query: (params.get("q") ?? "").slice(0, 80),
    immortalFilter: DATA.immortals.some((immortal) => immortal.id === immortalId) ? immortalId : "",
  };
}

export function RunesReference() {
  const initialState = useMemo(readReferenceState, []);
  const [mode, setMode] = useState<GameMode>(initialState.mode);
  const [metaVersion, setMetaVersion] = useState<MetaVersion>(initialState.metaVersion);
  const [query, setQuery] = useState(initialState.query);
  const [immortalFilter, setImmortalFilter] = useState(initialState.immortalFilter);
  const [hoveredImmortal, setHoveredImmortal] = useState("");
  const [mobileZoom, setMobileZoom] = useState(() => {
    const saved = typeof window === "undefined" ? NaN : Number(window.localStorage.getItem("runes-table-zoom"));
    return Number.isFinite(saved) && saved >= MIN_TABLE_ZOOM && saved <= MAX_TABLE_ZOOM ? saved : 100;
  });
  const [showMobileDetails, setShowMobileDetails] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem("runes-table-details") === "1",
  );
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const ratings = ratingsFor(metaVersion);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const horizontalScrollbarRef = useRef<HTMLDivElement>(null);
  const groupedImmortals = useMemo(() => roles.map((role) => ({
    ...role,
    immortals: DATA.immortals.filter((immortal) => immortal.role === role.id),
  })).filter((group) => group.immortals.length > 0), []);
  const orderedImmortals = groupedImmortals.flatMap((group) => group.immortals);
  const filteredRunes = DATA.runes.filter((rune) => `${rune.name} ${rune.notes} ${metaVersion === LATEST_META_VERSION ? specialRemarks[rune.id] ?? "" : ""} ${rune.tierLabel}`.toLowerCase().includes(query.toLowerCase()));
  const highlightedPair = immortalFilter ? bisPairFor(metaVersion, immortalFilter, mode) : undefined;
  const highlightedGuide = immortalFilter ? bisGuideFor(metaVersion, immortalFilter, mode) : undefined;
  const highlightedPairNames = highlightedPair?.runes.map(runeName).join(" + ");
  const conditionalPairs = immortalFilter ? conditionalPairsFor(metaVersion, immortalFilter, mode) : [];
  const setFocusedImmortal = (immortalId: string) => setImmortalFilter(immortalId);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (mode !== "pve") url.searchParams.set("mode", mode);
    else url.searchParams.delete("mode");
    url.searchParams.delete("version");
    if (immortalFilter) url.searchParams.set("immortal", immortalFilter);
    else url.searchParams.delete("immortal");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [immortalFilter, metaVersion, mode, query]);

  useEffect(() => {
    const restoreFromHistory = () => {
      const next = readReferenceState();
      setMode(next.mode);
      setMetaVersion(next.metaVersion);
      setQuery(next.query);
      setImmortalFilter(next.immortalFilter);
    };
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  useEffect(() => {
    if (!immortalFilter || !tableWrapRef.current) return;
    const target = tableWrapRef.current.querySelector<HTMLElement>(`[data-immortal-id="${immortalFilter}"]`);
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      const tableWrap = tableWrapRef.current;
      if (!tableWrap) return;
      tableWrap.scrollTo({
        left: Math.max(0, target.offsetLeft - (tableWrap.clientWidth - target.offsetWidth) / 2),
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [immortalFilter]);

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    if (!tableWrap) return;

    const header = tableWrap.querySelector<HTMLTableCellElement>(`[data-immortal-id="${hoveredImmortal}"]`);
    if (!header) return;
    const columnIndex = header.cellIndex + 4;
    const cells = Array.from(tableWrap.querySelectorAll<HTMLTableRowElement>("tbody tr")).map((row) => row.cells[columnIndex]);
    cells.forEach((cell) => cell?.classList.add("hovered-immortal"));

    return () => cells.forEach((cell) => cell?.classList.remove("hovered-immortal"));
  }, [hoveredImmortal]);

  useEffect(() => {
    window.localStorage.setItem("runes-table-zoom", String(mobileZoom));
  }, [mobileZoom]);

  useEffect(() => {
    window.localStorage.setItem("runes-table-details", showMobileDetails ? "1" : "0");
  }, [showMobileDetails]);

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    const table = tableWrap?.querySelector("table");
    if (!tableWrap || !table) return;

    const updateWidth = () => {
      setTableScrollWidth(tableWrap.scrollWidth);
      setHasHorizontalOverflow(tableWrap.scrollWidth > tableWrap.clientWidth + 1);
    };
    const frame = window.requestAnimationFrame(updateWidth);
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(tableWrap);
    resizeObserver.observe(table);
    window.addEventListener("resize", updateWidth);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [filteredRunes.length, mobileZoom, showMobileDetails]);

  const changeMobileZoom = (amount: number) => {
    setMobileZoom((current) => Math.min(MAX_TABLE_ZOOM, Math.max(MIN_TABLE_ZOOM, current + amount)));
  };

  return (
    <main className="runes-reference">
      <ValidationGuide />
      <section className="reference-toolbar" aria-labelledby="runes-title">
        <div className="reference-title">
          <img src="/assets/ui/rune-smith.png" alt="" />
          <div><h1 id="runes-title">Rune data</h1><p>{DATA.runes.length} runes compared across {DATA.immortals.length} Immortals</p></div>
        </div>
        <label className="search-field reference-search"><Search /><input value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)} placeholder="Search runes or remarks" /></label>
        <label className="reference-immortal-filter"><span>Highlight BiS for:</span><select value={immortalFilter} onChange={(event) => setFocusedImmortal(event.target.value)}><option value="">No Immortal</option>{DATA.immortals.map((immortal) => <option key={immortal.id} value={immortal.id}>{immortal.name}</option>)}</select></label>
        <div className="meta-version-status">
          <label className="meta-version-select">
            <span className="visually-hidden">Rune meta version</span>
            <select value={metaVersion} onChange={(event) => setMetaVersion(event.target.value as MetaVersion)}>
              {META_VERSIONS.map((version) => <option key={version} value={version}>{metaVersionLabel(version)}</option>)}
            </select>
          </label>
          <span className={`meta-version-indicator ${metaVersion === LATEST_META_VERSION ? "current" : "legacy"}`} role="status">Current: {metaVersionLabel(metaVersion)}</span>
        </div>
        <nav className="reference-mode" aria-label="Rating mode">
          {modes.map((item) => <button type="button" key={item.id} className={mode === item.id ? "active" : ""} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>)}
        </nav>
      </section>

      <section className="reference-legend" aria-label="Recommendation score legend">
        <strong>Meta v{metaVersion} recommendation score</strong>
        {scoreLabels.slice(0, metaVersion === LATEST_META_VERSION ? 7 : 6).map((label, score) => <span key={label} className={`score-chip score-${score}`}><b>{label}</b><small>{score}/{metaVersion === LATEST_META_VERSION ? 6 : 5}</small></span>)}
        {metaVersion === LATEST_META_VERSION && <span className="score-chip score-special"><b>Special</b><small>X/6</small></span>}
        {metaVersion === LATEST_META_VERSION ? <span className="legend-note experimental-legend"><i className="confidence-definitive" />Definitive <i className="confidence-medium" />Needs confirmation <i className="confidence-low" />Provisional</span> : <span className="legend-note">New Guardian ratings marked provisional</span>}
      </section>

      {highlightedPair && <details className={`reference-bis-guide confidence-${highlightedPair.confidence}`}>
        <summary className="reference-bis-summary" aria-live="polite">
          <span className="reference-bis-pair"><strong>Fixed v2.0.9 BiS pair:</strong><b>{highlightedPairNames}</b></span>
          {highlightedPair.note && <em>{highlightedPair.note}</em>}
          {highlightedGuide && <span className="reference-bis-toggle">Why this pair + fallbacks<ChevronDown /></span>}
        </summary>
        {highlightedGuide && <div className="reference-bis-details">
          <section>
            <h3>Why this pair is BiS</h3>
            <p>{highlightedGuide.why}</p>
          </section>
          <section>
            <h3>Best used when</h3>
            <p>{highlightedGuide.bestFor}</p>
            {highlightedGuide.caution && <aside><strong>Watch for:</strong> {highlightedGuide.caution}</aside>}
          </section>
          <section className="reference-bis-fallbacks">
            <h3>Good fallbacks</h3>
            <ul>
              {highlightedGuide.fallbacks.map((item) => <li key={item.runes.join(":")}><strong>{item.runes.map(runeName).join(" + ")}</strong><span>{item.note}</span></li>)}
            </ul>
          </section>
        </div>}
      </details>}
      {conditionalPairs.map((pair) => <div key={pair.runes.join(":")} className="reference-bis-summary conditional-pair" aria-live="polite"><strong>{pair.label}:</strong><span>{pair.runes.map(runeName).join(" + ")}</span><em>{pair.note}</em></div>)}

      <div className="mobile-table-zoom" aria-label="Spreadsheet zoom controls">
        <strong>Zoom</strong>
        <button type="button" onClick={() => changeMobileZoom(-TABLE_ZOOM_STEP)} disabled={mobileZoom === MIN_TABLE_ZOOM} title="Zoom out" aria-label="Zoom spreadsheet out"><Minus /></button>
        <input type="range" min={MIN_TABLE_ZOOM} max={MAX_TABLE_ZOOM} step={5} value={mobileZoom} onChange={(event) => setMobileZoom(Number(event.target.value))} aria-label="Spreadsheet zoom percentage" />
        <output>{mobileZoom}%</output>
        <button type="button" onClick={() => changeMobileZoom(TABLE_ZOOM_STEP)} disabled={mobileZoom === MAX_TABLE_ZOOM} title="Zoom in" aria-label="Zoom spreadsheet in"><Plus /></button>
        <button type="button" onClick={() => setMobileZoom(100)} disabled={mobileZoom === 100} title="Reset to 100%" aria-label="Reset spreadsheet zoom"><RotateCcw /></button>
        <label className="mobile-table-details"><input type="checkbox" checked={showMobileDetails} onChange={(event) => setShowMobileDetails(event.target.checked)} /><span>Details</span></label>
      </div>

      <div ref={horizontalScrollbarRef} className={`desktop-table-scrollbar ${hasHorizontalOverflow ? "" : "not-needed"}`} aria-label="Scroll spreadsheet horizontally" onScroll={(event) => {
        const tableWrap = tableWrapRef.current;
        if (tableWrap && Math.abs(tableWrap.scrollLeft - event.currentTarget.scrollLeft) > 1) tableWrap.scrollLeft = event.currentTarget.scrollLeft;
      }}>
        <div style={{ width: tableScrollWidth }} />
      </div>

      <div ref={tableWrapRef} className="runes-table-wrap" tabIndex={0} aria-label="Rune recommendation table. Scroll horizontally to compare Immortals." onScroll={(event) => {
        const scrollbar = horizontalScrollbarRef.current;
        if (scrollbar && Math.abs(scrollbar.scrollLeft - event.currentTarget.scrollLeft) > 1) scrollbar.scrollLeft = event.currentTarget.scrollLeft;
      }}>
        <table className={`runes-data-table ${showMobileDetails ? "show-mobile-details" : ""}`} style={{ "--runes-mobile-zoom": mobileZoom / 100 } as CSSProperties} onMouseLeave={() => setHoveredImmortal("")}>
          <thead>
            <tr>
              <th rowSpan={2} className="rune-name-column">Rune</th>
              <th rowSpan={2} className="description-column bonus-column">Rune bonus</th>
              <th rowSpan={2} className="rank-column">Tier</th>
              <th rowSpan={2} className="remarks-column">Special remarks</th>
              {groupedImmortals.map((group) => <th key={group.id} colSpan={group.immortals.length} className={`role-group role-${group.id}`}>{group.label}</th>)}
            </tr>
            <tr>
              {orderedImmortals.map((immortal) => (
                <th key={immortal.id} data-immortal-id={immortal.id} onMouseEnter={() => setHoveredImmortal(immortal.id)} className={`immortal-column ${immortal.id === immortalFilter ? "highlighted-immortal" : ""} ${immortal.id === hoveredImmortal ? "hovered-immortal" : ""}`} title={immortal.name}>
                  <button type="button" className="immortal-filter-button" onClick={() => setFocusedImmortal(immortal.id)} aria-pressed={immortal.id === immortalFilter} aria-label={`Highlight BiS for ${immortal.name}`}>
                    <img src={immortal.image} alt="" />
                    <span>{immortal.name}</span>
                    {immortal.provisional && <i title="Provisional rating">P</i>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody onMouseOver={(event) => {
            const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>(".rating-cell");
            const immortal = cell ? orderedImmortals[cell.cellIndex - 4] : undefined;
            if (immortal) setHoveredImmortal(immortal.id);
          }} onMouseLeave={() => setHoveredImmortal("")}>
            {filteredRunes.map((rune) => (
              <tr key={rune.id}>
                <th scope="row" className="rune-name-column"><img src={rune.image} alt="" /><span>{rune.name.replace("Rune of ", "")}</span></th>
                <td className="description-column bonus-column">
                  <div className="rune-bonuses">
                    <span><b className="bonus-legendary">Legendary</b>{rune.descriptions.legendary}</span>
                    <span><b className="bonus-mythic">Mythic</b>{rune.descriptions.mythic}</span>
                    <span><b className="bonus-immortal">Immortal</b>{rune.descriptions.immortal}</span>
                  </div>
                </td>
                <td className="rank-column"><b>{rune.tierLabel}</b></td>
                <td className={`remarks-column ${metaVersion === LATEST_META_VERSION && specialRemarks[rune.id] ? "special-remark" : ""}`}>{metaVersion === LATEST_META_VERSION && specialRemarks[rune.id] ? <><strong>{specialRemarks[rune.id]}</strong>{rune.notes && <span>{rune.notes}</span>}</> : rune.notes || "-"}</td>
                {orderedImmortals.map((immortal) => {
                  const rating = ratings[rune.id]?.[immortal.id];
                  const score = rating?.[mode];
                  const specialRune = specialRuneFor(metaVersion, immortal.id, mode);
                  const isSpecialRune = specialRune?.runeId === rune.id;
                  const label = isSpecialRune ? specialRune.label : score == null ? "-" : scoreLabels[score] ?? String(score);
                  const pair = bisPairFor(metaVersion, immortal.id, mode);
                  const pairConfidence = pair?.runes.includes(rune.id) ? pair.confidence : undefined;
                  const pairStatus = pairConfidence === "definitive" ? "definitive v2.0.9 BiS pair" : pairConfidence ? `${pairConfidence} confidence v2.0.9 BiS pair` : "";
                  const maximum = metaVersion === LATEST_META_VERSION ? 6 : 5;
                  return (
                    <td key={immortal.id} className={`rating-cell ${score == null ? "score-null" : `score-${score}`} ${metaVersion === "1.0" && rating?.confidence === "provisional" ? "provisional" : ""} ${pairConfidence ? `experimental-${pairConfidence}` : ""} ${isSpecialRune ? "special-rating-cell" : ""} ${immortal.id === immortalFilter ? "highlighted-immortal" : ""}`} title={`${rune.name} on ${immortal.name}: ${score == null ? "not rated" : `${score}/${maximum} (${label})${pairStatus ? ` · ${pairStatus}${pair?.note ? ` · ${pair.note}` : ""}` : ""}`}`}>
                      <span className={isSpecialRune ? "special-conditional" : undefined} title={isSpecialRune ? specialRune.note : undefined}>{label}</span>
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

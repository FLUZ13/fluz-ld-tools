import { DATA, bisPairFor, ratingsFor, type GameMode } from "../model";

const MODES: Array<{ id: GameMode; label: string }> = [
  { id: "pve", label: "PvE" },
  { id: "pvp", label: "PvP" },
  { id: "guild", label: "Guild" },
];

const runeName = (runeId: string) => DATA.runes.find((rune) => rune.id === runeId)?.name.replace("Rune of ", "") ?? runeId;

export function buildMetaReviewMarkdown() {
  const v14 = ratingsFor("1.4");
  const decisions = DATA.immortals.flatMap((immortal) => MODES.map((mode) => ({
    immortal,
    mode,
    pair: bisPairFor("1.5", immortal.id, mode.id)!,
  })));
  const definitive = decisions.filter((decision) => decision.pair.confidence === "definitive");
  const pending = decisions.filter((decision) => decision.pair.confidence !== "definitive");
  const mediumCount = pending.filter((decision) => decision.pair.confidence === "medium").length;
  const lowCount = pending.filter((decision) => decision.pair.confidence === "low").length;
  const lines = [
    "# Lucky Defense rune META review: v1.4 -> v1.5 Experimental",
    "",
    `- Definitive decisions implemented: **${definitive.length} of ${decisions.length}**`,
    `- Decisions still requiring confirmation: **${pending.length}**`,
    `- Targeted validation (medium): **${mediumCount}**`,
    `- Provisional research (low): **${lowCount}**`,
    "",
    "v1.4 Best pool means every rune rated 5/5 in the current default dataset. v1.5 fixed BiS means the exact two runes rated 6/6.",
    "",
    `## Confirmation checklist (${pending.length} decisions)`,
    "",
  ];

  for (const immortal of DATA.immortals) {
    const immortalDecisions = pending.filter((decision) => decision.immortal.id === immortal.id);
    if (immortalDecisions.length === 0) continue;
    lines.push(`### ${immortal.name}`, "");

    for (const decision of immortalDecisions) {
      const previousIds = DATA.runes
        .filter((rune) => v14[rune.id]?.[immortal.id]?.[decision.mode.id] === 5)
        .map((rune) => rune.id);
      const retained = decision.pair.runes.filter((runeId) => previousIds.includes(runeId));
      const promoted = decision.pair.runes.filter((runeId) => !previousIds.includes(runeId));
      const removed = previousIds.filter((runeId) => !decision.pair.runes.includes(runeId));
      const change = previousIds.length === 0
        ? "Creates the first fixed top-tier pair."
        : retained.length > 0
          ? `Retains ${retained.map(runeName).join(" + ")}; promotes ${promoted.map(runeName).join(" + ")}.`
          : "Replaces the v1.4 Best choices with a newly promoted fixed pair.";

      lines.push(
        `- [ ] **${decision.mode.label}: ${decision.pair.runes.map(runeName).join(" + ")}**`,
        `  - v1.4 Best pool: ${previousIds.length > 0 ? previousIds.map(runeName).join(", ") : "No rune rated 5/5"}`,
        `  - Change: ${change}`,
        `  - Status: **${decision.pair.confidence === "medium" ? "needs targeted validation" : "provisional research"}**`,
      );
      if (removed.length > 0) lines.push(`  - Other v1.4 Best choices not selected: ${removed.map(runeName).join(", ")}`);
      if (decision.pair.note) lines.push(`  - Condition: ${decision.pair.note}`);
      lines.push("");
    }
  }

  lines.push(`## Definitive decisions (${definitive.length} decisions)`, "");
  for (const immortal of DATA.immortals) {
    const immortalDecisions = definitive.filter((decision) => decision.immortal.id === immortal.id);
    if (immortalDecisions.length === 0) continue;
    lines.push(`### ${immortal.name}`);
    for (const decision of immortalDecisions) {
      lines.push(`- **${decision.mode.label}: ${decision.pair.runes.map(runeName).join(" + ")}**${decision.pair.note ? ` - ${decision.pair.note}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Group decision", "", `- [ ] Approve the ${pending.length} remaining decisions`, "- [ ] Revise the marked decisions before making v1.5 default", "", "Review notes:", "");
  return lines.join("\n");
}

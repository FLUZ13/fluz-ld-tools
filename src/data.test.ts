import { describe, expect, it } from "vitest";
import { VERIFIED_RUNE_ICONS } from "./data/rune-icons";
import { DATA, createDefaultState, migrateBuilderState, ratingsFor } from "./model";

describe("game data snapshot", () => {
  it("contains the complete requested roster and rune set", () => {
    expect(DATA.runes).toHaveLength(53);
    expect(DATA.immortals).toHaveLength(27);
    expect(new Set(DATA.runes.map((rune) => rune.id)).size).toBe(53);
    expect(new Set(DATA.immortals.map((immortal) => immortal.id)).size).toBe(27);
  });

  it("uses the 38 plus 15 tier availability split", () => {
    expect(DATA.runes.filter((rune) => rune.availableTiers.length === 7)).toHaveLength(38);
    expect(DATA.runes.filter((rune) => rune.availableTiers.join(",") === "5,6,7")).toHaveLength(15);
  });

  it("uses the in-game verified icon for every audited rune", () => {
    for (const [runeId, icon] of Object.entries(VERIFIED_RUNE_ICONS)) {
      const rune = DATA.runes.find((candidate) => candidate.id === runeId);
      expect(rune).toMatchObject(icon);
    }
    expect(new Set(DATA.runes.map((rune) => rune.image)).size).toBe(DATA.runes.length);
    expect(DATA.runes.find((rune) => rune.id === "execution")?.image).toBe("/assets/runes/1035.png");
    expect(DATA.runes.find((rune) => rune.id === "time-reversal")?.image).toBe("/assets/runes/1045.png");
  });

  it("uses the verified Immortal portraits rather than their base-form artwork", () => {
    expect(DATA.immortals.find((immortal) => immortal.id === "top-vayne")?.image).toBe("/assets/immortals/15011.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "great-kitty-mage")?.image).toBe("/assets/immortals/1400601.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "colony-tar")?.image).toBe("/assets/immortals/1501401.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "evergreen-verdee")?.image).toBe("/assets/immortals/1501901.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "super-graviton")?.image).toBe("/assets/immortals/13004-verified.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "ace-bat-man")?.image).toBe("/assets/immortals/15010-verified.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "ace-bat-man-batter")?.image).toBe("/assets/immortals/15010-verified.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "sage-kun")?.image).toBe("/assets/immortals/15018.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "azure-dragon-taoist")?.image).toBe("/assets/immortals/15016.png");
  });

  it("has valid three-mode ratings for every rune and Immortal in both meta versions", () => {
    for (const metaVersion of ["1.0", "1.1"] as const) {
      const ratings = ratingsFor(metaVersion);
      for (const rune of DATA.runes) {
        for (const immortal of DATA.immortals) {
          const rating = ratings[rune.id][immortal.id];
          expect(rating).toBeDefined();
          for (const mode of ["pve", "pvp", "guild"] as const) {
            expect(rating[mode] == null || (rating[mode]! >= 0 && rating[mode]! <= 5)).toBe(true);
          }
        }
      }
    }
  });

  it("keeps the prior ratings in v1.0 and applies the reviewed v1.1 changes", () => {
    expect(ratingsFor("1.0").battle["captain-roka"].pve).toBe(4);
    expect(ratingsFor("1.1").battle["captain-roka"].pve).toBe(5);
    expect(ratingsFor("1.0").mana["i-am-meow"].pve).toBe(2);
    expect(ratingsFor("1.1").mana["i-am-meow"].pve).toBe(5);
  });

  it("keeps legacy all-selected rosters complete after adding a form", () => {
    const legacy = createDefaultState();
    legacy.selectedImmortalIds = legacy.selectedImmortalIds.filter((id) => id !== "ace-bat-man-batter");
    expect(migrateBuilderState(legacy).selectedImmortalIds).toContain("ace-bat-man-batter");

    legacy.selectedImmortalIds = legacy.selectedImmortalIds.filter((id) => id !== "ghost-ninja");
    expect(migrateBuilderState(legacy).selectedImmortalIds).not.toContain("ace-bat-man-batter");
    expect(migrateBuilderState({ ...legacy, metaVersion: undefined as never }).metaVersion).toBe("1.0");
  });
});

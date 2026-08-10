import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import gameData from "./data/game-data.json";
import { VERIFIED_RUNE_ICONS } from "./data/rune-icons";
import { DATA, META_VERSIONS, bisGuideFor, bisPairFor, conditionalPairsFor, createDefaultState, migrateBuilderState, ratingsFor, resetMetaVersionForPageLoad, specialRuneFor } from "./model";
import { buildMetaReviewMarkdown } from "./lib/meta-review-export";

describe("game data snapshot", () => {
  it("contains the complete requested roster and rune set", () => {
    expect(DATA.runes).toHaveLength(53);
    expect(DATA.immortals).toHaveLength(28);
    expect(new Set(DATA.runes.map((rune) => rune.id)).size).toBe(53);
    expect(new Set(DATA.immortals.map((immortal) => immortal.id)).size).toBe(28);
  });

  it("uses the 38 plus 15 tier availability split", () => {
    expect(DATA.runes.filter((rune) => rune.availableTiers.length === 7)).toHaveLength(38);
    expect(DATA.runes.filter((rune) => rune.availableTiers.join(",") === "5,6,7")).toHaveLength(15);
  });

  it("uses the in-game verified icon for every audited rune", () => {
    const canonicalAssets = [
      "strength:1001", "magic:1002", "power:1003", "speed:1004", "mana:1005",
      "recursion:1006", "precision:1007", "slayer:1008", "conqueror:1009", "sprint:1010",
      "smite:1011", "amplification:1012", "mastery:1013", "bind:1014", "hunter:1015",
      "penetration:1016", "battle:1017", "focus:1018", "wave:1019", "immortal-resonance:1020",
      "haste:1022", "absorption:1023", "impact:1026", "chain:1029", "mobility:1031",
      "rupture:1032", "flurry:1033", "execution:1035", "fortune:1036", "rampant-growth:1038",
      "barrier:1041", "legion:1042", "accumulation:1043", "focused-aim:1044", "time-reversal:1045",
      "sealing:1048", "warcry:1049", "gold-furnace:1050", "scatter-shot:1051", "affinity:1052",
      "immobility:1053", "arcane-flow:1054", "judgement:1055", "lightning:1058", "mana-harvest:1059",
      "imperfect-spell:1060", "onslaught:1061", "battle-legacy:1062", "bloodlust:1063", "undying-oath:1064",
      "iron-body:1065", "arcane-power:1066", "inherited-power:1067",
    ];
    expect(gameData.runes.map((rune) => `${rune.id}:${rune.assetId}`)).toEqual(canonicalAssets);
    expect(gameData.runes.map((rune) => rune.image)).toEqual(canonicalAssets.map((entry) => `/assets/runes/${entry.split(":")[1]}.png`));
    expect(DATA.runes.map((rune) => `${rune.id}:${rune.assetId}`)).toEqual(canonicalAssets);
    expect(Object.keys(VERIFIED_RUNE_ICONS)).toHaveLength(DATA.runes.length);
    for (const [runeId, icon] of Object.entries(VERIFIED_RUNE_ICONS)) {
      const rune = DATA.runes.find((candidate) => candidate.id === runeId);
      expect(rune).toMatchObject(icon);
    }
    expect(new Set(DATA.runes.map((rune) => rune.image)).size).toBe(DATA.runes.length);
    expect(DATA.runes.find((rune) => rune.id === "execution")?.image).toBe("/assets/runes/1035.png");
    expect(DATA.runes.find((rune) => rune.id === "time-reversal")?.image).toBe("/assets/runes/1045.png");
    expect(DATA.runes.find((rune) => rune.id === "haste")?.image).toBe("/assets/runes/1022.png");
    expect(DATA.runes.find((rune) => rune.id === "absorption")?.image).toBe("/assets/runes/1023.png");
    expect(DATA.runes.find((rune) => rune.id === "impact")?.image).toBe("/assets/runes/1026.png");
    expect(DATA.runes.find((rune) => rune.id === "chain")?.image).toBe("/assets/runes/1029.png");
    expect(DATA.runes.find((rune) => rune.id === "mobility")?.image).toBe("/assets/runes/1031.png");
    expect(DATA.runes.find((rune) => rune.id === "arcane-flow")?.image).toBe("/assets/runes/1054.png");
    expect(DATA.runes.find((rune) => rune.id === "inherited-power")?.image).toBe("/assets/runes/1067.png");
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
    expect(DATA.immortals.find((immortal) => immortal.id === "knight-lancelot")?.image).toBe("/assets/immortals/15003.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "knight-lancelot")?.boardImage).toBe("/assets/board/guardians/15003.png");
    expect(DATA.immortals.find((immortal) => immortal.id === "i-am-meow")?.role).toBe("magic");
  });

  it("has valid three-mode ratings for every rune and Immortal in every meta version", () => {
    for (const metaVersion of META_VERSIONS) {
      const ratings = ratingsFor(metaVersion);
      for (const rune of DATA.runes) {
        for (const immortal of DATA.immortals) {
          const rating = ratings[rune.id][immortal.id];
          expect(rating).toBeDefined();
          for (const mode of ["pve", "pvp", "guild"] as const) {
            const maximum = metaVersion === "2.0.9" ? 6 : 5;
            expect(rating[mode] == null || (rating[mode]! >= 0 && rating[mode]! <= maximum)).toBe(true);
          }
        }
      }
    }
  });

  it("uses the August 8 Immortal-grade rune descriptions", () => {
    const expected = {
      strength: "ATK +6.5%, Physical Damage +13%",
      magic: "ATK +6.5%, Magic Damage +13%",
      power: "ATK +6.5%, ATK +10%",
      speed: "ATK +6.5%, ATK SPD +7%",
      mana: "ATK +6.5%, MP Regen +18%",
      recursion: "ATK +6.5%, Ultimate Cooldown -9%",
      precision: "ATK +6.5%, CRIT Rate +5%",
      slayer: "ATK +6.5%, CRIT DMG +25%",
      conqueror: "ATK +6.5%, Damage to Stunned Enemies +9%",
      sprint: "ATK +6.5%, MOV SPD +21%",
      smite: "ATK +6.5%, Base ATK +21%",
      amplification: "ATK +6.5%, Skill Damage +13%",
      hunter: "ATK +6.5%, Boss Damage +11%",
      penetration: "ATK +6.5%, DEF -17",
      battle: "ATK +6.5%, Ultimate Damage +13%",
      focus: "ATK +6.5%, Single-Target Damage +13%",
      wave: "ATK +6.5%, Area Damage +9%",
      "immortal-resonance": "ATK +6.5%, Damage +1.3% for each Immortal Type on my field",
      impact: "ATK +6.5%, Basic ATK: 2.7% chance to Stun for 0.8s",
      mobility: "ATK +6.5%, After Moving: ATK SPD +15% for 2s",
      rupture: "ATK +5%, Skill Hit: 40% chance to deal 7% bonus damage on hit",
      execution: "ATK +6.5%, 2% chance to Execute enemies below 4% HP",
      "rampant-growth": "ATK +6.5%, During Wave: ATK +0.7% every 5s",
      "focused-aim": "ATK +6.5%, Range -30%, DMG +17%",
      sealing: "ATK +6.5%, Attack disabled for 17 waves, ATK +17%",
      "gold-furnace": "ATK +6.5%, On Immortal Summon, Physical DMG +0.17% for every 500 Gold spent (up to 20%)",
      "scatter-shot": "ATK +6.5%, Range +20%, DMG -10%",
      immobility: "ATK +6.5%, Move Disabled, ATK +17%",
      "imperfect-spell": "ATK +6.5%, DMG -16%, Skill Activation Chance +1.6%",
      "battle-legacy": "ATK +6.5%, Each time an Immortal Guardian dies, permanently gain ATK SPD +1.7% and ATK +3%",
      "iron-body": "ATK +6.5%, Physical DMG +17%, Ultimate DMG -50%",
      "arcane-power": "ATK +6.5%, Magic DMG +17%, Skill Activation Chance -3%",
    } as const;

    for (const [runeId, description] of Object.entries(expected)) {
      expect(DATA.runes.find((rune) => rune.id === runeId)?.descriptions.immortal).toBe(description);
    }
    expect(DATA.datasetVersion).toBe("2026.08.08-meta.1.5");
  });

  it("downgrades Immobility conservatively in the latest meta", () => {
    const rune = DATA.runes.find((candidate) => candidate.id === "immobility");
    expect(rune?.tierLabel).toBe("C-D");
    expect(ratingsFor("2.0.9").immobility["ghost-ninja"]).toMatchObject({ pve: 2, pvp: 1, guild: 2 });
    expect(ratingsFor("2.0.9").immobility["top-vayne"]).toMatchObject({ pve: 0, pvp: 0, guild: 0 });
    expect(ratingsFor("2.0.9").immobility["primeval-bomba"]).toMatchObject({ pve: 0, pvp: 0, guild: 0 });
    expect(ratingsFor("2.0.9").immobility["giga-chad"]).toMatchObject({ pve: 0, pvp: 0, guild: 0 });
    expect(specialRuneFor("2.0.9", "primeval-bomba", "pvp")).toMatchObject({ runeId: "immobility", label: "X/6" });
  });

  it("defines exactly one two-rune BiS pair per Immortal and mode in v1.5", () => {
    const knownRunes = new Set(DATA.runes.map((rune) => rune.id));
    const confidenceCounts = { definitive: 0, medium: 0, low: 0 };
    for (const immortal of DATA.immortals) {
      for (const mode of ["pve", "pvp", "guild"] as const) {
        const pair = bisPairFor("1.5", immortal.id, mode);
        expect(pair).toBeDefined();
        expect(new Set(pair!.runes).size).toBe(2);
        expect(pair!.runes.every((runeId) => knownRunes.has(runeId))).toBe(true);
        const pairScores = pair!.runes.map((runeId) => ratingsFor("1.5")[runeId][immortal.id][mode]);
        const highestRatedRunes = DATA.runes.filter((rune) => ratingsFor("1.5")[rune.id][immortal.id][mode] === 6).map((rune) => rune.id);
        expect(pairScores.every((score) => score === 4.5 || score === 5 || score === 5.5 || score === 6)).toBe(true);
        expect(highestRatedRunes.every((runeId) => pair!.runes.includes(runeId))).toBe(true);
        confidenceCounts[pair!.confidence]++;
      }
    }
    expect(confidenceCounts).toEqual({ definitive: 83, medium: 1, low: 0 });
    expect(bisPairFor("1.5", "primeval-bomba", "pve")?.runes).toEqual(["iron-body", "strength"]);
    expect(conditionalPairsFor("1.5", "primeval-bomba", "pve")).toMatchObject([{ runes: ["chain", "haste"], label: "5.5/6 conditional pair" }]);
    expect(specialRuneFor("1.5", "primeval-bomba", "pvp")).toMatchObject({ runeId: "immobility", label: "X/6" });
    expect(specialRuneFor("1.5", "primeval-bomba", "guild")).toMatchObject({ runeId: "immobility", label: "X/6" });
    expect(bisPairFor("1.5", "super-graviton", "guild")?.runes).toEqual(["bind", "imperfect-spell"]);
    expect(bisPairFor("1.5", "i-am-meow", "pve")?.runes).toEqual(["magic", "mana"]);
    expect(bisPairFor("1.5", "i-am-meow", "pvp")?.runes).toEqual(["magic", "mana"]);
    expect(bisPairFor("1.5", "i-am-meow", "guild")?.runes).toEqual(["hunter", "mana"]);
    expect(ratingsFor("1.5").accumulation["i-am-meow"]).toMatchObject({ pve: 3, pvp: 2, guild: 2 });
    expect(ratingsFor("1.5").mastery["i-am-meow"]).toMatchObject({ pve: 5, pvp: 5, guild: 5 });
    expect(bisPairFor("1.5", "demon-monopoly", "pve")?.runes).toEqual(["mastery", "fortune"]);
    expect(bisPairFor("1.5", "demon-monopoly", "pvp")?.runes).toEqual(["mastery", "imperfect-spell"]);
    expect(bisPairFor("1.5", "grand-mama", "guild")?.runes).toEqual(["barrier", "imperfect-spell"]);
    expect(specialRuneFor("1.5", "grand-mama", "guild")).toMatchObject({ runeId: "execution", label: "X/6" });
    expect(ratingsFor("1.5").mana["great-kitty-mage"]).toMatchObject({ pve: 5, pvp: 5, guild: 5 });
    expect(bisPairFor("1.5", "noisy-penguin-musician", "pve")?.runes).toEqual(["mastery", "scatter-shot"]);
    expect(bisPairFor("1.5", "noisy-penguin-musician", "pvp")?.runes).toEqual(["mastery", "barrier"]);
    expect(ratingsFor("1.5")["imperfect-spell"]["noisy-penguin-musician"]).toMatchObject({ pve: 5, pvp: 5, guild: 5 });
    expect(ratingsFor("1.5")["time-reversal"]["chrono-ato"]).toMatchObject({ pve: 5, pvp: 5, guild: 5 });
    expect(bisPairFor("1.5", "ghost-ninja", "pvp")?.runes).toEqual(["amplification", "slayer"]);
    expect(bisPairFor("1.5", "top-vayne", "guild")?.runes).toEqual(["iron-body", "focused-aim"]);
    expect(bisPairFor("1.5", "colony-tar", "pvp")?.runes).toEqual(["strength", "amplification"]);
    expect(bisPairFor("1.5", "colony-tar", "guild")?.runes).toEqual(["hunter", "amplification"]);
    expect(bisPairFor("1.5", "colony-tar", "pve")?.runes).toEqual(["wave", "strength"]);
    expect(ratingsFor("1.5").amplification["colony-tar"].pve).toBe(5);
    expect(ratingsFor("1.5").bloodlust["colony-tar"].pve).toBe(4);
    expect(ratingsFor("1.5").battle["colony-tar"].guild).toBe(5);
    expect(bisPairFor("1.5", "evergreen-verdee", "guild")?.runes).toEqual(["speed", "amplification"]);
    expect(ratingsFor("1.5").battle["evergreen-verdee"].guild).toBe(5);
    expect(bisPairFor("1.5", "savior-ray", "pve")?.runes).toEqual(["strength", "wave"]);
    expect(bisPairFor("1.5", "savior-ray", "guild")?.runes).toEqual(["hunter", "strength"]);
    expect(ratingsFor("1.5").bloodlust["savior-ray"].pve).toBe(3);
    expect(bisPairFor("1.5", "queen-coldy", "pve")?.runes).toEqual(["mastery", "imperfect-spell"]);
    expect(bisPairFor("1.5", "queen-coldy", "guild")?.runes).toEqual(["mastery", "imperfect-spell"]);
    expect(bisPairFor("1.5", "dark-lord-dragon", "pvp")?.runes).toEqual(["mastery", "magic"]);
    expect(bisPairFor("1.5", "dark-lord-dragon", "guild")?.runes).toEqual(["hunter", "magic"]);
    expect(ratingsFor("1.5")["mana-harvest"]["dark-lord-dragon"].pve).toBe(4.5);
    expect(bisPairFor("1.5", "reaper-frog", "pve")?.runes).toEqual(["mana-harvest", "amplification"]);
    expect(bisPairFor("1.5", "reaper-frog", "pvp")?.runes).toEqual(["amplification", "magic"]);
    expect(bisPairFor("1.5", "reaper-frog", "guild")?.runes).toEqual(["hunter", "time-reversal"]);
    expect(ratingsFor("1.5").amplification["reaper-frog"].guild).toBe(5.5);
    expect(specialRuneFor("1.5", "reaper-frog", "guild")).toMatchObject({ runeId: "undying-oath", label: "X/6" });
    expect(specialRuneFor("1.5", "reaper-frog", "pvp")).toBeUndefined();
    expect(bisPairFor("1.5", "sage-kun", "pve")?.runes).toEqual(["magic", "mastery"]);
    expect(bisPairFor("1.5", "sage-kun", "pvp")?.runes).toEqual(["magic", "mastery"]);
    expect(bisPairFor("1.5", "sage-kun", "guild")?.runes).toEqual(["hunter", "magic"]);
    expect(ratingsFor("1.5").magic["sage-kun"]).toMatchObject({ pve: 5.5, pvp: 5.5, guild: 6 });
    expect(ratingsFor("1.5").mastery["sage-kun"]).toMatchObject({ pve: 5.5, pvp: 5.5 });
    expect(bisPairFor("1.5", "azure-dragon-taoist", "pve")?.runes).toEqual(["magic", "amplification"]);
    expect(bisPairFor("1.5", "azure-dragon-taoist", "pvp")?.runes).toEqual(["magic", "mastery"]);
    expect(bisPairFor("1.5", "azure-dragon-taoist", "guild")?.runes).toEqual(["hunter", "magic"]);
    expect(ratingsFor("1.5").magic["azure-dragon-taoist"].pvp).toBe(5.5);
    expect(ratingsFor("1.5").mastery["azure-dragon-taoist"].pvp).toBe(5.5);
    expect(ratingsFor("1.5").amplification["azure-dragon-taoist"]).toMatchObject({ pvp: 5, guild: 5 });
    expect(bisPairFor("1.5", "genie-wiz-zap", "pve")?.runes).toEqual(["magic", "focus"]);
    expect(bisPairFor("1.5", "genie-wiz-zap", "pvp")?.runes).toEqual(["magic", "focus"]);
    expect(bisPairFor("1.5", "genie-wiz-zap", "guild")?.runes).toEqual(["hunter", "focus"]);
    expect(ratingsFor("1.5").magic["genie-wiz-zap"]).toMatchObject({ pve: 5.5, pvp: 6, guild: 5.5 });
    expect(ratingsFor("1.5").focus["genie-wiz-zap"]).toMatchObject({ pve: 5.5, pvp: 6, guild: 6 });
    expect(ratingsFor("1.5")["focused-aim"]["genie-wiz-zap"]).toMatchObject({ pvp: 5.5, guild: 5.5 });
    expect(bisPairFor("1.5", "awakened-hailey", "pve")?.runes).toEqual(["mastery", "magic"]);
    expect(bisPairFor("1.5", "awakened-hailey", "pvp")?.runes).toEqual(["mastery", "magic"]);
    expect(bisPairFor("1.5", "awakened-hailey", "guild")?.runes).toEqual(["mastery", "hunter"]);
    expect(specialRuneFor("1.5", "awakened-hailey", "pve")).toMatchObject({ runeId: "onslaught", label: "X/6" });
    expect(specialRuneFor("1.5", "awakened-hailey", "pve")?.note).toContain("below-level-23");
    expect(ratingsFor("1.5").amplification["awakened-hailey"]).toMatchObject({ pve: 5.5, pvp: 5.5, guild: 5.5 });
    expect(bisPairFor("1.5", "boss-birdraw", "pve")?.runes).toEqual(["mastery", "magic"]);
    expect(bisPairFor("1.5", "boss-birdraw", "pvp")?.runes).toEqual(["mastery", "magic"]);
    expect(bisPairFor("1.5", "boss-birdraw", "guild")?.runes).toEqual(["mastery", "hunter"]);
    expect(ratingsFor("1.5").magic["boss-birdraw"].guild).toBe(5.5);
    expect(bisPairFor("1.5", "knight-lancelot", "pve")?.runes).toEqual(["mastery", "magic"]);
    expect(bisPairFor("1.5", "knight-lancelot", "pvp")?.runes).toEqual(["mastery", "magic"]);
    expect(bisPairFor("1.5", "knight-lancelot", "guild")?.runes).toEqual(["mastery", "hunter"]);
    expect(ratingsFor("1.5").mastery["knight-lancelot"].guild).toBe(5.5);
    expect(ratingsFor("1.5")["time-reversal"]["knight-lancelot"].guild).toBe(5.5);
    expect(bisPairFor("1.5", "blob-squad", "pve")?.runes).toEqual(["wave", "magic"]);
    expect(bisPairFor("1.5", "blob-squad", "pvp")?.runes).toEqual(["wave", "magic"]);
    expect(bisPairFor("1.5", "blob-squad", "guild")?.runes).toEqual(["hunter", "magic"]);
    expect(ratingsFor("1.5").battle["blob-squad"]).toMatchObject({ pve: 5, pvp: 5, guild: 5 });
    expect(bisPairFor("1.5", "ace-bat-man", "pvp")?.confidence).toBe("definitive");
    expect(bisPairFor("1.5", "ace-bat-man", "guild")?.confidence).toBe("definitive");
    expect(bisPairFor("1.5", "dr-pulse", "pvp")?.runes).toEqual(["smite", "magic"]);
    expect(bisPairFor("1.5", "dr-pulse", "guild")?.runes).toEqual(["smite", "hunter"]);
    expect(ratingsFor("1.5").smite["dr-pulse"]).toMatchObject({ pve: 6, pvp: 5.5, guild: 5.5 });
    expect(ratingsFor("1.5").mana["dr-pulse"]).toMatchObject({ pve: 5, pvp: 5, guild: 5 });
    expect(bisPairFor("1.5", "great-kitty-mage", "pve")?.note).toContain("no Limit Break");
    expect(bisPairFor("1.4", "dr-pulse", "pve")).toBeUndefined();
  });

  it("provides a detailed BiS explanation and valid fallbacks for all 28 Immortals in every mode", () => {
    const knownRunes = new Set(DATA.runes.map((rune) => rune.id));
    for (const immortal of DATA.immortals) {
      for (const mode of ["pve", "pvp", "guild"] as const) {
        const pair = bisPairFor("2.0.9", immortal.id, mode);
        const guide = bisGuideFor("2.0.9", immortal.id, mode);
        expect(guide, `${immortal.name} ${mode} guide`).toBeDefined();
        expect(guide!.why.length).toBeGreaterThan(100);
        expect(guide!.bestFor.length).toBeGreaterThan(50);
        expect(guide!.fallbacks.length).toBeGreaterThanOrEqual(2);
        for (const item of guide!.fallbacks) {
          expect(new Set(item.runes).size).toBe(2);
          expect(item.runes.every((runeId) => knownRunes.has(runeId))).toBe(true);
          expect(item.runes).not.toEqual(pair!.runes);
          expect(item.note.length).toBeGreaterThan(45);
        }
      }
    }
    expect(bisGuideFor("1.0", "knight-lancelot", "guild")).toBeUndefined();
    expect(bisGuideFor("2.0.9", "knight-lancelot", "guild")?.why).toContain("LB24+");
    expect(bisGuideFor("2.0.9", "captain-roka", "pvp")?.caution).toContain("medium-confidence");
  });

  it("exports a complete v1.4 to v1.5 approval checklist", () => {
    const review = buildMetaReviewMarkdown();
    expect(review.match(/^- \[ \] \*\*(PvE|PvP|Guild):/gm)).toHaveLength(1);
    expect(review).toContain("## Primeval Bomba");
    expect(review).toContain("**PvE: Iron Body + Strength**");
    expect(review).toContain("Definitive decisions implemented: **83 of 84**");
    expect(review).toContain("Decisions still requiring confirmation: **1**");
    expect(review).toContain("## Group decision");
  });

  it("keeps the public v1.5 review download synchronized", () => {
    const download = readFileSync("public/exports/ld-runes-meta-v1.4-to-v1.5-review.md", "utf8");
    expect(download).toBe(buildMetaReviewMarkdown());
  });

  it("keeps the prior ratings in v1.0 and applies the reviewed v1.1 changes", () => {
    expect(ratingsFor("1.0").battle["captain-roka"].pve).toBe(4);
    expect(ratingsFor("1.1").battle["captain-roka"].pve).toBe(5);
    expect(ratingsFor("1.0").mana["i-am-meow"].pve).toBe(2);
    expect(ratingsFor("1.1").mana["i-am-meow"].pve).toBe(5);
  });

  it("leaves Immortals absent from the v1.0 sheet completely unrated", () => {
    const unreleasedImmortals = [
      "demon-monopoly",
      "colony-tar",
      "evergreen-verdee",
      "savior-ray",
      "genie-wiz-zap",
      "knight-lancelot",
    ];

    for (const rune of DATA.runes) {
      for (const immortalId of unreleasedImmortals) {
        expect(ratingsFor("1.0")[rune.id][immortalId]).toMatchObject({ pve: null, pvp: null, guild: null });
      }
    }
  });

  it("preserves historical snapshots and applies the post-patch meta audits", () => {
    expect(ratingsFor("1.1").magic["knight-lancelot"].pve).toBeNull();
    expect(ratingsFor("1.2").magic["knight-lancelot"].pve).toBe(5);
    expect(ratingsFor("1.1").magic["giga-chad"].pve).toBe(2);
    expect(ratingsFor("1.3").magic["giga-chad"].pve).toBe(0);
    expect(ratingsFor("1.3")["focused-aim"]["azure-dragon-taoist"].pve).toBe(0);
    expect(ratingsFor("1.3").smite["dr-pulse"].pve).toBeNull();
    expect(ratingsFor("1.4").smite["dr-pulse"].pve).toBe(5);
    expect(META_VERSIONS).toEqual(["1.0", "2.0.9"]);
    expect(createDefaultState().metaVersion).toBe("2.0.9");
  });

  it("marks the known Limit Break roster and defaults it to level 15", () => {
    const state = createDefaultState();
    expect(DATA.immortals.filter((immortal) => immortal.limitBreak)).toHaveLength(9);
    expect(state.immortalLevels["awakened-hailey"]).toBe(15);
    expect(state.immortalLevels["knight-lancelot"]).toBe(15);
    expect(state.immortalLevels["great-kitty-mage"]).toBeUndefined();
    expect(state.immortalLevels["dr-pulse"]).toBeUndefined();
  });

  it("keeps legacy all-selected rosters complete after adding a form", () => {
    const legacy = createDefaultState();
    legacy.selectedImmortalIds = legacy.selectedImmortalIds.filter((id) => id !== "ace-bat-man-batter");
    legacy.selectedImmortalIds = legacy.selectedImmortalIds.filter((id) => id !== "knight-lancelot");
    expect(migrateBuilderState(legacy).selectedImmortalIds).toContain("ace-bat-man-batter");
    expect(migrateBuilderState(legacy).selectedImmortalIds).toContain("knight-lancelot");

    legacy.selectedImmortalIds = legacy.selectedImmortalIds.filter((id) => id !== "ghost-ninja");
    expect(migrateBuilderState(legacy).selectedImmortalIds).not.toContain("ace-bat-man-batter");
    expect(migrateBuilderState(legacy).selectedImmortalIds).not.toContain("knight-lancelot");
    expect(migrateBuilderState({ ...legacy, metaVersion: undefined as never, metaVersionHasBeenSelected: true }).metaVersion).toBe("2.0.9");
  });

  it("migrates hidden selections to v2.0.9 while retaining v1.0", () => {
    const savedDefault = { ...createDefaultState(), metaVersion: "1.3" as const, metaVersionHasBeenSelected: false };
    expect(migrateBuilderState(savedDefault).metaVersion).toBe("2.0.9");

    const untouchedStableDefault = { ...createDefaultState(), metaVersion: "1.4" as const, metaVersionHasBeenSelected: false };
    expect(migrateBuilderState(untouchedStableDefault).metaVersion).toBe("2.0.9");

    const explicitLegacy = { ...createDefaultState(), metaVersion: "1.2" as const, metaVersionHasBeenSelected: true };
    expect(migrateBuilderState(explicitLegacy).metaVersion).toBe("2.0.9");

    const explicitStable = { ...createDefaultState(), metaVersion: "1.4" as const, metaVersionHasBeenSelected: true };
    expect(migrateBuilderState(explicitStable).metaVersion).toBe("2.0.9");

    const explicitExperimental = { ...createDefaultState(), metaVersion: "1.5" as const, metaVersionHasBeenSelected: true };
    expect(migrateBuilderState(explicitExperimental).metaVersion).toBe("2.0.9");

    const explicitOutdated = { ...createDefaultState(), metaVersion: "1.0" as const, metaVersionHasBeenSelected: true };
    expect(migrateBuilderState(explicitOutdated).metaVersion).toBe("1.0");
  });

  it("resets a temporary v1.0 selection to the latest meta on page load", () => {
    const temporaryOutdated = { ...createDefaultState(), metaVersion: "1.0" as const, metaVersionHasBeenSelected: true };
    expect(resetMetaVersionForPageLoad(temporaryOutdated)).toMatchObject({
      metaVersion: "2.0.9",
      metaVersionHasBeenSelected: false,
    });
  });
});

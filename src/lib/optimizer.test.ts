import solver from "javascript-lp-solver";
import { describe, expect, it, vi } from "vitest";
import { immortalPriorityWeight } from "../data/immortal-priority";
import { DATA, createDefaultState, ratingsFor, type BuilderState } from "../model";
import { optimizeAssignments } from "./optimizer";

const owned = (inventory: BuilderState["inventory"], runeId: string, tier: 1 | 2 | 3 | 4 | 5 | 6 | 7, count = 1) => {
  inventory[runeId] ??= {};
  inventory[runeId][tier] = count;
};

const priorityTie = (state: BuilderState) => {
  const ratings = ratingsFor(state.metaVersion);
  for (const rune of DATA.runes) {
    if (!rune.availableTiers.includes(7)) continue;
    for (const preferred of DATA.immortals) {
      for (const other of DATA.immortals) {
        const score = ratings[rune.id]?.[preferred.id]?.[state.mode] ?? 0;
        if (preferred.id === other.id || score <= 0 || score !== ratings[rune.id]?.[other.id]?.[state.mode]) continue;
        if (immortalPriorityWeight(state.mode, preferred.id) <= immortalPriorityWeight(state.mode, other.id)) continue;
        return { runeId: rune.id, preferredId: preferred.id, otherId: other.id };
      }
    }
  }
  throw new Error(`No mode-priority tie found for ${state.mode}`);
};

describe("optimizer", () => {
  it("never equips more copies than the player owns", () => {
    const state = createDefaultState();
    owned(state.inventory, "strength", 7, 1);
    const assignments = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assignments.filter((assignment) => assignment.runeId === "strength" && assignment.tier === 7)).toHaveLength(1);
  });

  it("limits every Immortal to two different rune types", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["ghost-ninja"];
    owned(state.inventory, "strength", 7, 4);
    owned(state.inventory, "precision", 6, 1);
    owned(state.inventory, "slayer", 6, 1);
    const result = optimizeAssignments(state)[0];
    expect(result.assignments.length).toBeLessThanOrEqual(2);
    expect(new Set(result.assignments.map((assignment) => assignment.runeId)).size).toBe(result.assignments.length);
  });

  it("does not carry legacy locks into new recommendations", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["ghost-ninja", "top-vayne"];
    owned(state.inventory, "strength", 7, 1);
    owned(state.inventory, "precision", 7, 1);
    const legacyState = { ...state, lockedAssignments: [{ immortalId: "top-vayne", runeId: "strength", tier: 7 }] };
    const assignments = optimizeAssignments(legacyState as BuilderState).flatMap((result) => result.assignments);
    expect(assignments).not.toContainEqual(expect.objectContaining({ locked: true }));
  });

  it("reserves an exact locked copy and keeps it in its visual slot", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["top-vayne", "ghost-ninja"];
    owned(state.inventory, "strength", 7);
    owned(state.inventory, "precision", 7);
    state.lockedAssignments = [{ immortalId: "top-vayne", runeId: "strength", tier: 7, slot: 1 }];

    const results = optimizeAssignments(state);
    const locked = results.find((result) => result.immortalId === "top-vayne")!.assignments.find((assignment) => assignment.slot === 1);
    expect(locked).toEqual(expect.objectContaining({ runeId: "strength", tier: 7, locked: true }));
    expect(results.flatMap((result) => result.assignments).filter((assignment) => assignment.runeId === "strength" && assignment.tier === 7)).toHaveLength(1);
  });

  it("rejects duplicate, over-reserved, and unsupported locks", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["top-vayne", "ghost-ninja"];
    owned(state.inventory, "strength", 7);
    owned(state.inventory, "strength", 6);
    state.lockedAssignments = [
      { immortalId: "top-vayne", runeId: "strength", tier: 7, slot: 0 },
      { immortalId: "top-vayne", runeId: "strength", tier: 6, slot: 1 },
      { immortalId: "ghost-ninja", runeId: "strength", tier: 7, slot: 0 },
      { immortalId: "ghost-ninja", runeId: "missing", tier: 7, slot: 1 },
    ];

    const locked = optimizeAssignments(state).flatMap((result) => result.assignments).filter((assignment) => assignment.locked);
    expect(locked).toEqual([expect.objectContaining({ immortalId: "top-vayne", runeId: "strength", tier: 7, slot: 0 })]);
  });

  it("forces an X-rated owned rune in slot one and optimizes the other slot", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["ghost-ninja"];
    const ratings = ratingsFor(state.metaVersion);
    const forcedRune = DATA.runes.find((rune) => rune.availableTiers.includes(7) && (ratings[rune.id]?.["ghost-ninja"]?.pve ?? 0) === 0)!;
    const automaticRune = DATA.runes.find((rune) => rune.id !== forcedRune.id && rune.availableTiers.includes(7) && (ratings[rune.id]?.["ghost-ninja"]?.pve ?? 0) > 0)!;
    owned(state.inventory, forcedRune.id, 7);
    owned(state.inventory, automaticRune.id, 7);
    state.lockedAssignments = [{ immortalId: "ghost-ninja", runeId: forcedRune.id, tier: 7, slot: 0 }];

    const assignments = optimizeAssignments(state)[0].assignments;
    expect(assignments).toContainEqual(expect.objectContaining({ runeId: forcedRune.id, slot: 0, score: 0, locked: true }));
    expect(assignments).toContainEqual(expect.objectContaining({ runeId: automaticRune.id, slot: 1, locked: false }));
  });

  it("excludes X/6 runes by default and includes them when enabled", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["awakened-hailey"];
    owned(state.inventory, "onslaught", 5);

    expect(optimizeAssignments(state)[0].assignments).toEqual([]);

    state.experimentalRunesEnabled = true;
    expect(optimizeAssignments(state)[0].assignments).toContainEqual(expect.objectContaining({
      immortalId: "awakened-hailey",
      runeId: "onslaught",
      score: 4,
    }));
  });

  it("re-optimizes a full roster promptly for every displayed Ace Bat Man: Pitcher alternative", () => {
    const state = createDefaultState();
    state.mode = "pve";
    const mythicCounts: Record<string, number> = {
      Strength: 2, Magic: 2, Power: 1, Speed: 1, Mana: 2, Recursion: 2, Precision: 2, Slayer: 1,
      Conqueror: 1, Sprint: 1, Smite: 1, Amplification: 1, Mastery: 1, Bind: 1, Hunter: 1,
      Penetration: 1, Battle: 1, Focus: 2, Wave: 1, "Immortal Resonance": 1, Haste: 1, Absorption: 1,
      Impact: 1, Chain: 1, Mobility: 2, Rupture: 2, Flurry: 1, Execution: 2, Fortune: 2,
      "Rampant Growth": 1, Barrier: 1, Legion: 1, Accumulation: 2, "Focused Aim": 2,
      "Time Reversal": 2, Sealing: 1, Warcry: 1, "Gold Furnace": 1, "Scatter Shot": 1,
      Affinity: 2, Immobility: 2, "Arcane Flow": 2, Judgement: 2, Lightning: 2, "Mana Harvest": 2,
      "Imperfect Spell": 2, Onslaught: 2, "Battle Legacy": 2, Bloodlust: 2, "Undying Oath": 2,
      "Iron Body": 2, "Arcane Power": 1, "Inherited Power": 1,
    };
    for (const [name, count] of Object.entries(mythicCounts)) {
      const rune = DATA.runes.find((candidate) => candidate.name.replace("Rune of ", "") === name)!;
      owned(state.inventory, rune.id, 5, count);
    }
    for (const name of ["Smite", "Immortal Resonance", "Impact", "Battle Legacy", "Arcane Power"]) {
      const rune = DATA.runes.find((candidate) => candidate.name.replace("Rune of ", "") === name)!;
      owned(state.inventory, rune.id, 6);
    }
    for (const runeId of ["mastery", "affinity", "immobility", "battle"]) {
      state.lockedAssignments = [{ immortalId: "ace-bat-man", runeId, tier: 5, slot: 0 }];
      const startedAt = performance.now();
      const results = optimizeAssignments(state);
      const elapsed = performance.now() - startedAt;

      expect(results.find((result) => result.immortalId === "ace-bat-man")?.assignments)
        .toContainEqual(expect.objectContaining({ runeId, tier: 5, slot: 0, locked: true }));
      expect(elapsed).toBeLessThan(500);
    }
  });

  it("only assigns runes to selected Immortals", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["primeval-bomba"];
    owned(state.inventory, "strength", 7, 2);
    const results = optimizeAssignments(state);
    expect(results).toHaveLength(1);
    expect(results[0].immortalId).toBe("primeval-bomba");
  });

  it("returns no assignments for an empty inventory", () => {
    const state = createDefaultState();
    expect(optimizeAssignments(state).every((result) => result.assignments.length === 0)).toBe(true);
  });

  it("falls back safely if the integer solver throws", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["ghost-ninja"];
    owned(state.inventory, "strength", 7);
    owned(state.inventory, "precision", 7);
    const solve = vi.spyOn(solver, "Solve").mockImplementationOnce(() => { throw new Error("solver failed"); });
    try {
      const assignments = optimizeAssignments(state)[0].assignments;
      expect(assignments).toHaveLength(2);
      expect(new Set(assignments.map((assignment) => assignment.runeId))).toEqual(new Set(["strength", "precision"]));
    } finally {
      solve.mockRestore();
    }
  });

  it("uses favorites only to break otherwise equal recommendations", () => {
    const state = createDefaultState();
    const rating = ratingsFor(state.metaVersion).strength;
    const candidates = DATA.immortals.filter((immortal) => (rating[immortal.id]?.pve ?? 0) > 0);
    const favorite = candidates.find((immortal, index) => candidates.slice(0, index).some((other) => rating[other.id]?.pve === rating[immortal.id]?.pve));
    expect(favorite).toBeDefined();
    const other = candidates.find((immortal) => immortal.id !== favorite!.id && rating[immortal.id]?.pve === rating[favorite!.id]?.pve);
    expect(other).toBeDefined();
    state.selectedImmortalIds = [other!.id, favorite!.id];
    state.favoriteImmortalIds = [favorite!.id];
    owned(state.inventory, "strength", 7);

    const assigned = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: favorite!.id, runeId: "strength", tier: 7 }));
  });

  it("does not let a favorite override a higher recommendation score", () => {
    const state = createDefaultState();
    const rating = ratingsFor(state.metaVersion).strength;
    const candidates = DATA.immortals
      .map((immortal) => ({ immortal, score: rating[immortal.id]?.pve ?? 0 }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => left.score - right.score);
    const favorite = candidates[0];
    const stronger = candidates.at(-1);
    expect(stronger?.score).toBeGreaterThan(favorite?.score ?? 0);
    state.selectedImmortalIds = [favorite.immortal.id, stronger!.immortal.id];
    state.favoriteImmortalIds = [favorite.immortal.id];
    owned(state.inventory, "strength", 7);

    const assigned = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: stronger!.immortal.id, runeId: "strength", tier: 7 }));
  });

  it.each(["pve", "pvp", "guild"] as const)("uses the %s usage tier only to break equal scarce-rune fits", (mode) => {
    const state = createDefaultState();
    state.mode = mode;
    const tie = priorityTie(state);
    state.selectedImmortalIds = [tie.otherId, tie.preferredId];
    owned(state.inventory, tie.runeId, 7);

    const assigned = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: tie.preferredId, runeId: tie.runeId, tier: 7 }));
  });

  it("uses a personal mode priority override to reverse an equal-fit decision", () => {
    const state = createDefaultState();
    const tie = priorityTie(state);
    state.selectedImmortalIds = [tie.preferredId, tie.otherId];
    state.immortalPriorityOverrides = { pve: { [tie.preferredId]: "C", [tie.otherId]: "S" } };
    owned(state.inventory, tie.runeId, 7);

    const assigned = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: tie.otherId, runeId: tie.runeId, tier: 7 }));
  });

  it("does not let a personal priority override a higher recommendation score", () => {
    const state = createDefaultState();
    const rating = ratingsFor(state.metaVersion).strength;
    const candidates = DATA.immortals
      .map((immortal) => ({ immortal, score: rating[immortal.id]?.pve ?? 0 }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => left.score - right.score);
    const weaker = candidates[0];
    const stronger = candidates.at(-1)!;
    state.selectedImmortalIds = [weaker.immortal.id, stronger.immortal.id];
    state.immortalPriorityOverrides = { pve: { [weaker.immortal.id]: "S", [stronger.immortal.id]: "C" } };
    owned(state.inventory, "strength", 7);

    const assigned = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: stronger.immortal.id, runeId: "strength", tier: 7 }));
  });

  it("gives the stronger equivalent copy to the higher usage tier", () => {
    const state = createDefaultState();
    const tie = priorityTie(state);
    state.selectedImmortalIds = [tie.otherId, tie.preferredId];
    owned(state.inventory, tie.runeId, 7);
    owned(state.inventory, tie.runeId, 6);

    const assigned = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: tie.preferredId, runeId: tie.runeId, tier: 7 }));
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: tie.otherId, runeId: tie.runeId, tier: 6 }));
  });

  it("lets a personal favorite override the default usage tier on an equal fit", () => {
    const state = createDefaultState();
    const tie = priorityTie(state);
    state.selectedImmortalIds = [tie.preferredId, tie.otherId];
    state.favoriteImmortalIds = [tie.otherId];
    owned(state.inventory, tie.runeId, 7);

    const assigned = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assigned).toContainEqual(expect.objectContaining({ immortalId: tie.otherId, runeId: tie.runeId, tier: 7 }));
  });

  it("completes an exact v2.0.9 BiS pair when both runes are owned", () => {
    const state = createDefaultState();
    state.metaVersion = "2.0.9";
    state.metaVersionHasBeenSelected = true;
    state.selectedImmortalIds = ["dr-pulse"];
    owned(state.inventory, "smite", 7);
    owned(state.inventory, "mana-harvest", 7);
    owned(state.inventory, "accumulation", 7);

    const result = optimizeAssignments(state)[0];
    expect(result.assignments.map((assignment) => assignment.runeId).sort()).toEqual(["mana-harvest", "smite"]);
    expect(result.assignments.every((assignment) => assignment.score === 6)).toBe(true);
  });

  it("completes a BiS pair around one locked component", () => {
    const state = createDefaultState();
    state.metaVersion = "2.0.9";
    state.metaVersionHasBeenSelected = true;
    state.selectedImmortalIds = ["dr-pulse"];
    owned(state.inventory, "smite", 7);
    owned(state.inventory, "mana-harvest", 7);
    owned(state.inventory, "accumulation", 7);
    state.lockedAssignments = [{ immortalId: "dr-pulse", runeId: "smite", tier: 7, slot: 1 }];

    const result = optimizeAssignments(state)[0];
    expect(result.assignments).toContainEqual(expect.objectContaining({ runeId: "smite", slot: 1, locked: true }));
    expect(result.assignments).toContainEqual(expect.objectContaining({ runeId: "mana-harvest", slot: 0, locked: false }));
  });

  it("falls back to the best available individual rune when a v2.0.9 pair is incomplete", () => {
    const state = createDefaultState();
    state.metaVersion = "2.0.9";
    state.metaVersionHasBeenSelected = true;
    state.selectedImmortalIds = ["dr-pulse"];
    owned(state.inventory, "smite", 7);
    owned(state.inventory, "accumulation", 7);

    const result = optimizeAssignments(state)[0];
    expect(result.assignments).toContainEqual(expect.objectContaining({ runeId: "smite", score: 6 }));
    expect(result.assignments).toContainEqual(expect.objectContaining({ runeId: "accumulation", score: 5 }));
  });

  it("keeps v1.4 scalar recommendations unchanged", () => {
    const state = createDefaultState();
    state.metaVersion = "1.4";
    state.metaVersionHasBeenSelected = true;
    state.selectedImmortalIds = ["dr-pulse"];
    owned(state.inventory, "smite", 7);
    owned(state.inventory, "mana-harvest", 7);
    owned(state.inventory, "accumulation", 7);

    const result = optimizeAssignments(state)[0];
    expect(state.metaVersion).toBe("1.4");
    expect(result.assignments.every((assignment) => assignment.score <= 5)).toBe(true);
  });
});

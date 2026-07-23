import { describe, expect, it } from "vitest";
import { DATA, createDefaultState, ratingsFor, type BuilderState } from "../model";
import { optimizeAssignments } from "./optimizer";

const owned = (inventory: BuilderState["inventory"], runeId: string, tier: 1 | 2 | 3 | 4 | 5 | 6 | 7, count = 1) => {
  inventory[runeId] ??= {};
  inventory[runeId][tier] = count;
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
});

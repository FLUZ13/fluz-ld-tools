import { describe, expect, it } from "vitest";
import { createDefaultState, type BuilderState } from "../model";
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

  it("honors valid locked assignments while recalculating remaining slots", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["ghost-ninja", "top-vayne"];
    owned(state.inventory, "strength", 7, 1);
    owned(state.inventory, "precision", 7, 1);
    state.lockedAssignments = [{ immortalId: "top-vayne", runeId: "strength", tier: 7 }];
    const assignments = optimizeAssignments(state).flatMap((result) => result.assignments);
    expect(assignments).toContainEqual(expect.objectContaining({ immortalId: "top-vayne", runeId: "strength", tier: 7, locked: true }));
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
});

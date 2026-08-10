import { describe, expect, it } from "vitest";
import { createDefaultState } from "../model";
import { parseBackup, serializeBackup } from "./backup";

describe("local backup files", () => {
  it("round-trips visible inventory and builder settings", () => {
    const state = createDefaultState();
    state.metaVersion = "1.0";
    state.metaVersionHasBeenSelected = true;
    state.experimentalRunesEnabled = true;
    state.inventory.strength = { 7: 2 };
    state.mode = "guild";
    state.selectedImmortalIds = ["ghost-ninja"];
    state.favoriteImmortalIds = ["top-vayne"];
    state.immortalPriorityOverrides = { guild: { "ghost-ninja": "S", "top-vayne": "C" } };
    state.immortalLevels["ghost-ninja"] = 21;
    state.lockedAssignments = [{ immortalId: "ghost-ninja", runeId: "strength", tier: 7, slot: 0 }];
    const restored = parseBackup(serializeBackup(state));
    expect(restored.inventory.strength?.[7]).toBe(2);
    expect(restored.mode).toBe("guild");
    expect(restored.metaVersion).toBe("1.0");
    expect(restored.experimentalRunesEnabled).toBe(true);
    expect(restored.selectedImmortalIds).toEqual(["ghost-ninja"]);
    expect(restored.favoriteImmortalIds).toEqual(["top-vayne"]);
    expect(restored.immortalPriorityOverrides).toEqual({ guild: { "ghost-ninja": "S", "top-vayne": "C" } });
    expect(restored.immortalLevels["ghost-ninja"]).toBe(21);
    expect(restored.lockedAssignments).toEqual([{ immortalId: "ghost-ninja", runeId: "strength", tier: 7, slot: 0 }]);
  });

  it("drops removed Common and Rare quantities from older files", () => {
    const state = createDefaultState();
    state.inventory.strength = { 1: 8, 2: 4, 6: 1 };
    const restored = parseBackup(serializeBackup(state));
    expect(restored.inventory.strength).toEqual({ 6: 1 });
  });

  it("drops invalid personal priority overrides", () => {
    const raw = JSON.parse(serializeBackup(createDefaultState()));
    raw.state.immortalPriorityOverrides = { pve: { "ghost-ninja": "Z", missing: "S" }, pvp: { "top-vayne": "A" }, invalid: { "top-vayne": "S" } };
    expect(parseBackup(JSON.stringify(raw)).immortalPriorityOverrides).toEqual({ pvp: { "top-vayne": "A" } });
  });

  it("drops unsupported and obsolete slot-less locks while preserving valid reservations", () => {
    const state = createDefaultState();
    state.selectedImmortalIds = ["ghost-ninja", "top-vayne"];
    state.inventory.strength = { 7: 1 };
    const raw = JSON.parse(serializeBackup(state));
    raw.state.lockedAssignments = [
      { immortalId: "ghost-ninja", runeId: "strength", tier: 7, slot: 0 },
      { immortalId: "top-vayne", runeId: "strength", tier: 7, slot: 1 },
      { immortalId: "ghost-ninja", runeId: "precision", tier: 7 },
    ];

    expect(parseBackup(JSON.stringify(raw)).lockedAssignments).toEqual([
      { immortalId: "ghost-ninja", runeId: "strength", tier: 7, slot: 0 },
    ]);
  });

  it("rejects unrelated JSON files", () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(/not an LD Rune Builder backup/i);
  });
});

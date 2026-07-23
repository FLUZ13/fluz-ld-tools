import { describe, expect, it } from "vitest";
import { createDefaultState } from "../model";
import { parseBackup, serializeBackup } from "./backup";

describe("local backup files", () => {
  it("round-trips visible inventory and builder settings", () => {
    const state = createDefaultState();
    state.inventory.strength = { 7: 2 };
    state.mode = "guild";
    state.selectedImmortalIds = ["ghost-ninja"];
    state.favoriteImmortalIds = ["top-vayne"];
    const restored = parseBackup(serializeBackup(state));
    expect(restored.inventory.strength?.[7]).toBe(2);
    expect(restored.mode).toBe("guild");
    expect(restored.metaVersion).toBe("1.1");
    expect(restored.selectedImmortalIds).toEqual(["ghost-ninja"]);
    expect(restored.favoriteImmortalIds).toEqual(["top-vayne"]);
  });

  it("drops removed Common and Rare quantities from older files", () => {
    const state = createDefaultState();
    state.inventory.strength = { 1: 8, 2: 4, 6: 1 };
    const restored = parseBackup(serializeBackup(state));
    expect(restored.inventory.strength).toEqual({ 6: 1 });
  });

  it("rejects unrelated JSON files", () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(/not an LD Rune Builder backup/i);
  });
});

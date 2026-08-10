import { describe, expect, it } from "vitest";
import { DATA, type GameMode } from "../model";
import { IMMORTAL_PRIORITY_GROUPS, IMMORTAL_PRIORITY_TIERS, immortalPriorityTier } from "./immortal-priority";

const modes: GameMode[] = ["pve", "pvp", "guild"];

describe("Immortal mode priorities", () => {
  it.each(modes)("ranks every Immortal exactly once in %s", (mode) => {
    const ranked = IMMORTAL_PRIORITY_TIERS.flatMap((tier) => IMMORTAL_PRIORITY_GROUPS[mode][tier]);
    expect(ranked).toHaveLength(DATA.immortals.length);
    expect(new Set(ranked)).toEqual(new Set(DATA.immortals.map((immortal) => immortal.id)));
  });

  it("matches the supplied mode-specific placements", () => {
    expect(immortalPriorityTier("pve", "chrono-ato")).toBe("S");
    expect(immortalPriorityTier("pvp", "queen-coldy")).toBe("C");
    expect(immortalPriorityTier("guild", "knight-lancelot")).toBe("S");
    expect(immortalPriorityTier("guild", "i-am-meow")).toBe("C");
  });

  it("uses the mode-specific Ace Bat Man form priorities", () => {
    expect(immortalPriorityTier("pve", "ace-bat-man")).toBe("S");
    expect(immortalPriorityTier("pvp", "ace-bat-man")).toBe("C");
    expect(immortalPriorityTier("guild", "ace-bat-man")).toBe("C");
    expect(immortalPriorityTier("pve", "ace-bat-man-batter")).toBe("B");
    expect(immortalPriorityTier("pvp", "ace-bat-man-batter")).toBe("S");
    expect(immortalPriorityTier("guild", "ace-bat-man-batter")).toBe("S");
  });

  it("applies personal overrides only in their selected mode", () => {
    const overrides = { pve: { "chrono-ato": "C" as const } };
    expect(immortalPriorityTier("pve", "chrono-ato", overrides)).toBe("C");
    expect(immortalPriorityTier("guild", "chrono-ato", overrides)).toBe("S");
  });
});

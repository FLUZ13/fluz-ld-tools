import type { GameMode, ImmortalPriorityOverrides, ImmortalPriorityTier } from "../model";

export const IMMORTAL_PRIORITY_TIERS = ["S", "A", "B", "C"] as const;

// These are intentionally soft usage preferences, not power scores. Rune fit remains dominant.
export const IMMORTAL_PRIORITY_GROUPS: Record<GameMode, Record<ImmortalPriorityTier, readonly string[]>> = {
  pve: {
    S: [
      "super-graviton", "i-am-meow", "demon-monopoly", "grand-mama", "great-kitty-mage",
      "primeval-bomba", "ace-bat-man", "captain-roka", "reaper-frog",
      "azure-dragon-taoist", "awakened-hailey", "chrono-ato",
    ],
    A: ["sage-kun", "ghost-ninja", "top-vayne", "giga-chad", "savior-ray", "dr-pulse", "boss-birdraw", "knight-lancelot"],
    B: ["noisy-penguin-musician", "queen-coldy", "dark-lord-dragon", "genie-wiz-zap", "ace-bat-man-batter"],
    C: ["colony-tar", "evergreen-verdee", "blob-squad"],
  },
  pvp: {
    S: [
      "super-graviton", "i-am-meow", "demon-monopoly", "grand-mama", "great-kitty-mage", "top-vayne",
      "primeval-bomba", "ace-bat-man-batter", "awakened-hailey", "reaper-frog",
      "sage-kun", "captain-roka", "azure-dragon-taoist",
    ],
    A: ["genie-wiz-zap", "chrono-ato", "giga-chad", "ghost-ninja", "boss-birdraw", "knight-lancelot", "dr-pulse", "savior-ray"],
    B: ["noisy-penguin-musician", "colony-tar", "evergreen-verdee", "dark-lord-dragon"],
    C: ["blob-squad", "queen-coldy", "ace-bat-man"],
  },
  guild: {
    S: [
      "grand-mama", "chrono-ato", "top-vayne", "ace-bat-man-batter",
      "captain-roka", "reaper-frog", "awakened-hailey", "knight-lancelot",
    ],
    A: ["super-graviton", "giga-chad", "ghost-ninja", "savior-ray", "boss-birdraw"],
    B: ["demon-monopoly", "great-kitty-mage", "primeval-bomba", "dr-pulse", "sage-kun", "genie-wiz-zap", "azure-dragon-taoist"],
    C: ["i-am-meow", "noisy-penguin-musician", "colony-tar", "evergreen-verdee", "queen-coldy", "dark-lord-dragon", "blob-squad", "ace-bat-man"],
  },
};

const IMMORTAL_PRIORITY_BY_MODE = Object.fromEntries(Object.entries(IMMORTAL_PRIORITY_GROUPS).map(([mode, groups]) => [
  mode,
  Object.fromEntries(IMMORTAL_PRIORITY_TIERS.flatMap((tier) => groups[tier].map((immortalId) => [immortalId, tier]))),
])) as Record<GameMode, Record<string, ImmortalPriorityTier>>;

const PRIORITY_WEIGHT: Record<ImmortalPriorityTier, number> = { S: 4, A: 3, B: 2, C: 1 };

export const defaultImmortalPriorityTier = (mode: GameMode, immortalId: string): ImmortalPriorityTier =>
  IMMORTAL_PRIORITY_BY_MODE[mode][immortalId] ?? "C";

export const immortalPriorityTier = (mode: GameMode, immortalId: string, overrides?: ImmortalPriorityOverrides): ImmortalPriorityTier =>
  overrides?.[mode]?.[immortalId] ?? defaultImmortalPriorityTier(mode, immortalId);

export const immortalPriorityWeight = (mode: GameMode, immortalId: string, overrides?: ImmortalPriorityOverrides) =>
  PRIORITY_WEIGHT[immortalPriorityTier(mode, immortalId, overrides)];

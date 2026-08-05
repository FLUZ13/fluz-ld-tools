import gameData from "./data/game-data.json";
import { VERIFIED_RUNE_ICONS } from "./data/rune-icons";

export type GameMode = "pve" | "pvp" | "guild";
export type MetaVersion = "1.0" | "1.1" | "1.2" | "1.3" | "1.4";
export type RuneTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Confidence = "source" | "provisional";
export const META_VERSIONS: MetaVersion[] = ["1.0", "1.1", "1.2", "1.3", "1.4"];
export const LATEST_META_VERSION: MetaVersion = "1.4";

export interface RuneDefinition {
  id: string;
  assetId: string;
  name: string;
  descriptions: { legendary: string; mythic: string; immortal: string };
  tierLabel: string;
  notes: string;
  availableTiers: RuneTier[];
  image: string;
}

export interface ImmortalDefinition {
  id: string;
  name: string;
  assetId: string;
  role: "support" | "physical" | "magic" | "hybrid";
  image: string;
  boardImage: string;
  provisional: boolean;
  limitBreak: boolean;
}

export interface BuilderState {
  schemaVersion: 1;
  inventory: Record<string, Partial<Record<RuneTier, number>>>;
  selectedImmortalIds: string[];
  favoriteImmortalIds: string[];
  immortalLevels: Record<string, number>;
  mode: GameMode;
  metaVersion: MetaVersion;
  updatedAt: string;
}

export interface Assignment {
  immortalId: string;
  runeId: string;
  tier: RuneTier;
  score: number;
  confidence: Confidence;
}

export interface Recommendation {
  immortalId: string;
  assignments: Assignment[];
}

export interface RatingCell {
  pve: number | null;
  pvp: number | null;
  guild: number | null;
  confidence: Confidence;
  sourceSymbol: string;
}

export type RatingMatrix = Record<string, Record<string, RatingCell>>;

export interface GameData {
  schemaVersion: number;
  datasetVersion: string;
  sourceUpdatedAt: string;
  generatedAt: string;
  runes: RuneDefinition[];
  immortals: ImmortalDefinition[];
  ratings: RatingMatrix;
  ratingVersions: Record<MetaVersion, RatingMatrix>;
}

const rawData = gameData as GameData;

export const DATA: GameData = {
  ...rawData,
  runes: rawData.runes.map((rune) => {
    const verifiedIcon = VERIFIED_RUNE_ICONS[rune.id];
    return verifiedIcon ? { ...rune, ...verifiedIcon } : rune;
  }),
};
export const ratingsFor = (version: MetaVersion) => DATA.ratingVersions[version] ?? DATA.ratings;
export const TIERS: RuneTier[] = [3, 4, 5, 6, 7];
export const TIER_NAMES: Record<RuneTier, string> = {
  1: "Common",
  2: "Rare",
  3: "Epic",
  4: "Legendary",
  5: "Mythic",
  6: "Immortal",
  7: "Eternal",
};

export const createDefaultState = (): BuilderState => ({
  schemaVersion: 1,
  inventory: {},
  selectedImmortalIds: DATA.immortals.map((immortal) => immortal.id),
  favoriteImmortalIds: [],
  immortalLevels: Object.fromEntries(DATA.immortals.filter((immortal) => immortal.limitBreak).map((immortal) => [immortal.id, 15])),
  mode: "pve",
  metaVersion: LATEST_META_VERSION,
  updatedAt: new Date().toISOString(),
});

export const countOwnedRunes = (state: BuilderState) =>
  Object.values(state.inventory).reduce(
    (total, tiers) => total + TIERS.reduce((sum, tier) => sum + (tiers[tier] ?? 0), 0),
    0,
  );

export function migrateBuilderState(state: BuilderState): BuilderState {
  // Existing anonymous workspaces keep the recommendation snapshot they had.
  const immortalIds = new Set(DATA.immortals.map((immortal) => immortal.id));
  const favoriteImmortalIds = Array.isArray(state.favoriteImmortalIds)
    ? [...new Set(state.favoriteImmortalIds.filter((id) => immortalIds.has(id)))]
    : [];
  const { lockedAssignments: _legacyLocks, ...withoutLegacyLocks } = state as BuilderState & { lockedAssignments?: unknown };
  const metaVersion = META_VERSIONS.includes(state.metaVersion) ? state.metaVersion : "1.0";
  const rawLevels = state.immortalLevels && typeof state.immortalLevels === "object" ? state.immortalLevels : {};
  const immortalLevels = Object.fromEntries(DATA.immortals.filter((immortal) => immortal.limitBreak).map((immortal) => {
    const level = Number(rawLevels[immortal.id]);
    return [immortal.id, Number.isFinite(level) ? Math.max(15, Math.min(25, Math.floor(level))) : 15];
  }));
  const versioned = { ...withoutLegacyLocks, favoriteImmortalIds, immortalLevels, metaVersion };
  const addedForms = ["ace-bat-man-batter", "knight-lancelot"];
  const selected = new Set(versioned.selectedImmortalIds.filter((id) => immortalIds.has(id)));
  let changed = selected.size !== versioned.selectedImmortalIds.length || DATA.immortals.some((immortal) => immortal.limitBreak && state.immortalLevels?.[immortal.id] !== immortalLevels[immortal.id]);

  for (const [index, addedFormId] of addedForms.entries()) {
    if (selected.has(addedFormId)) continue;
    const laterAdditions = new Set(addedForms.slice(index));
    const previousRoster = DATA.immortals.filter((immortal) => !laterAdditions.has(immortal.id));
    if (!previousRoster.every((immortal) => selected.has(immortal.id))) continue;
    selected.add(addedFormId);
    changed = true;
  }

  if (!changed) return versioned;
  return { ...versioned, selectedImmortalIds: [...selected], updatedAt: new Date().toISOString() };
}

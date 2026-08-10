import gameData from "./data/game-data.json";
import { META_V15_BIS_GUIDES, type MetaV15BisGuide } from "./data/meta-v15-guides";
import { META_V15_CONDITIONAL_PAIRS, META_V15_PAIRS, META_V15_RATING_OVERRIDES, META_V15_SPECIAL_RUNES, type MetaV15ConditionalPair, type MetaV15Confidence, type MetaV15SpecialRune } from "./data/meta-v15";
import { VERIFIED_RUNE_ICONS } from "./data/rune-icons";

export type GameMode = "pve" | "pvp" | "guild";
export type ImmortalPriorityTier = "S" | "A" | "B" | "C";
export type ImmortalPriorityOverrides = Partial<Record<GameMode, Record<string, ImmortalPriorityTier>>>;
export type MetaVersion = "1.0" | "1.1" | "1.2" | "1.3" | "1.4" | "1.5" | "2.0.9";
export type RuneTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Confidence = "source" | "provisional";
export const BASELINE_META_VERSION: MetaVersion = "1.0";
const V2_SOURCE_META_VERSION: MetaVersion = "1.4";
export const LATEST_META_VERSION: MetaVersion = "2.0.9";
export const DEFAULT_META_VERSION: MetaVersion = LATEST_META_VERSION;
export const META_VERSIONS = [BASELINE_META_VERSION, LATEST_META_VERSION] as const;
export type SelectableMetaVersion = typeof META_VERSIONS[number];

export const isSelectableMetaVersion = (version: unknown): version is SelectableMetaVersion =>
  typeof version === "string" && (META_VERSIONS as readonly string[]).includes(version);

export const metaVersionLabel = (version: MetaVersion) => {
  if (version === BASELINE_META_VERSION) return "v1.0 (ff's guides)";
  if (version === LATEST_META_VERSION) return "v2.0.9 (latest)";
  return `v${version}`;
};

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
  lockedAssignments: LockedAssignment[];
  experimentalRunesEnabled: boolean;
  favoriteImmortalIds: string[];
  immortalPriorityOverrides: ImmortalPriorityOverrides;
  immortalLevels: Record<string, number>;
  mode: GameMode;
  metaVersion: MetaVersion;
  metaVersionHasBeenSelected: boolean;
  updatedAt: string;
}

export type AssignmentSlot = 0 | 1;

export interface LockedAssignment {
  immortalId: string;
  runeId: string;
  tier: RuneTier;
  slot: AssignmentSlot;
}

export interface Assignment extends LockedAssignment {
  score: number;
  confidence: Confidence;
  locked: boolean;
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

export interface BisPair {
  runes: readonly [string, string];
  confidence: MetaV15Confidence;
  note?: string;
}

export interface GameData {
  schemaVersion: number;
  datasetVersion: string;
  sourceUpdatedAt: string;
  generatedAt: string;
  runes: RuneDefinition[];
  immortals: ImmortalDefinition[];
  ratings: RatingMatrix;
  ratingVersions: Partial<Record<MetaVersion, RatingMatrix>>;
}

const rawData = gameData as GameData;

export const DATA: GameData = {
  ...rawData,
  runes: rawData.runes.map((rune) => {
    const verifiedIcon = VERIFIED_RUNE_ICONS[rune.id];
    return verifiedIcon ? { ...rune, ...verifiedIcon } : rune;
  }),
};
let experimentalRatings: RatingMatrix | undefined;
const usesLatestRatings = (version: MetaVersion) => version === LATEST_META_VERSION || version === "1.5";

function buildExperimentalRatings() {
  const baseline = DATA.ratingVersions[V2_SOURCE_META_VERSION] ?? DATA.ratings;
  const ratings = Object.fromEntries(Object.entries(baseline).map(([runeId, immortalRatings]) => [
    runeId,
    Object.fromEntries(Object.entries(immortalRatings).map(([immortalId, cell]) => [immortalId, { ...cell }])),
  ])) as RatingMatrix;

  for (const [immortalId, modes] of Object.entries(META_V15_PAIRS)) {
    for (const [mode, pair] of Object.entries(modes) as Array<[GameMode, BisPair]>) {
      for (const runeId of pair.runes) ratings[runeId][immortalId][mode] = 6;
    }
  }
  for (const [immortalId, runes] of Object.entries(META_V15_RATING_OVERRIDES)) {
    for (const [runeId, modes] of Object.entries(runes)) {
      for (const [mode, score] of Object.entries(modes) as Array<[GameMode, number]>) ratings[runeId][immortalId][mode] = score;
    }
  }
  return ratings;
}

export const ratingsFor = (version: MetaVersion) => {
  if (usesLatestRatings(version)) return experimentalRatings ??= buildExperimentalRatings();
  return DATA.ratingVersions[version] ?? DATA.ratings;
};

export const bisPairFor = (version: MetaVersion, immortalId: string, mode: GameMode): BisPair | undefined =>
  usesLatestRatings(version) ? META_V15_PAIRS[immortalId]?.[mode] : undefined;

export const bisGuideFor = (version: MetaVersion, immortalId: string, mode: GameMode): MetaV15BisGuide | undefined =>
  usesLatestRatings(version) ? META_V15_BIS_GUIDES[immortalId]?.[mode] : undefined;

export const specialRuneFor = (version: MetaVersion, immortalId: string, mode: GameMode): MetaV15SpecialRune | undefined =>
  usesLatestRatings(version) ? META_V15_SPECIAL_RUNES[immortalId]?.[mode] : undefined;

export const conditionalPairsFor = (version: MetaVersion, immortalId: string, mode: GameMode): MetaV15ConditionalPair[] =>
  usesLatestRatings(version) ? META_V15_CONDITIONAL_PAIRS[immortalId]?.[mode] ?? [] : [];
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
  lockedAssignments: [],
  experimentalRunesEnabled: false,
  favoriteImmortalIds: [],
  immortalPriorityOverrides: {},
  immortalLevels: Object.fromEntries(DATA.immortals.filter((immortal) => immortal.limitBreak).map((immortal) => [immortal.id, 15])),
  mode: "pve",
  metaVersion: DEFAULT_META_VERSION,
  metaVersionHasBeenSelected: false,
  updatedAt: new Date().toISOString(),
});

export const countOwnedRunes = (state: BuilderState) =>
  Object.values(state.inventory).reduce(
    (total, tiers) => total + TIERS.reduce((sum, tier) => sum + (tiers[tier] ?? 0), 0),
    0,
  );

export function reconcileLockedAssignments(state: Pick<BuilderState, "inventory" | "selectedImmortalIds"> & { lockedAssignments?: unknown }): LockedAssignment[] {
  if (!Array.isArray(state.lockedAssignments)) return [];
  const selected = new Set(state.selectedImmortalIds);
  const immortalIds = new Set(DATA.immortals.map((immortal) => immortal.id));
  const runeById = new Map(DATA.runes.map((rune) => [rune.id, rune]));
  const usedCopies = new Map<string, number>();
  const occupiedSlots = new Set<string>();
  const occupiedRuneTypes = new Set<string>();
  const reconciled: LockedAssignment[] = [];

  for (const value of state.lockedAssignments) {
    if (!value || typeof value !== "object") continue;
    const raw = value as Record<string, unknown>;
    if (typeof raw.immortalId !== "string" || !immortalIds.has(raw.immortalId) || !selected.has(raw.immortalId)) continue;
    if (typeof raw.runeId !== "string") continue;
    const rune = runeById.get(raw.runeId);
    const tier = Number(raw.tier) as RuneTier;
    const slot = Number(raw.slot) as AssignmentSlot;
    if (!rune || !TIERS.includes(tier) || !rune.availableTiers.includes(tier) || (slot !== 0 && slot !== 1)) continue;
    const slotKey = `${raw.immortalId}:${slot}`;
    const runeTypeKey = `${raw.immortalId}:${raw.runeId}`;
    const copyKey = `${raw.runeId}:${tier}`;
    if (occupiedSlots.has(slotKey) || occupiedRuneTypes.has(runeTypeKey)) continue;
    const used = usedCopies.get(copyKey) ?? 0;
    const owned = state.inventory[raw.runeId]?.[tier] ?? 0;
    if (used >= owned) continue;
    occupiedSlots.add(slotKey);
    occupiedRuneTypes.add(runeTypeKey);
    usedCopies.set(copyKey, used + 1);
    reconciled.push({ immortalId: raw.immortalId, runeId: raw.runeId, tier, slot });
  }
  return reconciled;
}

export const reservedRuneCount = (state: Pick<BuilderState, "lockedAssignments">, runeId: string, tier: RuneTier) =>
  state.lockedAssignments.filter((lock) => lock.runeId === runeId && lock.tier === tier).length;

export const resetMetaVersionForPageLoad = (state: BuilderState): BuilderState => ({
  ...state,
  metaVersion: DEFAULT_META_VERSION,
  metaVersionHasBeenSelected: false,
});

export function migrateBuilderState(state: BuilderState): BuilderState {
  const immortalIds = new Set(DATA.immortals.map((immortal) => immortal.id));
  const favoriteImmortalIds = Array.isArray(state.favoriteImmortalIds)
    ? [...new Set(state.favoriteImmortalIds.filter((id) => immortalIds.has(id)))]
    : [];
  const rawPriorityOverrides = (state as BuilderState & { immortalPriorityOverrides?: unknown }).immortalPriorityOverrides;
  const immortalPriorityOverrides: ImmortalPriorityOverrides = {};
  if (rawPriorityOverrides && typeof rawPriorityOverrides === "object") {
    for (const mode of ["pve", "pvp", "guild"] as const) {
      const rawModeOverrides = (rawPriorityOverrides as Record<string, unknown>)[mode];
      if (!rawModeOverrides || typeof rawModeOverrides !== "object") continue;
      const validEntries = Object.entries(rawModeOverrides as Record<string, unknown>)
        .filter((entry): entry is [string, ImmortalPriorityTier] => immortalIds.has(entry[0]) && ["S", "A", "B", "C"].includes(entry[1] as string));
      if (validEntries.length > 0) immortalPriorityOverrides[mode] = Object.fromEntries(validEntries);
    }
  }
  const rawMetaVersion = (state as BuilderState & { metaVersion?: unknown }).metaVersion;
  const metaVersion = rawMetaVersion === "1.5"
    ? LATEST_META_VERSION
    : isSelectableMetaVersion(rawMetaVersion) ? rawMetaVersion : DEFAULT_META_VERSION;
  const metaVersionHasBeenSelected = (state as BuilderState & { metaVersionHasBeenSelected?: unknown }).metaVersionHasBeenSelected === true
    && isSelectableMetaVersion(rawMetaVersion);
  const experimentalRunesEnabled = (state as BuilderState & { experimentalRunesEnabled?: unknown }).experimentalRunesEnabled === true;
  const rawLevels = state.immortalLevels && typeof state.immortalLevels === "object" ? state.immortalLevels : {};
  const immortalLevels = Object.fromEntries(DATA.immortals.filter((immortal) => immortal.limitBreak).map((immortal) => {
    const level = Number(rawLevels[immortal.id]);
    return [immortal.id, Number.isFinite(level) ? Math.max(15, Math.min(25, Math.floor(level))) : 15];
  }));
  const versioned = { ...state, experimentalRunesEnabled, favoriteImmortalIds, immortalPriorityOverrides, immortalLevels, metaVersion, metaVersionHasBeenSelected };
  const addedForms = ["ace-bat-man-batter", "knight-lancelot"];
  const selected = new Set(versioned.selectedImmortalIds.filter((id) => immortalIds.has(id)));
  let changed = selected.size !== versioned.selectedImmortalIds.length
    || state.metaVersion !== metaVersion
    || state.metaVersionHasBeenSelected !== metaVersionHasBeenSelected
    || state.experimentalRunesEnabled !== experimentalRunesEnabled
    || DATA.immortals.some((immortal) => immortal.limitBreak && state.immortalLevels?.[immortal.id] !== immortalLevels[immortal.id]);

  for (const [index, addedFormId] of addedForms.entries()) {
    if (selected.has(addedFormId)) continue;
    const laterAdditions = new Set(addedForms.slice(index));
    const previousRoster = DATA.immortals.filter((immortal) => !laterAdditions.has(immortal.id));
    if (!previousRoster.every((immortal) => selected.has(immortal.id))) continue;
    selected.add(addedFormId);
    changed = true;
  }

  const selectedImmortalIds = [...selected];
  const lockedAssignments = reconcileLockedAssignments({
    inventory: versioned.inventory,
    selectedImmortalIds,
    lockedAssignments: (state as BuilderState & { lockedAssignments?: unknown }).lockedAssignments,
  });
  if (JSON.stringify(lockedAssignments) !== JSON.stringify((state as BuilderState & { lockedAssignments?: unknown }).lockedAssignments ?? [])) changed = true;

  if (!changed) return { ...versioned, lockedAssignments };
  return { ...versioned, lockedAssignments, selectedImmortalIds, updatedAt: new Date().toISOString() };
}

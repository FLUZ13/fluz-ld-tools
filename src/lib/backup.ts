import { DATA, DEFAULT_META_VERSION, TIERS, isSelectableMetaVersion, migrateBuilderState, type BuilderState, type GameMode, type ImmortalPriorityOverrides, type ImmortalPriorityTier, type LockedAssignment, type MetaVersion, type RuneTier } from "../model";

interface BackupEnvelope {
  format: "ld-rune-builder-backup";
  version: 1;
  exportedAt: string;
  state: BuilderState;
}

const modes = new Set<GameMode>(["pve", "pvp", "guild"]);
const immortalIds = new Set(DATA.immortals.map((immortal) => immortal.id));

export function serializeBackup(state: BuilderState) {
  const envelope: BackupEnvelope = {
    format: "ld-rune-builder-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseBackup(text: string): BuilderState {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("This is not an LD Rune Builder backup file.");
  const container = parsed as Record<string, unknown>;
  const rawValue = container.format === "ld-rune-builder-backup" ? container.state : container;
  if (!rawValue || typeof rawValue !== "object") throw new Error("This is not an LD Rune Builder backup file.");
  const raw = rawValue as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || !raw.inventory || typeof raw.inventory !== "object") {
    throw new Error("This is not an LD Rune Builder backup file.");
  }

  const inventory: BuilderState["inventory"] = {};
  const rawInventory = raw.inventory as Record<string, unknown>;
  for (const rune of DATA.runes) {
    const rawTiers = rawInventory[rune.id];
    if (!rawTiers || typeof rawTiers !== "object") continue;
    for (const tier of TIERS) {
      const value = Number((rawTiers as Record<string, unknown>)[String(tier)]);
      if (!Number.isFinite(value) || value <= 0) continue;
      inventory[rune.id] ??= {};
      inventory[rune.id][tier] = Math.min(99, Math.floor(value));
    }
  }

  const selectedImmortalIds = Array.isArray(raw.selectedImmortalIds)
    ? raw.selectedImmortalIds.filter((id: unknown): id is string => typeof id === "string" && immortalIds.has(id))
    : DATA.immortals.map((immortal) => immortal.id);
  const lockedAssignments: LockedAssignment[] = Array.isArray(raw.lockedAssignments)
    ? raw.lockedAssignments.flatMap((value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const lock = value as Record<string, unknown>;
      const tier = Number(lock.tier) as RuneTier;
      const slot = Number(lock.slot);
      if (typeof lock.immortalId !== "string" || typeof lock.runeId !== "string" || !TIERS.includes(tier) || (slot !== 0 && slot !== 1)) return [];
      return [{ immortalId: lock.immortalId, runeId: lock.runeId, tier, slot } as LockedAssignment];
    })
    : [];
  const favoriteImmortalIds = Array.isArray(raw.favoriteImmortalIds)
    ? [...new Set(raw.favoriteImmortalIds.filter((id: unknown): id is string => typeof id === "string" && immortalIds.has(id)))]
    : [];
  const immortalPriorityOverrides: ImmortalPriorityOverrides = {};
  if (raw.immortalPriorityOverrides && typeof raw.immortalPriorityOverrides === "object") {
    for (const mode of modes) {
      const rawModeOverrides = (raw.immortalPriorityOverrides as Record<string, unknown>)[mode];
      if (!rawModeOverrides || typeof rawModeOverrides !== "object") continue;
      const validEntries = Object.entries(rawModeOverrides as Record<string, unknown>)
        .filter((entry): entry is [string, ImmortalPriorityTier] => immortalIds.has(entry[0]) && ["S", "A", "B", "C"].includes(entry[1] as string));
      if (validEntries.length > 0) immortalPriorityOverrides[mode] = Object.fromEntries(validEntries);
    }
  }
  const rawLevels = raw.immortalLevels && typeof raw.immortalLevels === "object" ? raw.immortalLevels as Record<string, unknown> : {};
  const immortalLevels = Object.fromEntries(DATA.immortals.filter((immortal) => immortal.limitBreak).map((immortal) => {
    const level = Number(rawLevels[immortal.id]);
    return [immortal.id, Number.isFinite(level) ? Math.max(15, Math.min(25, Math.floor(level))) : 15];
  }));
  const mode = modes.has(raw.mode as GameMode) ? raw.mode as GameMode : "pve";
  const metaVersion: MetaVersion = isSelectableMetaVersion(raw.metaVersion) ? raw.metaVersion : DEFAULT_META_VERSION;
  const metaVersionHasBeenSelected = raw.metaVersionHasBeenSelected === true;
  return migrateBuilderState({
    schemaVersion: 1,
    inventory,
    selectedImmortalIds,
    lockedAssignments,
    favoriteImmortalIds,
    immortalPriorityOverrides,
    immortalLevels,
    mode,
    metaVersion,
    metaVersionHasBeenSelected,
    updatedAt: new Date().toISOString(),
  });
}

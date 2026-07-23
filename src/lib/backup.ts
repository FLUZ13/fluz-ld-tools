import { DATA, TIERS, migrateBuilderState, type BuilderState, type GameMode, type MetaVersion } from "../model";

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
  const favoriteImmortalIds = Array.isArray(raw.favoriteImmortalIds)
    ? [...new Set(raw.favoriteImmortalIds.filter((id: unknown): id is string => typeof id === "string" && immortalIds.has(id)))]
    : [];
  const mode = modes.has(raw.mode as GameMode) ? raw.mode as GameMode : "pve";
  const metaVersion: MetaVersion = raw.metaVersion === "1.1" ? "1.1" : "1.0";
  return migrateBuilderState({
    schemaVersion: 1,
    inventory,
    selectedImmortalIds,
    favoriteImmortalIds,
    mode,
    metaVersion,
    updatedAt: new Date().toISOString(),
  });
}

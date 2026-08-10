import type { BuilderState } from "../model";

export type SyncConflictChoice = "device" | "cloud";

export function automaticSyncConflictChoice(device: BuilderState, cloud: BuilderState): SyncConflictChoice | null {
  if (JSON.stringify(device) === JSON.stringify(cloud)) return "cloud";

  const deviceUpdatedAt = Date.parse(device.updatedAt);
  const cloudUpdatedAt = Date.parse(cloud.updatedAt);
  if (!Number.isFinite(deviceUpdatedAt) || !Number.isFinite(cloudUpdatedAt) || deviceUpdatedAt === cloudUpdatedAt) return null;

  return deviceUpdatedAt > cloudUpdatedAt ? "device" : "cloud";
}

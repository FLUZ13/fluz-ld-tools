import { describe, expect, it } from "vitest";
import { createDefaultState } from "../model";
import { automaticSyncConflictChoice } from "./sync-resolution";

describe("automatic sync conflict resolution", () => {
  it("chooses the newer device state", () => {
    const device = createDefaultState();
    const cloud = createDefaultState();
    device.updatedAt = "2026-08-10T20:57:11.000Z";
    cloud.updatedAt = "2026-08-10T20:57:08.000Z";
    device.inventory.strength = { 7: 1 };

    expect(automaticSyncConflictChoice(device, cloud)).toBe("device");
  });

  it("chooses the newer cloud state", () => {
    const device = createDefaultState();
    const cloud = createDefaultState();
    device.updatedAt = "2026-08-10T20:57:08.000Z";
    cloud.updatedAt = "2026-08-10T20:57:11.000Z";
    cloud.inventory.magic = { 7: 1 };

    expect(automaticSyncConflictChoice(device, cloud)).toBe("cloud");
  });

  it("accepts identical states without asking", () => {
    const device = createDefaultState();
    expect(automaticSyncConflictChoice(device, structuredClone(device))).toBe("cloud");
  });

  it("keeps the dialog for genuinely ambiguous timestamps", () => {
    const device = createDefaultState();
    const cloud = createDefaultState();
    device.updatedAt = "2026-08-10T20:57:11.000Z";
    cloud.updatedAt = device.updatedAt;
    cloud.inventory.magic = { 7: 1 };

    expect(automaticSyncConflictChoice(device, cloud)).toBeNull();
    cloud.updatedAt = "invalid";
    expect(automaticSyncConflictChoice(device, cloud)).toBeNull();
  });
});

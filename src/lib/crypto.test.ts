import { describe, expect, it } from "vitest";
import { createDefaultState } from "../model";
import { createAnonymousWorkspace, decryptState, encryptState, formatSyncCode, parseSyncCode } from "./crypto";

describe("anonymous workspace crypto", () => {
  it("round-trips a builder state with AES-GCM", async () => {
    const workspace = createAnonymousWorkspace();
    const state = createDefaultState();
    state.inventory.strength = { 7: 2 };
    const encrypted = await encryptState(state, workspace);
    expect(encrypted.encryptedState).not.toContain("strength");
    await expect(decryptState(encrypted.encryptedState, workspace)).resolves.toEqual(state);
  });

  it("round-trips recovery codes and rejects malformed codes", () => {
    const workspace = createAnonymousWorkspace();
    expect(parseSyncCode(formatSyncCode(workspace))).toMatchObject({ workspaceId: workspace.workspaceId, masterKey: workspace.masterKey });
    expect(() => parseSyncCode("not-a-code")).toThrow();
  });
});

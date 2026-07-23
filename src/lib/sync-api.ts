import type { SyncWorkspace } from "./db";
import { encryptState, getAuthToken } from "./crypto";
import type { BuilderState } from "../model";

export interface RemoteSnapshot {
  encryptedState: string;
  revision: number;
  updatedAt: string;
}

export class SyncConflictError extends Error {
  constructor(public revision: number) {
    super("Cloud state changed on another device.");
  }
}

async function authorizedFetch(workspace: SyncWorkspace, path = "", init: RequestInit = {}) {
  const authToken = await getAuthToken(workspace);
  return fetch(`/api/sync/${encodeURIComponent(workspace.workspaceId)}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}`, ...init.headers },
  });
}

export async function getRemoteState(workspace: SyncWorkspace): Promise<RemoteSnapshot> {
  const response = await authorizedFetch(workspace, "", { method: "GET" });
  if (!response.ok) throw new Error(response.status === 404 ? "No saved workspace was found for that code." : "Could not load cloud state.");
  return response.json() as Promise<RemoteSnapshot>;
}

export async function putRemoteState(workspace: SyncWorkspace, state: BuilderState) {
  const { encryptedState } = await encryptState(state, workspace);
  const response = await authorizedFetch(workspace, "", {
    method: "PUT",
    body: JSON.stringify({ encryptedState, revision: workspace.revision }),
  });
  const body = await response.json() as { revision?: number; updatedAt?: string };
  if (response.status === 409) throw new SyncConflictError(body.revision ?? workspace.revision);
  if (!response.ok || body.revision == null) throw new Error("Could not save cloud state.");
  return { revision: body.revision, updatedAt: body.updatedAt ?? new Date().toISOString() };
}

export async function deleteRemoteState(workspace: SyncWorkspace) {
  const response = await authorizedFetch(workspace, "", { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error("Could not reset cloud state.");
}

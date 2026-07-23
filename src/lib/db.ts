import { openDB, type DBSchema } from "idb";
import type { BuilderState } from "../model";

export interface SyncWorkspace {
  workspaceId: string;
  masterKey: string;
  revision: number;
  createdAt: string;
}

export interface HistoryEntry {
  id?: number;
  state: BuilderState;
  createdAt: string;
  ownedCount: number;
  assignmentCount: number;
}

interface LDDatabase extends DBSchema {
  app: { key: string; value: { state: BuilderState; savedAt: string } };
  meta: { key: string; value: SyncWorkspace };
  history: {
    key: number;
    value: HistoryEntry;
    indexes: { "by-created-at": string };
  };
}

const database = openDB<LDDatabase>("ld-rune-builder", 1, {
  upgrade(db) {
    db.createObjectStore("app");
    db.createObjectStore("meta");
    const history = db.createObjectStore("history", { keyPath: "id", autoIncrement: true });
    history.createIndex("by-created-at", "createdAt");
  },
});

export async function loadState() {
  return (await database).get("app", "current");
}

export async function saveState(state: BuilderState) {
  await (await database).put("app", { state, savedAt: new Date().toISOString() }, "current");
}

export async function loadWorkspace() {
  return (await database).get("meta", "workspace");
}

export async function saveWorkspace(workspace: SyncWorkspace) {
  await (await database).put("meta", workspace, "workspace");
}

export async function appendHistory(entry: HistoryEntry) {
  const db = await database;
  const tx = db.transaction("history", "readwrite");
  await tx.store.add(entry);
  const keys = await tx.store.index("by-created-at").getAllKeys();
  for (const key of keys.slice(0, Math.max(0, keys.length - 50))) await tx.store.delete(key);
  await tx.done;
}

export async function listHistory() {
  const entries = await (await database).getAllFromIndex("history", "by-created-at");
  return entries.reverse();
}

export async function clearHistory() {
  await (await database).clear("history");
}

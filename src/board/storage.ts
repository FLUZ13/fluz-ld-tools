import { openDB, type DBSchema } from "idb";
import type { BoardState } from "./model";

interface BoardDatabase extends DBSchema {
  drafts: { key: string; value: BoardState };
  saved: { key: string; value: BoardState; indexes: { "by-updated": string } };
}

const dbPromise = openDB<BoardDatabase>("ld-board-builder", 1, {
  upgrade(db) {
    db.createObjectStore("drafts");
    const saved = db.createObjectStore("saved", { keyPath: "id" });
    saved.createIndex("by-updated", "updatedAt");
  },
});

export async function loadBoardDraft() {
  return (await dbPromise).get("drafts", "current");
}

export async function saveBoardDraft(board: BoardState) {
  await (await dbPromise).put("drafts", board, "current");
}

export async function saveBoardSnapshot(board: BoardState) {
  await (await dbPromise).put("saved", board);
}

export async function listBoardSnapshots() {
  const boards = await (await dbPromise).getAllFromIndex("saved", "by-updated");
  return boards.reverse().slice(0, 30);
}

export async function deleteBoardSnapshot(id: string) {
  await (await dbPromise).delete("saved", id);
}

export function getBoardOwnerKey() {
  const key = "ld-board-owner-key";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const created = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(key, created);
  return created;
}

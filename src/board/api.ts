import type { BoardState, PublishedBoard } from "./model";
import { getBoardOwnerKey } from "./storage";

export async function publishBoard(board: BoardState) {
  const response = await fetch("/api/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerKey: getBoardOwnerKey(), board }),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "Publishing is temporarily rate limited." : "Could not publish this board.");
  return response.json() as Promise<{ boardId: string }>;
}

export async function fetchPublishedBoards(before?: string) {
  const query = new URLSearchParams({ limit: "18" });
  if (before) query.set("before", before);
  const response = await fetch(`/api/boards?${query}`, { cache: "no-cache" });
  if (!response.ok) throw new Error("Could not load community boards.");
  return response.json() as Promise<{ boards: PublishedBoard[]; nextCursor: string | null }>;
}

import type { BoardState, PublishedBoard } from "./model";
import { getBoardOwnerKey } from "./storage";

type ApiErrorBody = { error?: string; requestId?: string };

export class BoardApiError extends Error {
  requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = "BoardApiError";
    this.requestId = requestId;
  }
}

async function apiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as ApiErrorBody;
  const requestId = body.requestId ?? response.headers.get("X-Request-ID") ?? undefined;
  return new BoardApiError(body.error || fallback, requestId);
}

export async function publishBoard(board: BoardState) {
  const response = await fetch("/api/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerKey: getBoardOwnerKey(), board }),
  });
  if (!response.ok) throw await apiError(response, response.status === 429 ? "Publishing is temporarily rate limited." : "Could not publish this board.");
  return response.json() as Promise<{ boardId: string }>;
}

export interface PublishedBoardFilters {
  before?: string;
  map?: string;
  players?: "1" | "2";
  query?: string;
  signal?: AbortSignal;
}

export async function fetchPublishedBoards(filters: PublishedBoardFilters = {}) {
  const query = new URLSearchParams({ limit: "18", v: "3" });
  if (filters.before) query.set("before", filters.before);
  if (filters.map) query.set("map", filters.map);
  if (filters.players) query.set("players", filters.players);
  if (filters.query?.trim()) query.set("q", filters.query.trim().slice(0, 60));
  const response = await fetch(`/api/boards?${query}`, { cache: "no-cache", signal: filters.signal });
  if (!response.ok) throw await apiError(response, "Could not load community boards.");
  return response.json() as Promise<{ boards: PublishedBoard[]; nextCursor: string | null }>;
}

export async function reportPublishedBoard(boardId: string, reason: "spam" | "inappropriate" | "broken") {
  const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reporterKey: getBoardOwnerKey(), reason }),
  });
  if (!response.ok) throw await apiError(response, "Could not report this board.");
}

export interface PublishedBoardComment {
  commentId: string;
  body: string;
  createdAt: string;
}

export async function fetchPublishedBoardComments(boardId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/comments`, { cache: "no-cache", signal });
  if (!response.ok) throw await apiError(response, "Could not load board comments.");
  return response.json() as Promise<{ comments: PublishedBoardComment[] }>;
}

export async function postPublishedBoardComment(boardId: string, body: string) {
  const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commenterKey: getBoardOwnerKey(), body }),
  });
  if (!response.ok) throw await apiError(response, response.status === 429 ? "Comments are temporarily rate limited." : "Could not post this comment.");
  return response.json() as Promise<{ comment: PublishedBoardComment }>;
}

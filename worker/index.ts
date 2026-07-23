import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_BODY_BYTES = 96 * 1024;
const HISTORY_LIMIT = 20;
const syncPrefix = "sync/";
const workspacePattern = /^\/api\/sync\/([0-9a-f-]{36})(?:\/(history|restore))?$/i;
const writeSchema = z.object({
  encryptedState: z.string().min(24).max(90_000).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  revision: z.number().int().min(0),
});
const restoreSchema = z.object({ revision: z.number().int().positive(), currentRevision: z.number().int().min(0) });
const boardMapSchema = z.enum(["hard", "hell", "god", "primeval", "invasion", "guild", "extreme"]);
const guardianSchema = z.string().regex(/^\d{4,5}$/).nullable();
const slotsSchema = z.array(z.array(guardianSchema).length(18)).length(2);
const boardSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  map: boardMapSchema,
  players: z.union([z.literal(1), z.literal(2)]),
  slots: slotsSchema,
  updatedAt: z.string().datetime(),
});
const publishBoardSchema = z.object({ ownerKey: z.string().regex(/^[a-f0-9]{48}$/), board: boardSchema });

function json(body: unknown, status = 200, cacheControl = "no-store") {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

async function readJson(request: Request) {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Response(null, { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Response(null, { status: 413 });
  return JSON.parse(text) as unknown;
}

type WorkspaceRecord = { authVerifier: string; revision: number; updatedAt: string };
type WorkspaceAuth = { record: WorkspaceRecord; object: R2Object } | { record: null; verifier: string } | { record: false; verifier: string };

function workspaceKey(workspaceId: string) { return `${syncPrefix}${workspaceId}/current`; }
function historyPrefix(workspaceId: string) { return `${syncPrefix}${workspaceId}/history/`; }
function historyKey(workspaceId: string, revision: number) { return `${historyPrefix(workspaceId)}${revision.toString().padStart(12, "0")}`; }

function workspaceRecord(object: R2Object): WorkspaceRecord | null {
  const metadata = object.customMetadata ?? {};
  const revision = Number(metadata.revision);
  if (!metadata.authVerifier || !Number.isSafeInteger(revision) || revision < 1 || !metadata.updatedAt) return null;
  return { authVerifier: metadata.authVerifier, revision, updatedAt: metadata.updatedAt };
}

function workspaceMetadata(record: WorkspaceRecord) {
  return { authVerifier: record.authVerifier, revision: String(record.revision), updatedAt: record.updatedAt };
}

async function migrateLegacyWorkspace(env: Env, workspaceId: string, verifier: string) {
  const legacy = await env.DB.prepare(
    "SELECT auth_verifier, revision, encrypted_state, updated_at FROM anonymous_workspaces WHERE workspace_id = ?",
  ).bind(workspaceId).first<{ auth_verifier: string; revision: number; encrypted_state: string; updated_at: string }>();
  if (!legacy) return null;
  if (!secureEqual(legacy.auth_verifier, verifier)) return false as const;

  const history = await env.DB.prepare(
    "SELECT revision, encrypted_state, created_at FROM workspace_history WHERE workspace_id = ? ORDER BY revision DESC LIMIT ?",
  ).bind(workspaceId, HISTORY_LIMIT).all<{ revision: number; encrypted_state: string; created_at: string }>();
  await Promise.all(history.results.map((snapshot) => env.SYNC_BUCKET.put(
    historyKey(workspaceId, snapshot.revision),
    snapshot.encrypted_state,
    { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { createdAt: snapshot.created_at } },
  )));
  const record: WorkspaceRecord = { authVerifier: legacy.auth_verifier, revision: legacy.revision, updatedAt: legacy.updated_at };
  return env.SYNC_BUCKET.put(workspaceKey(workspaceId), legacy.encrypted_state, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: workspaceMetadata(record),
  });
}

async function authenticateWorkspace(env: Env, workspaceId: string, token: string): Promise<WorkspaceAuth> {
  const verifier = await sha256(token);
  let object = await env.SYNC_BUCKET.head(workspaceKey(workspaceId));
  if (!object) {
    const migrated = await migrateLegacyWorkspace(env, workspaceId, verifier);
    if (migrated === false) return { record: false, verifier };
    object = migrated;
  }
  if (!object) return { record: null, verifier };
  const record = workspaceRecord(object);
  if (!record) throw new Error("Invalid sync workspace metadata");
  if (!secureEqual(record.authVerifier, verifier)) return { record: false, verifier };
  return { record, object };
}

async function writeHistory(env: Env, workspaceId: string, revision: number, encryptedState: string, createdAt: string) {
  await env.SYNC_BUCKET.put(historyKey(workspaceId, revision), encryptedState, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { createdAt },
  });
}

async function pruneHistory(env: Env, workspaceId: string) {
  const history = await env.SYNC_BUCKET.list({ prefix: historyPrefix(workspaceId), limit: HISTORY_LIMIT + 1 });
  const stale = history.objects.slice(0, Math.max(0, history.objects.length - HISTORY_LIMIT)).map((object) => object.key);
  if (stale.length) await env.SYNC_BUCKET.delete(stale);
}

async function replaceCurrentWorkspace(env: Env, workspaceId: string, object: R2Object, record: WorkspaceRecord, encryptedState: string) {
  const result = await env.SYNC_BUCKET.put(workspaceKey(workspaceId), encryptedState, {
    onlyIf: { etagMatches: object.etag },
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: workspaceMetadata(record),
  });
  return result;
}

async function handleSync(request: Request, env: Env, workspaceId: string, action?: string) {
  const rateLimit = await env.SYNC_RATE_LIMITER.limit({ key: workspaceId });
  if (!rateLimit.success) return json({ error: "Rate limit exceeded" }, 429);

  const token = bearerToken(request);
  if (!token) return json({ error: "Unauthorized" }, 401);
  const auth = await authenticateWorkspace(env, workspaceId, token);
  if (auth.record === false) return json({ error: "Unauthorized" }, 401);

  if (request.method === "GET" && action === "history") {
    if (!auth.record) return json({ error: "Not found" }, 404);
    const history = await env.SYNC_BUCKET.list({ prefix: historyPrefix(workspaceId), limit: HISTORY_LIMIT });
    const entries = history.objects
      .map((object) => ({ revision: Number(object.key.slice(historyPrefix(workspaceId).length)), createdAt: object.uploaded.toISOString() }))
      .filter((entry) => Number.isSafeInteger(entry.revision))
      .sort((left, right) => right.revision - left.revision);
    return json({ history: entries });
  }

  if (request.method === "GET" && !action) {
    if (!auth.record) return json({ error: "Not found" }, 404);
    const object = await env.SYNC_BUCKET.get(workspaceKey(workspaceId));
    if (!object || !object.body) return json({ error: "Not found" }, 404);
    return json({ encryptedState: await object.text(), revision: auth.record.revision, updatedAt: auth.record.updatedAt });
  }

  if (request.method === "PUT" && !action) {
    let parsed;
    try { parsed = writeSchema.parse(await readJson(request)); }
    catch (error) {
      if (error instanceof Response) return error;
      return json({ error: "Invalid encrypted state" }, 400);
    }
    const now = new Date().toISOString();
    if (!auth.record) {
      if (parsed.revision !== 0) return json({ error: "Not found" }, 404);
      const record: WorkspaceRecord = { authVerifier: auth.verifier, revision: 1, updatedAt: now };
      await writeHistory(env, workspaceId, record.revision, parsed.encryptedState, now);
      const created = await env.SYNC_BUCKET.put(workspaceKey(workspaceId), parsed.encryptedState, {
        onlyIf: new Headers({ "If-None-Match": "*" }),
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: workspaceMetadata(record),
      });
      if (!created) return json({ error: "Revision conflict", revision: 1 }, 409);
      return json({ revision: record.revision, updatedAt: now }, 201);
    }
    if (parsed.revision !== auth.record.revision) return json({ error: "Revision conflict", revision: auth.record.revision }, 409);
    const record: WorkspaceRecord = { ...auth.record, revision: auth.record.revision + 1, updatedAt: now };
    await writeHistory(env, workspaceId, record.revision, parsed.encryptedState, now);
    const updated = await replaceCurrentWorkspace(env, workspaceId, auth.object, record, parsed.encryptedState);
    if (!updated) return json({ error: "Revision conflict", revision: auth.record.revision }, 409);
    await pruneHistory(env, workspaceId);
    return json({ revision: record.revision, updatedAt: now });
  }

  if (request.method === "POST" && action === "restore") {
    if (!auth.record) return json({ error: "Not found" }, 404);
    let parsed;
    try { parsed = restoreSchema.parse(await readJson(request)); }
    catch (error) {
      if (error instanceof Response) return error;
      return json({ error: "Invalid restore request" }, 400);
    }
    if (parsed.currentRevision !== auth.record.revision) return json({ error: "Revision conflict", revision: auth.record.revision }, 409);
    const snapshot = await env.SYNC_BUCKET.get(historyKey(workspaceId, parsed.revision));
    if (!snapshot || !snapshot.body) return json({ error: "History revision not found" }, 404);
    const encryptedState = await snapshot.text();
    const now = new Date().toISOString();
    const record: WorkspaceRecord = { ...auth.record, revision: auth.record.revision + 1, updatedAt: now };
    await writeHistory(env, workspaceId, record.revision, encryptedState, now);
    const updated = await replaceCurrentWorkspace(env, workspaceId, auth.object, record, encryptedState);
    if (!updated) return json({ error: "Revision conflict", revision: auth.record.revision }, 409);
    await pruneHistory(env, workspaceId);
    return json({ revision: record.revision, updatedAt: now });
  }

  if (request.method === "DELETE" && !action) {
    if (!auth.record) return json({ deleted: true });
    const history = await env.SYNC_BUCKET.list({ prefix: historyPrefix(workspaceId), limit: 1000 });
    await env.SYNC_BUCKET.delete([workspaceKey(workspaceId), ...history.objects.map((object) => object.key)]);
    return json({ deleted: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleBoards(request: Request, env: Env, url: URL) {
  if (request.method === "GET") {
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit")) || 18));
    const before = url.searchParams.get("before");
    if (before && !/^\d{4}-\d{2}-\d{2}T/.test(before)) return json({ error: "Invalid cursor" }, 400);
    const query = before
      ? env.DB.prepare("SELECT board_id AS boardId, title, map, players, state_json AS stateJson, updated_at AS updatedAt FROM community_boards WHERE updated_at < ? ORDER BY updated_at DESC LIMIT ?").bind(before, limit)
      : env.DB.prepare("SELECT board_id AS boardId, title, map, players, state_json AS stateJson, updated_at AS updatedAt FROM community_boards ORDER BY updated_at DESC LIMIT ?").bind(limit);
    const result = await query.all<{ boardId: string; title: string; map: string; players: number; stateJson: string; updatedAt: string }>();
    const boards = result.results.map((row) => {
      const state = JSON.parse(row.stateJson) as z.infer<typeof boardSchema>;
      return { boardId: row.boardId, title: row.title, map: row.map, players: row.players, slots: state.slots, updatedAt: row.updatedAt };
    });
    const nextCursor = boards.length === limit ? boards.at(-1)?.updatedAt ?? null : null;
    return json({ boards, nextCursor }, 200, "public, max-age=30, stale-while-revalidate=120");
  }

  if (request.method === "POST") {
    let parsed: z.infer<typeof publishBoardSchema>;
    try { parsed = publishBoardSchema.parse(await readJson(request)); }
    catch (error) {
      if (error instanceof Response) return error;
      return json({ error: "Invalid board" }, 400);
    }
    const ownerHash = await sha256(parsed.ownerKey);
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
    const [ownerRateLimit, ipRateLimit] = await Promise.all([
      env.SYNC_RATE_LIMITER.limit({ key: `board:${ownerHash}` }),
      env.SYNC_RATE_LIMITER.limit({ key: `board-ip:${clientIp}` }),
    ]);
    if (!ownerRateLimit.success || !ipRateLimit.success) return json({ error: "Rate limit exceeded" }, 429);
    const existing = await env.DB.prepare("SELECT board_id FROM community_boards WHERE owner_hash = ?").bind(ownerHash).first<{ board_id: string }>();
    const boardId = existing?.board_id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const stateJson = JSON.stringify(parsed.board);
    if (existing) {
      await env.DB.prepare("UPDATE community_boards SET title = ?, map = ?, players = ?, state_json = ?, updated_at = ? WHERE owner_hash = ?")
        .bind(parsed.board.title, parsed.board.map, parsed.board.players, stateJson, now, ownerHash).run();
    } else {
      await env.DB.prepare("INSERT INTO community_boards (board_id, owner_hash, title, map, players, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(boardId, ownerHash, parsed.board.title, parsed.board.map, parsed.board.players, stateJson, now, now).run();
    }
    await env.DB.prepare("DELETE FROM community_boards WHERE updated_at < datetime('now', '-90 days')").run();
    return json({ boardId, updatedAt: now }, existing ? 200 : 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, service: "fluz-ld-tools" });
    if (url.pathname === "/api/boards") {
      try { return await handleBoards(request, env, url); }
      catch (error) {
        console.error(JSON.stringify({ event: "boards_error", error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Internal error" }, 500);
      }
    }
    const match = workspacePattern.exec(url.pathname);
    if (!match) return json({ error: "Not found" }, 404);
    try {
      return await handleSync(request, env, match[1], match[2]);
    } catch (error) {
      console.error(JSON.stringify({ event: "sync_error", path: url.pathname, error: error instanceof Error ? error.message : "unknown" }));
      return json({ error: "Internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

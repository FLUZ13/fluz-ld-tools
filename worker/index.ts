import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_BODY_BYTES = 96 * 1024;
const HISTORY_LIMIT = 20;
const BOARD_SHARE_COOLDOWN_MS = 5 * 60 * 1000;
const syncPrefix = "sync/";
const workspacePattern = /^\/api\/sync\/([0-9a-f-]{36})(?:\/(history|restore))?$/i;
const writeSchema = z.object({
  encryptedState: z.string().min(24).max(90_000).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  revision: z.number().int().min(0),
});
const restoreSchema = z.object({ revision: z.number().int().positive(), currentRevision: z.number().int().min(0) });
const boardMapSchema = z.enum(["normal", "hard-red", "hell", "god", "primeval", "invasion", "guild", "extreme"]);
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
const reportBoardSchema = z.object({
  reporterKey: z.string().regex(/^[a-f0-9]{48}$/),
  reason: z.enum(["spam", "inappropriate", "broken"]),
});
const boardCommentSchema = z.object({
  commenterKey: z.string().regex(/^[a-f0-9]{48}$/),
  body: z.string().trim().min(1).max(500),
});
const boardReportPattern = /^\/api\/boards\/([0-9a-f-]{36})\/report$/i;
const boardCommentPattern = /^\/api\/boards\/([0-9a-f-]{36})\/comments$/i;
const moderatorSessionPattern = /^\/api\/moderator\/session$/;
const moderatorLoginPattern = /^\/api\/moderator\/login$/;
const moderatorLogoutPattern = /^\/api\/moderator\/logout$/;
const moderatorBoardPattern = /^\/api\/moderator\/boards\/([0-9a-f-]{36})$/i;
const moderatorCommentPattern = /^\/api\/moderator\/boards\/([0-9a-f-]{36})\/comments\/([0-9a-f-]{36})$/i;
const moderatorLoginSchema = z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(512) });
const moderatorSessionLifetimeSeconds = 60 * 60 * 12;
const moderatorSessionCookie = "__Host-ld-moderator";
type ModeratorEnv = Env & { MODERATOR_USERNAME?: string; MODERATOR_PASSWORD?: string; MODERATOR_SESSION_SECRET?: string };

export class PresenceCounter {
  constructor(private readonly state: DurableObjectState) {
    // Retire the former heartbeat data; the visitor total stores no identifiers.
    this.state.storage.sql.exec("DROP TABLE IF EXISTS presence");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS visitor_totals (id INTEGER PRIMARY KEY, total INTEGER NOT NULL)");
    this.state.storage.sql.exec("INSERT OR IGNORE INTO visitor_totals (id, total) VALUES (1, 0)");
  }

  async fetch(request: Request): Promise<Response> {
    if (!['GET', 'POST'].includes(request.method) || new URL(request.url).pathname !== "/total") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (request.method === "POST") this.state.storage.sql.exec("UPDATE visitor_totals SET total = total + 1 WHERE id = 1");
    const [{ total = 0 } = {}] = this.state.storage.sql.exec<{ total: number }>("SELECT total FROM visitor_totals WHERE id = 1").toArray();
    return Response.json({ total }, { headers: { "Cache-Control": "no-store" } });
  }
}

function json(body: unknown, status = 200, cacheControl = "no-store", requestId = crypto.randomUUID()) {
  const payload = body && typeof body === "object" && "error" in body
    ? { ...body, requestId }
    : body;
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Request-ID": requestId,
    },
  });
}

function jsonWithHeaders(body: unknown, status = 200, cacheControl = "no-store", requestId = crypto.randomUUID(), headers: Record<string, string> = {}) {
  const response = json(body, status, cacheControl, requestId);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatShareCooldown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

async function claimBoardShareCooldown(env: Env, ownerHash: string) {
  const now = Date.now();
  const cooldownUntil = now + BOARD_SHARE_COOLDOWN_MS;
  const result = await env.DB.prepare(
    "INSERT INTO board_share_cooldowns (owner_hash, cooldown_until) VALUES (?, ?) ON CONFLICT(owner_hash) DO UPDATE SET cooldown_until = excluded.cooldown_until WHERE board_share_cooldowns.cooldown_until <= ?",
  ).bind(ownerHash, cooldownUntil, now).run();

  if ((result.meta.changes ?? 0) === 1) return { accepted: true, cooldownUntil };

  const existing = await env.DB.prepare("SELECT cooldown_until FROM board_share_cooldowns WHERE owner_hash = ?")
    .bind(ownerHash)
    .first<{ cooldown_until: number }>();
  return { accepted: false, cooldownUntil: existing?.cooldown_until ?? cooldownUntil };
}

function secureEqual(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function secureTextEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function matchesSecret(value: string, expected: string) {
  const [left, right] = await Promise.all([sha256(value), sha256(expected)]);
  return secureEqual(left, right);
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

function signModeratorSession(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createModeratorSession(secret: string) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + moderatorSessionLifetimeSeconds, nonce: crypto.randomUUID() })).toString("base64url");
  return `${payload}.${signModeratorSession(payload, secret)}`;
}

function moderatorCookie(value: string, maxAge = moderatorSessionLifetimeSeconds) {
  return `${moderatorSessionCookie}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function expiredModeratorCookie() { return `${moderatorSessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`; }

async function isModerator(request: Request, env: ModeratorEnv) {
  const secret = env.MODERATOR_SESSION_SECRET;
  const token = readCookie(request, moderatorSessionCookie);
  if (!secret || !token) return false;
  const splitAt = token.lastIndexOf(".");
  if (splitAt <= 0) return false;
  const payload = token.slice(0, splitAt);
  if (!secureTextEqual(token.slice(splitAt + 1), signModeratorSession(payload, secret))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof data.exp === "number" && Number.isSafeInteger(data.exp) && data.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

async function readJson(request: Request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw json({ error: "Content-Type must be application/json" }, 415);
  }
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw json({ error: "Request body too large" }, 413);
  const reader = request.body?.getReader();
  if (!reader) return JSON.parse("") as unknown;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw json({ error: "Request body too large" }, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

type WorkspaceRecord = { authVerifier: string; revision: number; updatedAt: string };
type WorkspaceAuth = { record: WorkspaceRecord; object: R2Object } | { record: null; verifier: string } | { record: false; verifier: string };

function workspaceKey(workspaceId: string) { return `${syncPrefix}${workspaceId}/current`; }
function historyPrefix(workspaceId: string) { return `${syncPrefix}${workspaceId}/history/`; }
function historyKey(workspaceId: string, revision: number) { return `${historyPrefix(workspaceId)}${revision.toString().padStart(12, "0")}`; }

function workspaceRecord(object: R2Object): WorkspaceRecord | null {
  const metadata = object.customMetadata ?? {};
  const revision = Number(metadata.revision);
  if (!metadata.authVerifier || !/^[a-f0-9]{64}$/.test(metadata.authVerifier) ||
    !Number.isSafeInteger(revision) || revision < 1 || !metadata.updatedAt ||
    Number.isNaN(Date.parse(metadata.updatedAt))) return null;
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
  for (const snapshot of history.results) {
    await env.SYNC_BUCKET.put(
      historyKey(workspaceId, snapshot.revision),
      snapshot.encrypted_state,
      { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { createdAt: snapshot.created_at } },
    );
  }
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

async function pruneHistory(env: Env, workspaceId: string, revision: number) {
  const staleRevision = revision - HISTORY_LIMIT;
  if (staleRevision > 0) await env.SYNC_BUCKET.delete(historyKey(workspaceId, staleRevision));
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
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const [workspaceRateLimit, ipRateLimit] = await Promise.all([
    env.SYNC_RATE_LIMITER.limit({ key: `sync:${workspaceId}` }),
    env.SYNC_RATE_LIMITER.limit({ key: `sync-ip:${clientIp}` }),
  ]);
  if (!workspaceRateLimit.success || !ipRateLimit.success) return json({ error: "Rate limit exceeded" }, 429);
  if (request.method !== "GET") {
    const [workspaceWriteLimit, ipWriteLimit] = await Promise.all([
      env.WRITE_RATE_LIMITER.limit({ key: `sync-write:${workspaceId}` }),
      env.WRITE_RATE_LIMITER.limit({ key: `sync-write-ip:${clientIp}` }),
    ]);
    if (!workspaceWriteLimit.success || !ipWriteLimit.success) return json({ error: "Write rate limit exceeded" }, 429);
  }

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
      const created = await env.SYNC_BUCKET.put(workspaceKey(workspaceId), parsed.encryptedState, {
        onlyIf: new Headers({ "If-None-Match": "*" }),
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: workspaceMetadata(record),
      });
      if (!created) return json({ error: "Revision conflict", revision: 1 }, 409);
      await writeHistory(env, workspaceId, record.revision, parsed.encryptedState, now);
      return json({ revision: record.revision, updatedAt: now }, 201);
    }
    if (parsed.revision !== auth.record.revision) return json({ error: "Revision conflict", revision: auth.record.revision }, 409);
    const record: WorkspaceRecord = { ...auth.record, revision: auth.record.revision + 1, updatedAt: now };
    const updated = await replaceCurrentWorkspace(env, workspaceId, auth.object, record, parsed.encryptedState);
    if (!updated) return json({ error: "Revision conflict", revision: auth.record.revision }, 409);
    await writeHistory(env, workspaceId, record.revision, parsed.encryptedState, now);
    await pruneHistory(env, workspaceId, record.revision);
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
    const updated = await replaceCurrentWorkspace(env, workspaceId, auth.object, record, encryptedState);
    if (!updated) return json({ error: "Revision conflict", revision: auth.record.revision }, 409);
    await writeHistory(env, workspaceId, record.revision, encryptedState, now);
    await pruneHistory(env, workspaceId, record.revision);
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

async function invalidateBoardListCache(request: Request, ctx: ExecutionContext) {
  // Cache invalidation is helpful, but a Cache API hiccup must never turn a
  // successfully saved board, report, or comment into a failed request.
  ctx.waitUntil((async () => {
    try {
      const boardCache = await caches.open("community-boards");
      const cached = await boardCache.keys();
      const boardListEntries = cached.filter((entry) => new URL(entry.url).pathname === "/api/boards");
      await Promise.all(boardListEntries.map((entry) => boardCache.delete(entry)));
    } catch (error) {
      console.warn(JSON.stringify({ event: "board_cache_invalidation_error", error: error instanceof Error ? error.message : "unknown" }));
    }
  })());
}

async function handleBoards(request: Request, env: Env, url: URL, ctx: ExecutionContext) {
  if (request.method === "GET") {
    const boardCache = await caches.open("community-boards");
    const cached = await boardCache.match(request);
    if (cached) return cached;
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit")) || 18));
    const before = url.searchParams.get("before");
    if (before && Number.isNaN(Date.parse(before))) return json({ error: "Invalid cursor" }, 400);
    const requestedMap = url.searchParams.get("map");
    const parsedMap = requestedMap ? boardMapSchema.safeParse(requestedMap) : null;
    if (parsedMap && !parsedMap.success) return json({ error: "Invalid map filter" }, 400);
    const requestedPlayers = url.searchParams.get("players");
    if (requestedPlayers && requestedPlayers !== "1" && requestedPlayers !== "2") return json({ error: "Invalid layout filter" }, 400);
    const search = (url.searchParams.get("q") ?? "").trim().slice(0, 60).toLowerCase();
    const conditions = ["b.report_count < 3"];
    const bindings: Array<string | number> = [];
    if (before) { conditions.push("b.updated_at < ?"); bindings.push(before); }
    if (parsedMap?.success) { conditions.push("b.map = ?"); bindings.push(parsedMap.data); }
    if (requestedPlayers) { conditions.push("b.players = ?"); bindings.push(Number(requestedPlayers)); }
    if (search) {
      conditions.push("LOWER(b.title) LIKE ? ESCAPE '\\'");
      bindings.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    }
    const statement = `SELECT b.board_id AS boardId, b.title, b.map, b.players, b.state_json AS stateJson, b.updated_at AS updatedAt, (SELECT COUNT(*) FROM community_board_comments c WHERE c.board_id = b.board_id) AS commentCount FROM community_boards b WHERE ${conditions.join(" AND ")} ORDER BY b.updated_at DESC LIMIT ?`;
    const query = env.DB.prepare(statement).bind(...bindings, limit);
    const result = await query.all<{ boardId: string; title: string; map: string; players: number; stateJson: string; updatedAt: string; commentCount: number }>();
    const boards = result.results.flatMap((row) => {
      try {
        const state = boardSchema.safeParse(JSON.parse(row.stateJson));
        if (!state.success) return [];
        return [{ boardId: row.boardId, title: row.title, map: row.map, players: row.players, slots: state.data.slots, updatedAt: row.updatedAt, commentCount: Number(row.commentCount) || 0 }];
      } catch {
        return [];
      }
    });
    const nextCursor = boards.length === limit ? boards.at(-1)?.updatedAt ?? null : null;
    const response = json({ boards, nextCursor }, 200, "public, max-age=30, stale-while-revalidate=120");
    ctx.waitUntil(boardCache.put(request, response.clone()));
    return response;
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
      env.WRITE_RATE_LIMITER.limit({ key: `board:${ownerHash}` }),
      env.WRITE_RATE_LIMITER.limit({ key: `board-ip:${clientIp}` }),
    ]);
    if (!ownerRateLimit.success || !ipRateLimit.success) return json({ error: "Rate limit exceeded" }, 429);
    const cooldown = await claimBoardShareCooldown(env, ownerHash);
    if (!cooldown.accepted) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldown.cooldownUntil - Date.now()) / 1000));
      return json({
        error: `You can share another board in ${formatShareCooldown(retryAfterSeconds)}.`,
        retryAfterSeconds,
        cooldownUntil: new Date(cooldown.cooldownUntil).toISOString(),
      }, 429);
    }
    const boardId = crypto.randomUUID();
    const now = new Date().toISOString();
    const stateJson = JSON.stringify(parsed.board);
    try {
      await env.DB.prepare("INSERT INTO community_boards (board_id, owner_hash, title, map, players, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(boardId, ownerHash, parsed.board.title, parsed.board.map, parsed.board.players, stateJson, now, now).run();
    } catch (error) {
      await env.DB.prepare("DELETE FROM board_share_cooldowns WHERE owner_hash = ? AND cooldown_until = ?")
        .bind(ownerHash, cooldown.cooldownUntil)
        .run()
        .catch(() => undefined);
      throw error;
    }
    await invalidateBoardListCache(request, ctx);
    return json({ boardId, updatedAt: now, cooldownUntil: new Date(cooldown.cooldownUntil).toISOString() }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleBoardReport(request: Request, env: Env, boardId: string, ctx: ExecutionContext) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let parsed: z.infer<typeof reportBoardSchema>;
  try { parsed = reportBoardSchema.parse(await readJson(request)); }
  catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Invalid report" }, 400);
  }
  const reporterHash = await sha256(parsed.reporterKey);
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const [reporterLimit, ipLimit] = await Promise.all([
    env.WRITE_RATE_LIMITER.limit({ key: `board-report:${reporterHash}` }),
    env.WRITE_RATE_LIMITER.limit({ key: `board-report-ip:${clientIp}` }),
  ]);
  if (!reporterLimit.success || !ipLimit.success) return json({ error: "Report rate limit exceeded" }, 429);
  const board = await env.DB.prepare("SELECT owner_hash FROM community_boards WHERE board_id = ?").bind(boardId).first<{ owner_hash: string }>();
  if (!board) return json({ error: "Board not found" }, 404);
  if (secureEqual(board.owner_hash, reporterHash)) return json({ error: "You cannot report your own board" }, 400);
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO community_board_reports (board_id, reporter_hash, reason, created_at) VALUES (?, ?, ?, ?)")
    .bind(boardId, reporterHash, parsed.reason, new Date().toISOString()).run();
  if ((inserted.meta.changes ?? 0) > 0) {
    await env.DB.prepare("UPDATE community_boards SET report_count = report_count + 1 WHERE board_id = ?").bind(boardId).run();
    await invalidateBoardListCache(request, ctx);
  }
  return json({ reported: true });
}

async function handleBoardComments(request: Request, env: Env, boardId: string, ctx: ExecutionContext) {
  if (request.method === "GET") {
    const board = await env.DB.prepare("SELECT 1 FROM community_boards WHERE board_id = ? AND report_count < 3").bind(boardId).first();
    if (!board) return json({ error: "Board not found" }, 404);
    const result = await env.DB.prepare("SELECT comment_id AS commentId, body, created_at AS createdAt FROM community_board_comments WHERE board_id = ? ORDER BY created_at ASC LIMIT 40")
      .bind(boardId).all<{ commentId: string; body: string; createdAt: string }>();
    return json({ comments: result.results }, 200, "public, max-age=20, stale-while-revalidate=60");
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let parsed: z.infer<typeof boardCommentSchema>;
  try { parsed = boardCommentSchema.parse(await readJson(request)); }
  catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Invalid comment" }, 400);
  }
  const commenterHash = await sha256(parsed.commenterKey);
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const [commenterLimit, ipLimit] = await Promise.all([
    env.WRITE_RATE_LIMITER.limit({ key: `board-comment:${commenterHash}` }),
    env.WRITE_RATE_LIMITER.limit({ key: `board-comment-ip:${clientIp}` }),
  ]);
  if (!commenterLimit.success || !ipLimit.success) return json({ error: "Comment rate limit exceeded" }, 429);
  const board = await env.DB.prepare("SELECT 1 FROM community_boards WHERE board_id = ? AND report_count < 3").bind(boardId).first();
  if (!board) return json({ error: "Board not found" }, 404);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM community_board_comments WHERE commenter_hash = ? AND created_at > ?")
    .bind(commenterHash, hourAgo).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 10) return json({ error: "You can post up to 10 comments per hour" }, 429);
  const comment = { commentId: crypto.randomUUID(), body: parsed.body, createdAt: new Date().toISOString() };
  await env.DB.prepare("INSERT INTO community_board_comments (comment_id, board_id, commenter_hash, body, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(comment.commentId, boardId, commenterHash, comment.body, comment.createdAt).run();
  await invalidateBoardListCache(request, ctx);
  return json({ comment }, 201);
}

async function handleModeratorLogin(request: Request, env: ModeratorEnv) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  if (!env.MODERATOR_USERNAME || !env.MODERATOR_PASSWORD || !env.MODERATOR_SESSION_SECRET) {
    return json({ error: "Moderator access is unavailable" }, 503);
  }

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const rate = await env.WRITE_RATE_LIMITER.limit({ key: `moderator-login:${clientIp}` });
  if (!rate.success) return json({ error: "Too many sign-in attempts. Try again shortly." }, 429);

  let parsed: z.infer<typeof moderatorLoginSchema>;
  try { parsed = moderatorLoginSchema.parse(await readJson(request)); }
  catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Invalid credentials" }, 401);
  }

  const [usernameOk, passwordOk] = await Promise.all([
    matchesSecret(parsed.username, env.MODERATOR_USERNAME),
    matchesSecret(parsed.password, env.MODERATOR_PASSWORD),
  ]);
  if (!usernameOk || !passwordOk) return json({ error: "Invalid credentials" }, 401);

  const session = createModeratorSession(env.MODERATOR_SESSION_SECRET);
  return jsonWithHeaders(
    { authenticated: true, expiresIn: moderatorSessionLifetimeSeconds },
    200,
    "no-store",
    crypto.randomUUID(),
    { "Set-Cookie": moderatorCookie(session) },
  );
}

async function handleModeratorSession(request: Request, env: ModeratorEnv) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  return json({ authenticated: await isModerator(request, env) });
}

async function handleModeratorLogout(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  return jsonWithHeaders(
    { authenticated: false },
    200,
    "no-store",
    crypto.randomUUID(),
    { "Set-Cookie": expiredModeratorCookie() },
  );
}

async function handleModeratorBoard(request: Request, env: ModeratorEnv, boardId: string, ctx: ExecutionContext) {
  if (request.method !== "DELETE") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  if (!(await isModerator(request, env))) return json({ error: "Moderator authentication required" }, 401);

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const rate = await env.WRITE_RATE_LIMITER.limit({ key: `moderator-board-delete:${clientIp}` });
  if (!rate.success) return json({ error: "Too many moderation requests. Try again shortly." }, 429);

  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM community_board_comments WHERE board_id = ?1").bind(boardId),
    env.DB.prepare("DELETE FROM community_board_reports WHERE board_id = ?1").bind(boardId),
    env.DB.prepare("DELETE FROM community_boards WHERE board_id = ?1").bind(boardId),
  ]);
  if ((results[2].meta.changes ?? 0) !== 1) return json({ error: "Board not found" }, 404);

  await invalidateBoardListCache(request, ctx);
  return json({ deleted: true });
}

async function handleModeratorComment(request: Request, env: ModeratorEnv, boardId: string, commentId: string, ctx: ExecutionContext) {
  if (request.method !== "DELETE") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);
  if (!(await isModerator(request, env))) return json({ error: "Moderator authentication required" }, 401);

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const rate = await env.WRITE_RATE_LIMITER.limit({ key: `moderator-delete:${clientIp}` });
  if (!rate.success) return json({ error: "Too many moderation requests. Try again shortly." }, 429);

  const result = await env.DB.prepare("DELETE FROM community_board_comments WHERE board_id = ?1 AND comment_id = ?2")
    .bind(boardId, commentId).run();
  if ((result.meta.changes ?? 0) !== 1) return json({ error: "Comment not found" }, 404);
  await invalidateBoardListCache(request, ctx);
  return json({ deleted: true });
}

async function handleVisitorTotal(request: Request, env: Env) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const rate = await env.SYNC_RATE_LIMITER.limit({ key: `visits:${clientIp}` });
  if (!rate.success) return json({ error: "Too many visitor count requests. Try again shortly." }, 429);

  const counter = env.PRESENCE.get(env.PRESENCE.idFromName("site-visitor-total"));
  const response = await counter.fetch("https://visits.internal/total", { method: request.method });
  const body = await response.json().catch(() => ({ error: "Visitor count unavailable" }));
  return json(body, response.status);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, service: "fluz-ld-tools" });
    if (url.pathname === "/api/visits") {
      const requestId = crypto.randomUUID();
      try { return await handleVisitorTotal(request, env); }
      catch (error) {
        console.error(JSON.stringify({ event: "visitor_total_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Visitor count unavailable" }, 503, "no-store", requestId);
      }
    }
    const moderatorEnv = env as ModeratorEnv;
    const moderatorBoardMatch = moderatorBoardPattern.exec(url.pathname);
    if (moderatorBoardMatch) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorBoard(request, moderatorEnv, moderatorBoardMatch[1].toLowerCase(), ctx); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_board_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    const moderatorCommentMatch = moderatorCommentPattern.exec(url.pathname);
    if (moderatorCommentMatch) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorComment(request, moderatorEnv, moderatorCommentMatch[1].toLowerCase(), moderatorCommentMatch[2].toLowerCase(), ctx); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_comment_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    if (moderatorLoginPattern.test(url.pathname)) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorLogin(request, moderatorEnv); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_login_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    if (moderatorLogoutPattern.test(url.pathname)) return handleModeratorLogout(request);
    if (moderatorSessionPattern.test(url.pathname)) return handleModeratorSession(request, moderatorEnv);
    const boardCommentMatch = boardCommentPattern.exec(url.pathname);
    if (boardCommentMatch) {
      const requestId = crypto.randomUUID();
      try { return await handleBoardComments(request, env, boardCommentMatch[1].toLowerCase(), ctx); }
      catch (error) {
        console.error(JSON.stringify({ event: "board_comment_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    const boardReportMatch = boardReportPattern.exec(url.pathname);
    if (boardReportMatch) {
      const requestId = crypto.randomUUID();
      try { return await handleBoardReport(request, env, boardReportMatch[1].toLowerCase(), ctx); }
      catch (error) {
        console.error(JSON.stringify({ event: "board_report_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    if (url.pathname === "/api/boards") {
      const requestId = crypto.randomUUID();
      try { return await handleBoards(request, env, url, ctx); }
      catch (error) {
        console.error(JSON.stringify({ event: "boards_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    const match = workspacePattern.exec(url.pathname);
    if (!match) return json({ error: "Not found" }, 404);
    try {
      return await handleSync(request, env, match[1].toLowerCase(), match[2]);
    } catch (error) {
      console.error(JSON.stringify({ event: "sync_error", path: url.pathname, error: error instanceof Error ? error.message : "unknown" }));
      return json({ error: "Internal error" }, 500);
    }
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare("DELETE FROM community_board_comments WHERE created_at < datetime('now', '-90 days')"),
      env.DB.prepare("DELETE FROM community_board_reports WHERE created_at < datetime('now', '-90 days')"),
      env.DB.prepare("DELETE FROM community_boards WHERE updated_at < datetime('now', '-90 days')"),
      env.DB.prepare("DELETE FROM board_share_cooldowns WHERE cooldown_until < ?").bind(Date.now() - 24 * 60 * 60 * 1000),
    ]));
  },
} satisfies ExportedHandler<Env>;

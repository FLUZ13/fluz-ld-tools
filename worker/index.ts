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
const moderatorAnalyticsPattern = /^\/api\/moderator\/analytics$/;
const moderatorDashboardPattern = /^\/api\/moderator\/dashboard$/;
const moderatorDashboardPagePattern = /^\/moderator\/analytics$/;
const analyticsEventPattern = /^\/api\/analytics\/event$/;
const moderatorBoardPattern = /^\/api\/moderator\/boards\/([0-9a-f-]{36})$/i;
const moderatorCommentPattern = /^\/api\/moderator\/boards\/([0-9a-f-]{36})\/comments\/([0-9a-f-]{36})$/i;
const moderatorLoginSchema = z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(512) });
const moderatorSessionLifetimeSeconds = 60 * 60 * 12;
const moderatorSessionCookie = "__Host-ld-moderator";
type ModeratorEnv = Env & { MODERATOR_USERNAME?: string; MODERATOR_PASSWORD?: string; MODERATOR_SESSION_SECRET?: string };

const analyticsPages = ["home", "builder", "runes", "boards", "discover", "credits", "privacy"] as const;
const analyticsPageSchema = z.enum(analyticsPages);
const analyticsEventSchema = z.object({
  event: z.enum(["page_view", "scanner_started", "scanner_applied", "scanner_rejected", "scanner_error"]),
  page: analyticsPageSchema,
  visitorHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const analyticsCommunitySchema = z.object({ metric: z.enum(["boards_shared", "comments_posted"]) }).strict();
const analyticsHealthSchema = z.object({ success: z.boolean(), latencyMs: z.number().int().min(0).max(60_000) }).strict();
const analyticsIncidentSchema = z.object({
  source: z.enum(["analytics", "boards", "moderation", "scanner", "sync"]),
  code: z.enum([
    "analytics_unavailable",
    "board_operation_failed",
    "moderation_operation_failed",
    "scan_processing_failed",
    "sync_operation_failed",
  ]),
  severity: z.enum(["warning", "error"]),
}).strict();
const analyticsRetentionDays = 45;
const healthRetentionDays = 90;
const incidentRetentionDays = 180;
const analyticsMetricKeys = [
  "unique_visitors",
  "page_views",
  ...analyticsPages,
  "boards_shared",
  "comments_posted",
  "scans_started",
  "scans_applied",
  "scans_rejected",
  "scan_errors",
] as const;

type AnalyticsMetricKey = typeof analyticsMetricKeys[number];
type AnalyticsDailyRow = Record<AnalyticsMetricKey, number> & { day: string };
type AnalyticsWindow = "today" | "last7" | "last30" | "allTime";
type AnalyticsStats = Record<AnalyticsWindow, Record<AnalyticsMetricKey, number>>;
type AnalyticsTotals = Partial<Record<AnalyticsMetricKey, number>>;
type AnalyticsSnapshot = { generatedAt: string; rows: AnalyticsDailyRow[]; totals: AnalyticsTotals };
type HealthCheck = { checkedAt: string; success: boolean; latencyMs: number };
type HealthIncident = { startedAt: string; lastSeenAt: string; resolvedAt: string | null; failedChecks: number };
type IncidentRollup = { occurredAt: string; lastSeenAt: string; source: string; code: string; severity: "warning" | "error"; count: number };
type HealthSnapshot = { lastCheck: HealthCheck | null; checks: HealthCheck[]; outages: HealthIncident[]; incidents: IncidentRollup[] };

const pageLabels: Record<typeof analyticsPages[number], string> = {
  home: "Home",
  builder: "Builder",
  runes: "Runes",
  boards: "Boards",
  discover: "Discover",
  credits: "Credits",
  privacy: "Privacy",
};

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dayKey(date);
}

function emptyAnalyticsStats(): AnalyticsStats {
  const create = () => Object.fromEntries(analyticsMetricKeys.map((key) => [key, 0])) as Record<AnalyticsMetricKey, number>;
  return { today: create(), last7: create(), last30: create(), allTime: create() };
}

function addAnalyticsRow(target: Record<AnalyticsMetricKey, number>, row: AnalyticsDailyRow) {
  for (const key of analyticsMetricKeys) target[key] += Number(row[key] ?? 0);
}

export function summarizeAnalytics(snapshot: AnalyticsSnapshot) {
  const today = dayKey(new Date(snapshot.generatedAt));
  const last7Start = shiftDay(today, -6);
  const last30Start = shiftDay(today, -29);
  const stats = emptyAnalyticsStats();

  for (const row of snapshot.rows) {
    if (row.day === today) addAnalyticsRow(stats.today, row);
    if (row.day >= last7Start && row.day <= today) addAnalyticsRow(stats.last7, row);
    if (row.day >= last30Start && row.day <= today) addAnalyticsRow(stats.last30, row);
  }
  for (const key of analyticsMetricKeys) stats.allTime[key] = Number(snapshot.totals[key] ?? 0);

  return stats;
}

export function publicPageViewTotals(snapshot: AnalyticsSnapshot) {
  const stats = summarizeAnalytics(snapshot);
  return { total: stats.allTime.page_views, today: stats.today.page_views };
}

function formatInteger(value: number) {
  return Math.max(0, Math.floor(value)).toLocaleString("en-US");
}

export function formatApplyRate(applied: number, started: number) {
  if (started <= 0) return "0.0%";
  return `${((applied / started) * 100).toFixed(1)}%`;
}

function formatTrafficLine(label: string, stats: Record<AnalyticsMetricKey, number>) {
  return `${label.padEnd(12)} ${formatInteger(stats.unique_visitors).padStart(16)} ${formatInteger(stats.page_views).padStart(12)}`;
}

function formatMetricLine(label: string, stats: AnalyticsStats, key: AnalyticsMetricKey) {
  return `${label.padEnd(17)} ${formatInteger(stats.today[key]).padStart(8)} ${formatInteger(stats.last7[key]).padStart(8)} ${formatInteger(stats.last30[key]).padStart(8)} ${formatInteger(stats.allTime[key]).padStart(10)}`;
}

export function renderAnalyticsDashboard(snapshot: AnalyticsSnapshot) {
  const stats = summarizeAnalytics(snapshot);
  const pageRanking = analyticsPages
    .map((page) => ({ page, views: stats.allTime[page] }))
    .sort((left, right) => right.views - left.views || pageLabels[left.page].localeCompare(pageLabels[right.page]));
  const scannerRejectedOrErrors = {
    today: stats.today.scans_rejected + stats.today.scan_errors,
    last7: stats.last7.scans_rejected + stats.last7.scan_errors,
    last30: stats.last30.scans_rejected + stats.last30.scan_errors,
    allTime: stats.allTime.scans_rejected + stats.allTime.scan_errors,
  };

  return [
    "Private Analytics Dashboard",
    `Generated: ${snapshot.generatedAt}`,
    "",
    "Privacy boundary",
    "Only aggregate counts and anonymous browser-generated SHA-256 visitor hashes are stored.",
    "No IP address, country, inventory, screenshot, referrer, device details, scan contents, or raw identifier is stored.",
    "",
    "Traffic",
    `${"Window".padEnd(12)} ${"Unique visitors".padStart(16)} ${"Page views".padStart(12)}`,
    formatTrafficLine("Today", stats.today),
    formatTrafficLine("Last 7 days", stats.last7),
    formatTrafficLine("Last 30 days", stats.last30),
    formatTrafficLine("All time", stats.allTime),
    "",
    "Most visited pages (all time)",
    ...pageRanking.map(({ page, views }, index) => `${String(index + 1).padStart(2)}. ${pageLabels[page].padEnd(8)} ${formatInteger(views)}`),
    "",
    "Community activity",
    `${"Metric".padEnd(17)} ${"Today".padStart(8)} ${"7 days".padStart(8)} ${"30 days".padStart(8)} ${"All time".padStart(10)}`,
    formatMetricLine("Boards shared", stats, "boards_shared"),
    formatMetricLine("Comments posted", stats, "comments_posted"),
    "",
    "Scanner health",
    `${"Metric".padEnd(17)} ${"Today".padStart(8)} ${"7 days".padStart(8)} ${"30 days".padStart(8)} ${"All time".padStart(10)}`,
    formatMetricLine("Scans started", stats, "scans_started"),
    formatMetricLine("Scans applied", stats, "scans_applied"),
    `${"Rejected/errors".padEnd(17)} ${formatInteger(scannerRejectedOrErrors.today).padStart(8)} ${formatInteger(scannerRejectedOrErrors.last7).padStart(8)} ${formatInteger(scannerRejectedOrErrors.last30).padStart(8)} ${formatInteger(scannerRejectedOrErrors.allTime).padStart(10)}`,
    `${"Apply rate".padEnd(17)} ${formatApplyRate(stats.today.scans_applied, stats.today.scans_started).padStart(8)} ${formatApplyRate(stats.last7.scans_applied, stats.last7.scans_started).padStart(8)} ${formatApplyRate(stats.last30.scans_applied, stats.last30.scans_started).padStart(8)} ${formatApplyRate(stats.allTime.scans_applied, stats.allTime.scans_started).padStart(10)}`,
    "",
  ].join("\n");
}

function toIso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function metricWindow(stats: AnalyticsStats, key: AnalyticsMetricKey) {
  return {
    today: stats.today[key],
    last7: stats.last7[key],
    last30: stats.last30[key],
    allTime: stats.allTime[key],
  };
}

export function buildControlStation(snapshot: AnalyticsSnapshot, health: HealthSnapshot) {
  const stats = summarizeAnalytics(snapshot);
  const daily = [...snapshot.rows]
    .sort((left, right) => left.day.localeCompare(right.day))
    .map((row) => ({
      day: row.day,
      uniqueVisitors: row.unique_visitors,
      pageViews: row.page_views,
      boardsShared: row.boards_shared,
      commentsPosted: row.comments_posted,
      scansStarted: row.scans_started,
      scansApplied: row.scans_applied,
      scansIssues: row.scans_rejected + row.scan_errors,
    }));
  const pages = analyticsPages
    .map((page) => ({
      id: page,
      label: pageLabels[page],
      last30: stats.last30[page],
      allTime: stats.allTime[page],
    }))
    .sort((left, right) => right.allTime - left.allTime || left.label.localeCompare(right.label));
  const checked = health.checks.length;
  const healthy = health.checks.filter((check) => check.success).length;

  return {
    generatedAt: snapshot.generatedAt,
    traffic: {
      uniqueVisitors: metricWindow(stats, "unique_visitors"),
      pageViews: metricWindow(stats, "page_views"),
      daily,
      pages,
    },
    community: {
      boardsShared: metricWindow(stats, "boards_shared"),
      commentsPosted: metricWindow(stats, "comments_posted"),
    },
    scanner: {
      started: metricWindow(stats, "scans_started"),
      applied: metricWindow(stats, "scans_applied"),
      rejected: metricWindow(stats, "scans_rejected"),
      errors: metricWindow(stats, "scan_errors"),
      applyRate: {
        today: formatApplyRate(stats.today.scans_applied, stats.today.scans_started),
        last7: formatApplyRate(stats.last7.scans_applied, stats.last7.scans_started),
        last30: formatApplyRate(stats.last30.scans_applied, stats.last30.scans_started),
        allTime: formatApplyRate(stats.allTime.scans_applied, stats.allTime.scans_started),
      },
    },
    health: {
      lastCheck: health.lastCheck,
      availability: checked > 0 ? Number(((healthy / checked) * 100).toFixed(2)) : null,
      checks: health.checks,
      outages: health.outages,
      incidents: health.incidents,
    },
  };
}

export class PresenceCounter {
  constructor(private readonly state: DurableObjectState) {
    // Retire the former heartbeat data; the visitor total stores no identifiers.
    this.state.storage.sql.exec("DROP TABLE IF EXISTS presence");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS visitor_totals (id INTEGER PRIMARY KEY, total INTEGER NOT NULL)");
    this.state.storage.sql.exec("INSERT OR IGNORE INTO visitor_totals (id, total) VALUES (1, 0)");
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS analytics_daily (
        day TEXT PRIMARY KEY,
        unique_visitors INTEGER NOT NULL DEFAULT 0,
        page_views INTEGER NOT NULL DEFAULT 0,
        home INTEGER NOT NULL DEFAULT 0,
        builder INTEGER NOT NULL DEFAULT 0,
        runes INTEGER NOT NULL DEFAULT 0,
        boards INTEGER NOT NULL DEFAULT 0,
        discover INTEGER NOT NULL DEFAULT 0,
        credits INTEGER NOT NULL DEFAULT 0,
        privacy INTEGER NOT NULL DEFAULT 0,
        boards_shared INTEGER NOT NULL DEFAULT 0,
        comments_posted INTEGER NOT NULL DEFAULT 0,
        scans_started INTEGER NOT NULL DEFAULT 0,
        scans_applied INTEGER NOT NULL DEFAULT 0,
        scans_rejected INTEGER NOT NULL DEFAULT 0,
        scan_errors INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS analytics_unique_daily (day TEXT NOT NULL, visitor_hash TEXT NOT NULL, PRIMARY KEY (day, visitor_hash))");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS analytics_unique_all_time (visitor_hash TEXT PRIMARY KEY)");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS analytics_totals (metric TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0)");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS service_checks (checked_at INTEGER PRIMARY KEY, success INTEGER NOT NULL, latency_ms INTEGER NOT NULL)");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS service_outages (outage_id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, resolved_at INTEGER, failed_checks INTEGER NOT NULL DEFAULT 1)");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS incident_rollups (bucket_start INTEGER NOT NULL, source TEXT NOT NULL, code TEXT NOT NULL, severity TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, last_seen_at INTEGER NOT NULL, PRIMARY KEY (bucket_start, source, code))");
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS control_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    for (const metric of analyticsMetricKeys) {
      this.state.storage.sql.exec("INSERT OR IGNORE INTO analytics_totals (metric, total) VALUES (?, 0)", metric);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/total") {
      if (!["GET", "POST"].includes(request.method)) return Response.json({ error: "Method not allowed" }, { status: 405 });
      if (request.method === "POST") this.state.storage.sql.exec("UPDATE visitor_totals SET total = total + 1 WHERE id = 1");
      const [{ total = 0 } = {}] = this.state.storage.sql.exec<{ total: number }>("SELECT total FROM visitor_totals WHERE id = 1").toArray();
      return Response.json({ total }, { headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/analytics/event") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      const parsed = analyticsEventSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid analytics payload" }, { status: 400 });
      this.recordAnalyticsEvent(parsed.data);
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/analytics/page-views") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
      return Response.json(publicPageViewTotals(this.analyticsSnapshot()), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    if (url.pathname === "/analytics/community") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      const parsed = analyticsCommunitySchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid analytics payload" }, { status: 400 });
      this.recordDailyMetric(parsed.data.metric);
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/analytics/health") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      const parsed = analyticsHealthSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid health payload" }, { status: 400 });
      this.recordHealthProbe(parsed.data);
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/analytics/incident") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      const parsed = analyticsIncidentSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ error: "Invalid incident payload" }, { status: 400 });
      this.recordIncident(parsed.data);
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/analytics/dashboard") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
      return new Response(renderAnalyticsDashboard(this.analyticsSnapshot()), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    if (url.pathname === "/analytics/control-station") {
      if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
      return Response.json(buildControlStation(this.analyticsSnapshot(), this.healthSnapshot()), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }

    if (url.pathname === "/analytics/cleanup") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      this.cleanupAnalytics();
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  private ensureDailyRow(day = dayKey()) {
    this.state.storage.sql.exec("INSERT OR IGNORE INTO analytics_daily (day) VALUES (?)", day);
    return day;
  }

  private incrementTotal(metric: AnalyticsMetricKey, amount = 1) {
    this.state.storage.sql.exec("UPDATE analytics_totals SET total = total + ? WHERE metric = ?", amount, metric);
  }

  private incrementDaily(day: string, metric: AnalyticsMetricKey, amount = 1) {
    this.state.storage.sql.exec(`UPDATE analytics_daily SET ${metric} = ${metric} + ? WHERE day = ?`, amount, day);
    this.incrementTotal(metric, amount);
  }

  private recordDailyVisitor(day: string, visitorHash: string) {
    this.state.storage.sql.exec("INSERT OR IGNORE INTO analytics_unique_daily (day, visitor_hash) VALUES (?, ?)", day, visitorHash);
    const [{ changed: dailyChanged = 0 } = {}] = this.state.storage.sql.exec<{ changed: number }>("SELECT changes() AS changed").toArray();
    if (dailyChanged > 0) this.state.storage.sql.exec("UPDATE analytics_daily SET unique_visitors = unique_visitors + 1 WHERE day = ?", day);

    this.state.storage.sql.exec("INSERT OR IGNORE INTO analytics_unique_all_time (visitor_hash) VALUES (?)", visitorHash);
    const [{ changed: allTimeChanged = 0 } = {}] = this.state.storage.sql.exec<{ changed: number }>("SELECT changes() AS changed").toArray();
    if (allTimeChanged > 0) this.incrementTotal("unique_visitors");
  }

  private recordAnalyticsEvent(event: z.infer<typeof analyticsEventSchema>) {
    const day = this.ensureDailyRow();
    this.recordDailyVisitor(day, event.visitorHash);
    if (event.event === "page_view") {
      this.incrementDaily(day, "page_views");
      this.incrementDaily(day, event.page);
    } else if (event.event === "scanner_started") {
      this.incrementDaily(day, "scans_started");
    } else if (event.event === "scanner_applied") {
      this.incrementDaily(day, "scans_applied");
    } else if (event.event === "scanner_rejected") {
      this.incrementDaily(day, "scans_rejected");
    } else {
      this.incrementDaily(day, "scan_errors");
      this.recordIncident({ source: "scanner", code: "scan_processing_failed", severity: "error" });
    }
    this.cleanupAnalytics();
  }

  private recordDailyMetric(metric: "boards_shared" | "comments_posted") {
    const day = this.ensureDailyRow();
    this.incrementDaily(day, metric);
    this.cleanupAnalytics();
  }

  private cleanupAnalytics() {
    const cutoff = shiftDay(dayKey(), -analyticsRetentionDays);
    this.state.storage.sql.exec("DELETE FROM analytics_daily WHERE day < ?", cutoff);
    this.state.storage.sql.exec("DELETE FROM analytics_unique_daily WHERE day < ?", cutoff);
  }

  private recordHealthProbe(probe: z.infer<typeof analyticsHealthSchema>) {
    const [{ value: healthSchemaVersion = "" } = {}] = this.state.storage.sql.exec<{ value: string }>("SELECT value FROM control_metadata WHERE key = 'health_schema_version'").toArray();
    if (healthSchemaVersion !== "subsystem-v2") {
      this.state.storage.sql.exec("DELETE FROM service_checks");
      this.state.storage.sql.exec("DELETE FROM service_outages");
      this.state.storage.sql.exec("INSERT OR REPLACE INTO control_metadata (key, value) VALUES ('health_schema_version', 'subsystem-v2')");
    }
    const now = Date.now();
    this.state.storage.sql.exec("INSERT OR REPLACE INTO service_checks (checked_at, success, latency_ms) VALUES (?, ?, ?)", now, probe.success ? 1 : 0, probe.latencyMs);
    if (probe.success) {
      this.state.storage.sql.exec("UPDATE service_outages SET resolved_at = ? WHERE resolved_at IS NULL", now);
    } else {
      const [openOutage] = this.state.storage.sql.exec<{ outage_id: number }>("SELECT outage_id FROM service_outages WHERE resolved_at IS NULL ORDER BY outage_id DESC LIMIT 1").toArray();
      if (openOutage) {
        this.state.storage.sql.exec("UPDATE service_outages SET last_seen_at = ?, failed_checks = failed_checks + 1 WHERE outage_id = ?", now, openOutage.outage_id);
      } else {
        this.state.storage.sql.exec("INSERT INTO service_outages (started_at, last_seen_at, failed_checks) VALUES (?, ?, 1)", now, now);
      }
    }
    this.cleanupControlStation();
  }

  private recordIncident(incident: z.infer<typeof analyticsIncidentSchema>) {
    const now = Date.now();
    const bucketStart = Math.floor(now / (15 * 60 * 1000)) * 15 * 60 * 1000;
    this.state.storage.sql.exec(
      "INSERT INTO incident_rollups (bucket_start, source, code, severity, count, last_seen_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(bucket_start, source, code) DO UPDATE SET count = count + 1, last_seen_at = excluded.last_seen_at",
      bucketStart,
      incident.source,
      incident.code,
      incident.severity,
      now,
    );
    this.cleanupControlStation();
  }

  private cleanupControlStation() {
    const now = Date.now();
    this.state.storage.sql.exec("DELETE FROM service_checks WHERE checked_at < ?", now - healthRetentionDays * 24 * 60 * 60 * 1000);
    this.state.storage.sql.exec("DELETE FROM service_outages WHERE COALESCE(resolved_at, last_seen_at) < ?", now - incidentRetentionDays * 24 * 60 * 60 * 1000);
    this.state.storage.sql.exec("DELETE FROM incident_rollups WHERE last_seen_at < ?", now - incidentRetentionDays * 24 * 60 * 60 * 1000);
  }

  private analyticsSnapshot(): AnalyticsSnapshot {
    this.cleanupAnalytics();
    const last30Start = shiftDay(dayKey(), -29);
    const rows = this.state.storage.sql.exec<AnalyticsDailyRow>(
      "SELECT day, unique_visitors, page_views, home, builder, runes, boards, discover, credits, privacy, boards_shared, comments_posted, scans_started, scans_applied, scans_rejected, scan_errors FROM analytics_daily WHERE day >= ? ORDER BY day DESC",
      last30Start,
    ).toArray();
    const totalsRows = this.state.storage.sql.exec<{ metric: AnalyticsMetricKey; total: number }>("SELECT metric, total FROM analytics_totals").toArray();
    const totals = Object.fromEntries(totalsRows.map((row) => [row.metric, row.total])) as AnalyticsTotals;
    return { generatedAt: new Date().toISOString(), rows, totals };
  }

  private healthSnapshot(): HealthSnapshot {
    this.cleanupControlStation();
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const checks = this.state.storage.sql.exec<{ checked_at: number; success: number; latency_ms: number }>(
      "SELECT checked_at, success, latency_ms FROM service_checks WHERE checked_at >= ? ORDER BY checked_at ASC",
      since,
    ).toArray().map((check) => ({ checkedAt: toIso(check.checked_at), success: check.success === 1, latencyMs: check.latency_ms }));
    const lastCheck = checks.at(-1) ?? null;
    const outages = this.state.storage.sql.exec<{ started_at: number; last_seen_at: number; resolved_at: number | null; failed_checks: number }>(
      "SELECT started_at, last_seen_at, resolved_at, failed_checks FROM service_outages ORDER BY started_at DESC LIMIT 40",
    ).toArray().map((outage) => ({
      startedAt: toIso(outage.started_at),
      lastSeenAt: toIso(outage.last_seen_at),
      resolvedAt: outage.resolved_at ? toIso(outage.resolved_at) : null,
      failedChecks: outage.failed_checks,
    }));
    const incidents = this.state.storage.sql.exec<{ bucket_start: number; last_seen_at: number; source: string; code: string; severity: "warning" | "error"; count: number }>(
      "SELECT bucket_start, last_seen_at, source, code, severity, count FROM incident_rollups ORDER BY last_seen_at DESC LIMIT 80",
    ).toArray().map((incident) => ({
      occurredAt: toIso(incident.bucket_start),
      lastSeenAt: toIso(incident.last_seen_at),
      source: incident.source,
      code: incident.code,
      severity: incident.severity,
      count: incident.count,
    }));
    return { lastCheck, checks, outages, incidents };
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

function plainText(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
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
    ctx.waitUntil(recordAnalyticsMetric(env, "boards_shared").catch((error) => {
      console.warn(JSON.stringify({ event: "analytics_board_share_error", error: error instanceof Error ? error.message : "unknown" }));
    }));
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
  ctx.waitUntil(recordAnalyticsMetric(env, "comments_posted").catch((error) => {
    console.warn(JSON.stringify({ event: "analytics_comment_error", error: error instanceof Error ? error.message : "unknown" }));
  }));
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

async function handlePageViewTotal(request: Request, env: Env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);

  const clientIp = request.headers.get("CF-Connecting-IP") ?? "local";
  const rate = await env.SYNC_RATE_LIMITER.limit({ key: `page-views:${clientIp}` });
  if (!rate.success) return json({ error: "Too many page-view count requests. Try again shortly." }, 429);

  const response = await analyticsCounter(env).fetch("https://analytics.internal/analytics/page-views");
  const body = await response.json().catch(() => ({ error: "Page-view count unavailable" }));
  return json(body, response.status);
}

function analyticsCounter(env: Env) {
  return env.PRESENCE.get(env.PRESENCE.idFromName("site-visitor-total"));
}

async function recordAnalyticsMetric(env: Env, metric: "boards_shared" | "comments_posted") {
  await analyticsCounter(env).fetch("https://analytics.internal/analytics/community", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metric }),
  });
}

async function recordControlIncident(env: Env, incident: z.infer<typeof analyticsIncidentSchema>) {
  await analyticsCounter(env).fetch("https://analytics.internal/analytics/incident", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(incident),
  });
}

async function recordHealthProbe(env: Env) {
  const startedAt = Date.now();
  let success = false;
  try {
    const database = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const counter = await analyticsCounter(env).fetch("https://analytics.internal/total");
    success = database?.ok === 1 && counter.ok;
  } catch {
    success = false;
  }
  await analyticsCounter(env).fetch("https://analytics.internal/analytics/health", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success, latencyMs: Math.min(60_000, Date.now() - startedAt) }),
  });
}

async function handleAnalyticsEvent(request: Request, env: Env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request origin" }, 403);

  let parsed: z.infer<typeof analyticsEventSchema>;
  try { parsed = analyticsEventSchema.parse(await readJson(request)); }
  catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Invalid analytics payload" }, 400);
  }

  const rate = await env.SYNC_RATE_LIMITER.limit({ key: `analytics:${parsed.visitorHash}` });
  if (!rate.success) return json({ error: "Analytics rate limit exceeded" }, 429);

  const response = await analyticsCounter(env).fetch("https://analytics.internal/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });
  if (!response.ok && response.status !== 204) return json({ error: "Analytics unavailable" }, 503);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

async function handleModeratorAnalytics(request: Request, env: ModeratorEnv) {
  if (request.method !== "GET") return plainText("Method not allowed\n", 405);
  if (!(await isModerator(request, env))) return plainText("Moderator authentication required\n", 401);
  const response = await analyticsCounter(env).fetch("https://analytics.internal/analytics/dashboard");
  if (!response.ok) return plainText("Analytics unavailable\n", 503);
  return plainText(await response.text());
}

async function handleModeratorDashboard(request: Request, env: ModeratorEnv) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!(await isModerator(request, env))) return json({ error: "Moderator authentication required" }, 401);
  const response = await analyticsCounter(env).fetch("https://analytics.internal/analytics/control-station");
  if (!response.ok) return json({ error: "Control station is unavailable" }, 503);
  return json(await response.json());
}

async function handleModeratorDashboardPage(request: Request, env: ModeratorEnv) {
  if (request.method !== "GET") return plainText("Method not allowed\n", 405);
  if (!(await isModerator(request, env))) return plainText("Moderator authentication required\n", 401);
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return json({ ok: true, service: "fluz-ld-tools" });
    const moderatorEnv = env as ModeratorEnv;
    if (moderatorDashboardPagePattern.test(url.pathname)) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorDashboardPage(request, moderatorEnv); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_dashboard_page_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        ctx.waitUntil(recordControlIncident(env, { source: "moderation", code: "moderation_operation_failed", severity: "error" }).catch(() => undefined));
        return plainText("Control station unavailable\n", 503);
      }
    }
    if (url.pathname === "/api/visits") {
      const requestId = crypto.randomUUID();
      try { return await handleVisitorTotal(request, env); }
      catch (error) {
        console.error(JSON.stringify({ event: "visitor_total_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Visitor count unavailable" }, 503, "no-store", requestId);
      }
    }
    if (url.pathname === "/api/page-views") {
      const requestId = crypto.randomUUID();
      try { return await handlePageViewTotal(request, env); }
      catch (error) {
        console.error(JSON.stringify({ event: "page_view_total_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return json({ error: "Page-view count unavailable" }, 503, "no-store", requestId);
      }
    }
    if (analyticsEventPattern.test(url.pathname)) {
      const requestId = crypto.randomUUID();
      try { return await handleAnalyticsEvent(request, env); }
      catch (error) {
        console.error(JSON.stringify({ event: "analytics_event_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      }
    }
    if (moderatorDashboardPattern.test(url.pathname)) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorDashboard(request, moderatorEnv); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_dashboard_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        ctx.waitUntil(recordControlIncident(env, { source: "moderation", code: "moderation_operation_failed", severity: "error" }).catch(() => undefined));
        return json({ error: "Control station unavailable" }, 503, "no-store", requestId);
      }
    }
    if (moderatorAnalyticsPattern.test(url.pathname)) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorAnalytics(request, moderatorEnv); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_analytics_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        ctx.waitUntil(recordControlIncident(env, { source: "analytics", code: "analytics_unavailable", severity: "error" }).catch(() => undefined));
        return plainText("Analytics unavailable\n", 503);
      }
    }
    const moderatorBoardMatch = moderatorBoardPattern.exec(url.pathname);
    if (moderatorBoardMatch) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorBoard(request, moderatorEnv, moderatorBoardMatch[1].toLowerCase(), ctx); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_board_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        ctx.waitUntil(recordControlIncident(env, { source: "moderation", code: "moderation_operation_failed", severity: "error" }).catch(() => undefined));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    const moderatorCommentMatch = moderatorCommentPattern.exec(url.pathname);
    if (moderatorCommentMatch) {
      const requestId = crypto.randomUUID();
      try { return await handleModeratorComment(request, moderatorEnv, moderatorCommentMatch[1].toLowerCase(), moderatorCommentMatch[2].toLowerCase(), ctx); }
      catch (error) {
        console.error(JSON.stringify({ event: "moderator_comment_error", requestId, error: error instanceof Error ? error.message : "unknown" }));
        ctx.waitUntil(recordControlIncident(env, { source: "moderation", code: "moderation_operation_failed", severity: "error" }).catch(() => undefined));
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
        ctx.waitUntil(recordControlIncident(env, { source: "boards", code: "board_operation_failed", severity: "error" }).catch(() => undefined));
        return json({ error: "Internal error" }, 500, "no-store", requestId);
      }
    }
    const match = workspacePattern.exec(url.pathname);
    if (!match) return json({ error: "Not found" }, 404);
    try {
      return await handleSync(request, env, match[1].toLowerCase(), match[2]);
    } catch (error) {
      console.error(JSON.stringify({ event: "sync_error", path: url.pathname, error: error instanceof Error ? error.message : "unknown" }));
      ctx.waitUntil(recordControlIncident(env, { source: "sync", code: "sync_operation_failed", severity: "error" }).catch(() => undefined));
      return json({ error: "Internal error" }, 500);
    }
  },
  scheduled(controller, env, ctx) {
    const scheduledAt = new Date(controller.scheduledTime);
    const maintenanceDue = scheduledAt.getUTCHours() === 3 && scheduledAt.getUTCMinutes() === 0;
    const work: Promise<unknown>[] = [recordHealthProbe(env)];
    if (maintenanceDue) {
      work.push(env.DB.batch([
        env.DB.prepare("DELETE FROM community_board_comments WHERE created_at < datetime('now', '-90 days')"),
        env.DB.prepare("DELETE FROM community_board_reports WHERE created_at < datetime('now', '-90 days')"),
        env.DB.prepare("DELETE FROM community_boards WHERE updated_at < datetime('now', '-90 days')"),
        env.DB.prepare("DELETE FROM board_share_cooldowns WHERE cooldown_until < ?").bind(Date.now() - 24 * 60 * 60 * 1000),
      ]));
      work.push(analyticsCounter(env).fetch("https://analytics.internal/analytics/cleanup", { method: "POST" }));
    }
    ctx.waitUntil(Promise.all(work));
  },
} satisfies ExportedHandler<Env>;

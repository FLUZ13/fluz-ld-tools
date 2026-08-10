import { describe, expect, it } from "vitest";
import { buildControlStation, formatApplyRate, publicPageViewTotals, renderAnalyticsDashboard, summarizeAnalytics } from "./index";

const zeroRow = (day: string) => ({
  day,
  unique_visitors: 0,
  page_views: 0,
  home: 0,
  builder: 0,
  runes: 0,
  boards: 0,
  discover: 0,
  credits: 0,
  privacy: 0,
  boards_shared: 0,
  comments_posted: 0,
  scans_started: 0,
  scans_applied: 0,
  scans_rejected: 0,
  scan_errors: 0,
});

describe("private analytics aggregation", () => {
  it("summarizes today, rolling 7 day, rolling 30 day, and all-time totals", () => {
    const stats = summarizeAnalytics({
      generatedAt: "2026-08-07T12:00:00.000Z",
      rows: [
        { ...zeroRow("2026-08-07"), unique_visitors: 2, page_views: 5, home: 3, scans_started: 2, scans_applied: 1 },
        { ...zeroRow("2026-08-01"), unique_visitors: 1, page_views: 4, builder: 4, boards_shared: 1 },
        { ...zeroRow("2026-07-10"), unique_visitors: 3, page_views: 8, privacy: 8, comments_posted: 2 },
      ],
      totals: { unique_visitors: 4, page_views: 40, home: 10, builder: 20, privacy: 10, boards_shared: 3, comments_posted: 5, scans_started: 8, scans_applied: 4 },
    });

    expect(stats.today.unique_visitors).toBe(2);
    expect(stats.today.page_views).toBe(5);
    expect(stats.last7.page_views).toBe(9);
    expect(stats.last30.page_views).toBe(17);
    expect(stats.allTime.unique_visitors).toBe(4);
    expect(stats.allTime.page_views).toBe(40);
  });

  it("does not include future-dated daily rows in rolling windows", () => {
    const stats = summarizeAnalytics({
      generatedAt: "2026-08-07T12:00:00.000Z",
      rows: [
        { ...zeroRow("2026-08-07"), page_views: 3 },
        { ...zeroRow("2026-08-08"), page_views: 99 },
      ],
      totals: { page_views: 102 },
    });

    expect(stats.last7.page_views).toBe(3);
    expect(stats.last30.page_views).toBe(3);
    expect(stats.allTime.page_views).toBe(102);
  });

  it("exposes only aggregate all-time and today page-view totals", () => {
    expect(publicPageViewTotals({
      generatedAt: "2026-08-10T12:00:00.000Z",
      rows: [
        { ...zeroRow("2026-08-10"), page_views: 7 },
        { ...zeroRow("2026-08-09"), page_views: 4 },
      ],
      totals: { page_views: 1536, unique_visitors: 170 },
    })).toEqual({ total: 1536, today: 7 });
  });

  it("renders a no-store plain-text-safe dashboard without private source fields", () => {
    const text = renderAnalyticsDashboard({
      generatedAt: "2026-08-07T12:00:00.000Z",
      rows: [{ ...zeroRow("2026-08-07"), unique_visitors: 1, page_views: 2, discover: 2, scans_started: 2, scans_applied: 1, scan_errors: 1 }],
      totals: { unique_visitors: 1, page_views: 2, discover: 2, scans_started: 2, scans_applied: 1, scan_errors: 1 },
    });

    expect(text).toContain("Private Analytics Dashboard");
    expect(text).toContain("Discover");
    expect(text).toContain("Rejected/errors");
    expect(text).toContain("50.0%");
    expect(text).toContain("No IP address, country, inventory, screenshot, referrer, device details, scan contents, or raw identifier is stored.");
  });

  it("formats scanner apply rate defensively", () => {
    expect(formatApplyRate(3, 4)).toBe("75.0%");
    expect(formatApplyRate(1, 0)).toBe("0.0%");
  });

  it("builds the private control station from aggregate metrics and safe service events", () => {
    const dashboard = buildControlStation({
      generatedAt: "2026-08-07T12:00:00.000Z",
      rows: [{ ...zeroRow("2026-08-07"), unique_visitors: 3, page_views: 8, builder: 5, scans_started: 2, scans_applied: 1 }],
      totals: { unique_visitors: 3, page_views: 8, builder: 5, scans_started: 2, scans_applied: 1 },
    }, {
      lastCheck: { checkedAt: "2026-08-07T11:55:00.000Z", success: true, latencyMs: 42 },
      checks: [
        { checkedAt: "2026-08-07T11:50:00.000Z", success: true, latencyMs: 31 },
        { checkedAt: "2026-08-07T11:55:00.000Z", success: true, latencyMs: 42 },
      ],
      outages: [],
      incidents: [{ occurredAt: "2026-08-07T11:45:00.000Z", lastSeenAt: "2026-08-07T11:45:00.000Z", source: "scanner", code: "scan_processing_failed", severity: "error", count: 1 }],
    });

    expect(dashboard.traffic.daily[0]).toMatchObject({ uniqueVisitors: 3, pageViews: 8 });
    expect(dashboard.traffic.pages[0]).toMatchObject({ id: "builder", allTime: 5 });
    expect(dashboard.scanner.applyRate.last30).toBe("50.0%");
    expect(dashboard.health.availability).toBe(100);
    expect(dashboard.health.incidents[0]).toEqual(expect.objectContaining({ code: "scan_processing_failed", count: 1 }));
  });
});

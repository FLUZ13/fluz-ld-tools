export type MetricWindow = { today: number; last7: number; last30: number; allTime: number };

export type ControlStationData = {
  generatedAt: string;
  traffic: {
    uniqueVisitors: MetricWindow;
    pageViews: MetricWindow;
    daily: Array<{
      day: string;
      uniqueVisitors: number;
      pageViews: number;
      boardsShared: number;
      commentsPosted: number;
      scansStarted: number;
      scansApplied: number;
      scansIssues: number;
    }>;
    pages: Array<{ id: string; label: string; last30: number; allTime: number }>;
  };
  community: { boardsShared: MetricWindow; commentsPosted: MetricWindow };
  scanner: {
    started: MetricWindow;
    applied: MetricWindow;
    rejected: MetricWindow;
    errors: MetricWindow;
    applyRate: { today: string; last7: string; last30: string; allTime: string };
  };
  health: {
    lastCheck: { checkedAt: string; success: boolean; latencyMs: number } | null;
    availability: number | null;
    checks: Array<{ checkedAt: string; success: boolean; latencyMs: number }>;
    outages: Array<{ startedAt: string; lastSeenAt: string; resolvedAt: string | null; failedChecks: number }>;
    incidents: Array<{ occurredAt: string; lastSeenAt: string; source: string; code: string; severity: "warning" | "error"; count: number }>;
  };
};

export class ControlStationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ControlStationError";
    this.status = status;
  }
}

export async function fetchControlStation(signal?: AbortSignal) {
  const response = await fetch("/api/moderator/dashboard", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ControlStationError(body.error ?? "Could not load the control station.", response.status);
  }
  return response.json() as Promise<ControlStationData>;
}

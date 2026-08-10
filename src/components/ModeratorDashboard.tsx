import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, ExternalLink, Eye, HeartHandshake, LoaderCircle, RefreshCw, ScanLine, ShieldCheck, TriangleAlert, UsersRound, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ControlStationError, fetchControlStation, type ControlStationData, type MetricWindow } from "../lib/control-station";

type WindowKey = "today" | "last7" | "last30" | "allTime";
type TrendRange = "7" | "30";

const chartTooltip = { border: "1px solid #8b6b49", borderRadius: 5, background: "#fff4de", color: "#352b22", fontSize: 12 };
const pageColors = ["#18999c", "#eaa72b", "#2f936d", "#9d6cbd", "#bd4a42", "#4f83b3", "#8b6b49"];

function number(value: number) { return value.toLocaleString("en-US"); }
function compactDate(value: ReactNode) {
  if (typeof value !== "string") return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}
function compactTime(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function duration(start: string, end: string | null) {
  const milliseconds = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function metric(window: MetricWindow, key: WindowKey) { return number(window[key]); }

function ChartPanel({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: ReactNode; className?: string }) {
  return <section className={`control-panel ${className}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div></header><div className="control-chart">{children}</div></section>;
}

function MetricCard({ icon: Icon, label, value, detail, tone = "teal" }: { icon: LucideIcon; label: string; value: string; detail: string; tone?: "teal" | "gold" | "green" | "red" }) {
  return <article className={`control-metric control-metric-${tone}`}><Icon /><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function EmptyChart({ children }: { children: ReactNode }) {
  return <div className="control-empty-chart">{children}</div>;
}

function HealthTimeline({ data }: { data: ControlStationData }) {
  const hourly = useMemo(() => {
    const hours = new Map<string, { hour: string; healthy: number; failed: number; latencyTotal: number; latencyCount: number }>();
    for (const check of data.health.checks) {
      const hour = check.checkedAt.slice(0, 13) + ":00:00.000Z";
      const current = hours.get(hour) ?? { hour, healthy: 0, failed: 0, latencyTotal: 0, latencyCount: 0 };
      if (check.success) current.healthy += 1;
      else current.failed += 1;
      current.latencyTotal += check.latencyMs;
      current.latencyCount += 1;
      hours.set(hour, current);
    }
    return [...hours.values()].map((entry) => ({ ...entry, label: new Intl.DateTimeFormat("en", { weekday: "short", hour: "2-digit" }).format(new Date(entry.hour)), latency: entry.latencyCount ? Math.round(entry.latencyTotal / entry.latencyCount) : 0 }));
  }, [data.health.checks]);

  if (!hourly.length) return <EmptyChart>Collecting the first five-minute probe.</EmptyChart>;
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={hourly} barGap={1}><CartesianGrid stroke="#d1b995" vertical={false} /><XAxis dataKey="label" minTickGap={30} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="healthy" name="Healthy probes" stackId="checks" fill="#2f936d" radius={[2, 2, 0, 0]} /><Bar dataKey="failed" name="Failed probes" stackId="checks" fill="#bd4a42" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer>;
}

function incidentName(code: string) {
  return ({ analytics_unavailable: "Analytics unavailable", board_operation_failed: "Board operation failed", moderation_operation_failed: "Moderation operation failed", scan_processing_failed: "Scanner processing failed", sync_operation_failed: "Sync operation failed" } as Record<string, string>)[code] ?? code.replaceAll("_", " ");
}

export function ModeratorDashboard() {
  const [data, setData] = useState<ControlStationData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TrendRange>("30");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await fetchControlStation(controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        if (loadError instanceof ControlStationError && loadError.status === 401) setError("Your moderator session expired. Sign in again from Community boards.");
        else setError(loadError instanceof Error ? loadError.message : "Could not load the control station.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const refresh = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(refresh); };
  }, [refreshKey]);

  if (loading && !data) return <main className="page-state" aria-live="polite"><LoaderCircle className="spin" /><span>Loading control station</span></main>;
  if (!data) return <main className="page-state page-state-error" role="alert"><TriangleAlert /><h1>Control station unavailable</h1><p>{error || "Please try again."}</p><a className="primary-button" href="/discover">Open Community boards</a></main>;

  const trend = data.traffic.daily.slice(range === "7" ? -7 : -30);
  const scannerSuccessRate = data.scanner.applyRate.last30;
  const pagePie = data.traffic.pages.some((page) => page.allTime > 0) ? data.traffic.pages.filter((page) => page.allTime > 0) : [{ id: "none", label: "No page views yet", last30: 0, allTime: 1 }];
  const openOutage = data.health.outages.find((outage) => outage.resolvedAt === null);

  return <main className="control-page" id="main-content">
    <header className="control-hero">
      <div><span><ShieldCheck />Private moderator area</span><h1>Control Station</h1><p>Live oversight for traffic, community activity, local scanner outcomes, and the scheduled service probe.</p></div>
      <div className="control-hero-actions"><small>Updated {compactTime(data.generatedAt)}</small><button className="icon-button" type="button" title="Refresh dashboard" aria-label="Refresh dashboard" onClick={() => { setLoading(true); setRefreshKey((key) => key + 1); }}><RefreshCw /></button><a className="icon-button" href="/api/moderator/analytics" target="_blank" rel="noreferrer" title="Open plain-text analytics report" aria-label="Open plain-text analytics report"><ExternalLink /></a></div>
    </header>

    <section className="control-summary" aria-label="Analytics overview">
      <MetricCard icon={UsersRound} label="Unique visitors" value={metric(data.traffic.uniqueVisitors, "last30")} detail={`${metric(data.traffic.uniqueVisitors, "today")} today`} />
      <MetricCard icon={Eye} label="Page views" value={metric(data.traffic.pageViews, "last30")} detail={`${metric(data.traffic.pageViews, "today")} today`} tone="gold" />
      <MetricCard icon={ScanLine} label="Scanner apply rate" value={scannerSuccessRate} detail={`${metric(data.scanner.applied, "last30")} applied in 30 days`} tone="green" />
      <MetricCard icon={Activity} label="Service probe" value={data.health.availability === null ? "Pending" : `${data.health.availability}%`} detail={data.health.lastCheck ? `${data.health.lastCheck.success ? "Healthy" : "Failing"} ${data.health.lastCheck.latencyMs} ms` : "First check pending"} tone={data.health.lastCheck?.success === false ? "red" : "teal"} />
    </section>

    <section className="control-toolbar" aria-label="Traffic time range"><div><BarChart3 /><strong>Traffic trends</strong><span>Daily anonymous aggregate counts</span></div><div className="control-segmented"><button className={range === "7" ? "active" : ""} type="button" onClick={() => setRange("7")}>7 days</button><button className={range === "30" ? "active" : ""} type="button" onClick={() => setRange("30")}>30 days</button></div></section>

    <section className="control-grid control-grid-top">
      <ChartPanel title="Visitors and views" subtitle={`Daily traffic over the last ${range} days`} className="control-panel-wide">
        {trend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid stroke="#d1b995" vertical={false} /><XAxis dataKey="day" tickFormatter={compactDate} minTickGap={26} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} labelFormatter={compactDate} /><Legend wrapperStyle={{ fontSize: 11 }} /><Area type="monotone" dataKey="pageViews" name="Page views" stroke="#e09b25" fill="#eaa72b" fillOpacity={0.26} strokeWidth={2.4} /><Area type="monotone" dataKey="uniqueVisitors" name="Unique visitors" stroke="#128080" fill="#18999c" fillOpacity={0.26} strokeWidth={2.4} /></AreaChart></ResponsiveContainer> : <EmptyChart>Traffic history will appear after visitors arrive.</EmptyChart>}
      </ChartPanel>
      <ChartPanel title="Page share" subtitle="All-time page-view distribution">
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pagePie} dataKey="allTime" nameKey="label" innerRadius="45%" outerRadius="72%" paddingAngle={2}>{pagePie.map((entry, index) => <Cell key={entry.id} fill={pageColors[index % pageColors.length]} />)}</Pie><Tooltip contentStyle={chartTooltip} /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer>
      </ChartPanel>
    </section>

    <section className="control-grid">
      <ChartPanel title="Most visited pages" subtitle="All-time views by allowed public page">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data.traffic.pages} layout="vertical" margin={{ left: 8 }}><CartesianGrid stroke="#d1b995" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis dataKey="label" type="category" width={64} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} /><Bar dataKey="allTime" name="All-time views" fill="#18999c" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer>
      </ChartPanel>
      <ChartPanel title="Community activity" subtitle="Shared boards and posted comments by day">
        {trend.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><CartesianGrid stroke="#d1b995" vertical={false} /><XAxis dataKey="day" tickFormatter={compactDate} minTickGap={26} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} labelFormatter={compactDate} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="boardsShared" name="Boards shared" fill="#9d6cbd" radius={[3, 3, 0, 0]} /><Bar dataKey="commentsPosted" name="Comments posted" fill="#eaa72b" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart>Community activity will appear here after the first share or comment.</EmptyChart>}
      </ChartPanel>
      <ChartPanel title="Scanner health" subtitle="Local scanner lifecycle outcomes, never scan contents">
        {trend.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><CartesianGrid stroke="#d1b995" vertical={false} /><XAxis dataKey="day" tickFormatter={compactDate} minTickGap={26} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#765f4d", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={chartTooltip} labelFormatter={compactDate} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="scansStarted" name="Started" stroke="#18999c" strokeWidth={2.3} dot={false} /><Line type="monotone" dataKey="scansApplied" name="Applied" stroke="#2f936d" strokeWidth={2.3} dot={false} /><Line type="monotone" dataKey="scansIssues" name="Rejected/errors" stroke="#bd4a42" strokeWidth={2.3} dot={false} /></LineChart></ResponsiveContainer> : <EmptyChart>Scanner health appears after local scan activity.</EmptyChart>}
      </ChartPanel>
    </section>

    <section className="control-grid control-grid-bottom">
      <ChartPanel title="Scheduled probe availability" subtitle="Five-minute Worker, D1, and Durable Object checks over the last seven days" className="control-panel-wide"><HealthTimeline data={data} /></ChartPanel>
      <section className={`control-status-card${openOutage ? " is-down" : ""}`}><header>{openOutage ? <AlertTriangle /> : <CheckCircle2 />}<div><h2>{openOutage ? "Service incident open" : "Service status healthy"}</h2><p>{openOutage ? `${openOutage.failedChecks} failed probe${openOutage.failedChecks === 1 ? "" : "s"} since ${compactTime(openOutage.startedAt)}` : data.health.lastCheck ? `Last confirmed ${compactTime(data.health.lastCheck.checkedAt)}` : "Waiting for the first scheduled check"}</p></div></header><dl><div><dt>Probe availability</dt><dd>{data.health.availability === null ? "Pending" : `${data.health.availability}%`}</dd></div><div><dt>Last latency</dt><dd>{data.health.lastCheck ? `${data.health.lastCheck.latencyMs} ms` : "-"}</dd></div><div><dt>Outages retained</dt><dd>{data.health.outages.length}</dd></div></dl><small>Probe records begin at deployment and validate the scheduled Worker, D1, and Durable Object without visitor data.</small></section>
    </section>

    <section className="control-log-section">
      <header><div><span><HeartHandshake />Privacy-safe incident log</span><h2>Operational events</h2><p>Categories only. Raw exception text, screenshots, inventory, filenames, IP addresses, and browser identifiers are never kept here.</p></div><Clock3 /></header>
      {data.health.outages.length || data.health.incidents.length ? <div className="control-log-table" role="table" aria-label="Operational incidents"><div className="control-log-row control-log-heading" role="row"><span>When</span><span>Source</span><span>Event</span><span>State</span></div>{[...data.health.outages.map((outage) => ({ kind: "uptime" as const, at: outage.startedAt, outage })), ...data.health.incidents.map((incident) => ({ kind: "incident" as const, at: incident.lastSeenAt, incident }))].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 16).map((entry) => entry.kind === "uptime" ? <div className="control-log-row" role="row" key={`outage-${entry.outage.startedAt}`}><span>{compactTime(entry.outage.startedAt)}</span><span>Uptime probe</span><span>Health probe failed</span><span className={entry.outage.resolvedAt ? "control-log-ok" : "control-log-error"}>{entry.outage.resolvedAt ? `Resolved after ${duration(entry.outage.startedAt, entry.outage.resolvedAt)}` : `Open for ${duration(entry.outage.startedAt, null)}`}</span></div> : <div className="control-log-row" role="row" key={`${entry.incident.occurredAt}-${entry.incident.source}-${entry.incident.code}`}><span>{compactTime(entry.incident.lastSeenAt)}</span><span>{entry.incident.source}</span><span>{incidentName(entry.incident.code)}</span><span className={entry.incident.severity === "error" ? "control-log-error" : "control-log-warning"}>{entry.incident.count} event{entry.incident.count === 1 ? "" : "s"}</span></div>)}</div> : <div className="control-log-empty"><ShieldCheck />No incidents have been recorded yet.</div>}
    </section>
  </main>;
}

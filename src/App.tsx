import { ArrowRight, Cloud, Compass, Grid3X3, History, Redo2, TableProperties, Undo2, WandSparkles } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { ConflictDialog } from "./components/ConflictDialog";
import { HistoryDialog } from "./components/HistoryDialog";
import { Inventory } from "./components/Inventory";
import { Results } from "./components/Results";
import { Roster } from "./components/Roster";
import { SyncDialog } from "./components/SyncDialog";
import { useBuilderStore } from "./hooks/useBuilderStore";
import { optimizeAssignments } from "./lib/optimizer";
import { DATA, LATEST_META_VERSION, META_VERSIONS, countOwnedRunes, type GameMode, type MetaVersion } from "./model";

const BoardBuilder = lazy(() => import("./components/BoardBuilder").then((module) => ({ default: module.BoardBuilder })));
const Credits = lazy(() => import("./components/Credits").then((module) => ({ default: module.Credits })));
const DiscoverBoards = lazy(() => import("./components/DiscoverBoards").then((module) => ({ default: module.DiscoverBoards })));
const RunesReference = lazy(() => import("./components/RunesReference").then((module) => ({ default: module.RunesReference })));

type MobileTab = "inventory" | "roster" | "results";

function PageLoading({ label = "Loading tools" }: { label?: string }) {
  return <main className="page-state" aria-live="polite"><img src="/assets/ui/rune-smith.png" alt="" /><span>{label}</span></main>;
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page failed to render", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page-state page-state-error" role="alert">
        <img src="/assets/ui/rune-smith.png" alt="" />
        <h1>This tool could not be loaded</h1>
        <p>Your locally saved data is still safe. Reload the page to try again.</p>
        <button className="primary-button" onClick={() => window.location.reload()}>Reload page</button>
      </main>
    );
  }
}

function DeferredPage({ children, label }: { children: ReactNode; label?: string }) {
  return <PageErrorBoundary><Suspense fallback={<PageLoading label={label} />}>{children}</Suspense></PageErrorBoundary>;
}

function Brand({ title }: { title: string }) {
  return <a className="brand" href="/"><img src="/assets/ui/rune-smith.png" alt="" /><div><strong>{title}</strong><span>Lucky Defense tools</span></div></a>;
}

type PageId = "builder" | "runes" | "boards" | "discover";

function PageNavigation({ active }: { active: PageId | null }) {
  return (
    <nav className="site-nav" aria-label="Lucky Defense tools">
      <a className={active === "builder" ? "active" : ""} href="/rune-builder"><WandSparkles /><span>Builder</span></a>
      <a className={active === "runes" ? "active" : ""} href="/runes"><TableProperties /><span>Runes</span></a>
      <a className={active === "boards" ? "active" : ""} href="/board-builder"><Grid3X3 /><span>Boards</span></a>
      <a className={active === "discover" ? "active" : ""} href="/discover"><Compass /><span>Discover</span></a>
    </nav>
  );
}

const VISIT_REGISTERED_KEY = "ld-total-visit-registered";
const VISIT_TOTAL_KEY = "ld-total-visit-count";
const VISIT_TOTAL_REFRESH_KEY = "ld-total-visit-refreshed-at";
const VISIT_TOTAL_REFRESH_MS = 60 * 60 * 1000;

function readStoredNumber(key: string) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  } catch {
    return null;
  }
}

function TotalVisitorCount() {
  const [total, setTotal] = useState<number | null>(() => readStoredNumber(VISIT_TOTAL_KEY));

  useEffect(() => {
    let active = true;
    const registered = (() => {
      try { return window.localStorage.getItem(VISIT_REGISTERED_KEY) === "1"; }
      catch { return false; }
    })();
    const lastRefresh = readStoredNumber(VISIT_TOTAL_REFRESH_KEY) ?? 0;
    if (registered && Date.now() - lastRefresh < VISIT_TOTAL_REFRESH_MS) return;

    const loadTotal = async () => {
      try {
        const response = await fetch("/api/visits", {
          method: registered ? "GET" : "POST",
          cache: "no-store",
          keepalive: !registered,
        });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object" || !("total" in payload) || typeof payload.total !== "number") return;
        const nextTotal = Math.max(0, Math.floor(payload.total));
        try {
          window.localStorage.setItem(VISIT_TOTAL_KEY, String(nextTotal));
          window.localStorage.setItem(VISIT_TOTAL_REFRESH_KEY, String(Date.now()));
          if (!registered) window.localStorage.setItem(VISIT_REGISTERED_KEY, "1");
        } catch {
          // Storage is optional; the page still works when it is unavailable.
        }
        if (active) setTotal(nextTotal);
      } catch {
        // The aggregate counter is optional and never blocks the rest of the site.
      }
    };

    void loadTotal();
    return () => { active = false; };
  }, []);

  return <span className="footer-visitors" title="Approximate total browser visitors. Each browser is counted once." aria-live="polite"><i aria-hidden="true" />{total === null ? "Total visitors" : `${total.toLocaleString()} visitors`}</span>;
}

function SiteFooter() {
  const taps = useRef<number[]>([]);
  const findCredits = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((tap) => now - tap < 3500), now];
    if (taps.current.length >= 5) window.location.href = "/credits";
  };
  return (
    <footer className="site-footer">
      <span className="footer-credit">Built by <a href="/credits">FLUZ</a> for the Lucky Defense community.</span>
      <button className="footer-secret" onClick={findCredits}>Unofficial fan project. Game names and assets belong to their respective owners.</button>
      <nav aria-label="Project information">
        <a href="/privacy">Privacy</a>
        <a href="https://github.com/FLUZ13/fluz-ld-tools" target="_blank" rel="noreferrer">GitHub</a>
      </nav>
      <TotalVisitorCount />
    </footer>
  );
}

function PrivacyPage() {
  return (
    <div className="app-shell tool-shell privacy-shell">
      <header className="app-header"><Brand title="LD Privacy" /><PageNavigation active={null} /></header>
      <main className="privacy-page">
        <header className="privacy-intro"><span>Last updated August 6, 2026</span><h1>Privacy policy</h1><p>FLUZ Tools is designed to work without accounts, advertising profiles, or personal-data collection. This page explains what remains on your device, what optional features send to Cloudflare, and the controls available to you.</p></header>
        <section><h2>Information we do not request</h2><p>There is no sign-up or login. We do not ask for your name, email address, password, social profile, payment information, or game account credentials. The site does not use OAuth providers or authentication cookies.</p></section>
        <section><h2>Browser storage</h2><p>Rune inventories, assignments, board drafts, undo history, anonymous workspace credentials, and preferences are stored locally in your browser using IndexedDB or local storage. BroadcastChannel is used only to keep open tabs on the same browser in sync. This information remains on your device unless you enable a network feature or export it yourself.</p></section>
        <section><h2>Optional encrypted device sync</h2><p>When Sync Devices is used, the browser creates a random workspace ID and private sync code. Builder state is encrypted in the browser with AES-GCM before transmission. A private Cloudflare R2 bucket receives only encrypted state, an authorization verifier, revision numbers, and creation/update timestamps; the encryption key is not sent separately to the server. Revision history is limited to the most recent 20 versions.</p><p>Anyone who obtains the private sync code may be able to access the encrypted workspace, so it should be treated like a password. Reset Workspace invalidates the previous code, and the Sync Devices dialog can delete the corresponding cloud workspace.</p></section>
        <section><h2>Screenshot scanner</h2><p>Rune screenshots are decoded and analyzed locally in your browser. They are not uploaded to FLUZ Tools, Cloudflare, or a third-party recognition service. Images and temporary recognition data are discarded when the scanner is closed.</p></section>
        <section><h2>Community board publishing</h2><p>Publishing to Discover sends the board title, selected map, player count, placements, an anonymous browser-generated publisher identifier, and timestamps to Cloudflare D1. Published boards are public. Re-publishing from the same browser replaces its previous entry, and inactive entries expire after 90 days. A report sends the selected reason and an anonymous reporter identifier so repeated reports can be limited.</p></section>
        <section><h2>Backups and share links</h2><p>Downloaded backup files and PNG exports stay on your device until you choose to share them. Board share data is placed in the URL fragment, which browsers do not send to the web server as part of a normal page request.</p></section>
        <section><h2>Hosting and security</h2><p>The site and APIs run on Cloudflare. Cloudflare may process standard connection information such as IP address, request headers, and security signals to deliver the service, prevent abuse, and apply rate limits. FLUZ Tools does not intentionally store IP addresses in its application database and currently uses no advertising or behavioral analytics service.</p><p>The footer's approximate total visitor count is stored as one aggregate number. A browser registers once using local browser storage; FLUZ Tools does not send or retain a browser identifier, IP address, or browsing history for this counter.</p></section>
        <section><h2>Your controls</h2><p>You can clear site data through your browser, export or import local backups, reset an anonymous workspace, and delete its encrypted cloud copy. Clearing browser storage without a backup or sync code may permanently remove local data.</p></section>
        <section><h2>Changes and contact</h2><p>This policy may be updated when storage, publishing, or analytics features change. Material changes will be reflected by the date above. The public source code and project contact links are available on the Credits page.</p></section>
        <a href="/rune-builder" className="secondary-button privacy-return">Return to the tools</a>
      </main>
      <SiteFooter />
    </div>
  );
}

function LandingPage() {
  const tools = [
    { href: "/rune-builder", label: "Rune Builder", icon: WandSparkles, className: "builder" },
    { href: "/runes", label: "Runes", icon: TableProperties, className: "runes" },
    { href: "/board-builder", label: "Board Builder", icon: Grid3X3, className: "boards" },
  ];

  return (
    <div className="app-shell landing-shell">
      <main className="landing-page" id="main-content">
        <div className="landing-artwork" aria-hidden="true">
          <img className="landing-character landing-character-left" src="/assets/home/bamba.png" alt="" />
          <img className="landing-character landing-character-right" src="/assets/home/bandit.png" alt="" />
        </div>
        <div className="landing-content">
          <header className="landing-branding">
            <img src="/assets/ui/rune-smith.png" alt="" />
            <div>
              <span>FLUZ Tools</span><h1>Lucky Defense Tools</h1>
            </div>
          </header>
          <section className="landing-actions" aria-label="Choose a tool">
            {tools.map(({ href, label, icon: Icon, className }) => <a key={href} className={`landing-action landing-action-${className}`} href={href}><Icon /><strong>{label}</strong><ArrowRight aria-hidden="true" /></a>)}
          </section>
          <a className="landing-discover" href="/discover"><Compass /><span><strong>Community boards</strong><small>Browse the latest shared layouts</small></span><ArrowRight aria-hidden="true" /></a>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function BuilderApp() {
  const store = useBuilderStore();
  const [mobileTab, setMobileTab] = useState<MobileTab>("inventory");
  const [syncOpen, setSyncOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const recommendations = useMemo(() => optimizeAssignments(store.state), [store.state]);
  const assignments = recommendations.reduce((total, recommendation) => total + recommendation.assignments.length, 0);
  const modes: Array<{ id: GameMode; label: string }> = [{ id: "pve", label: "PvE" }, { id: "pvp", label: "PvP" }, { id: "guild", label: "Guild" }];

  if (!store.loaded) return <PageLoading label="Loading builder" />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <Brand title="LD Rune Builder" />
        <PageNavigation active="builder" />
        <div className="header-actions">
          <div className="meta-version-status">
            <label className="meta-version-select">
              <span className="visually-hidden">Rune meta version</span>
              <select value={store.state.metaVersion} onChange={(event) => store.mutate((draft) => { draft.metaVersion = event.target.value as MetaVersion; draft.metaVersionHasBeenSelected = true; })}>
                {META_VERSIONS.map((version) => <option key={version} value={version}>v{version}</option>)}
              </select>
            </label>
            <span className={`meta-version-indicator ${store.state.metaVersion === LATEST_META_VERSION ? "current" : "legacy"}`} role="status">Current: v{store.state.metaVersion}{store.state.metaVersion === LATEST_META_VERSION ? " (latest)" : " (older)"}</span>
          </div>
          <nav className="mode-control" aria-label="Game mode">{modes.map((mode) => <button key={mode.id} className={store.state.mode === mode.id ? "active" : ""} onClick={() => store.mutate((draft) => { draft.mode = mode.id; })}>{mode.label}</button>)}</nav>
          <button className="icon-button" onClick={store.undo} disabled={!store.canUndo} title="Undo" aria-label="Undo"><Undo2 /></button>
          <button className="icon-button" onClick={store.redo} disabled={!store.canRedo} title="Redo" aria-label="Redo"><Redo2 /></button>
          <button className="icon-button" onClick={() => { void store.refreshHistory(); setHistoryOpen(true); }} title="Version history" aria-label="Version history"><History /></button>
          <button className={`sync-button ${store.syncStatus}`} onClick={() => setSyncOpen(true)}><Cloud /><span>{store.syncStatus === "saved" ? "Saved" : store.syncStatus === "saving" ? "Saving" : store.syncStatus === "offline" ? "Offline" : "Sync"}</span></button>
        </div>
      </header>

      <div className="status-strip">
        <span>{countOwnedRunes(store.state)} runes</span><i />
        <span>{store.state.selectedImmortalIds.length} Immortals</span><i />
        <span>{assignments} assignments</span>
        <span className="dataset-version">Meta v{store.state.metaVersion} - Data {DATA.datasetVersion}</span>
      </div>

      <nav className="mobile-tabs" aria-label="Builder sections">
        {(["inventory", "roster", "results"] as MobileTab[]).map((tab, index) => <button key={tab} className={mobileTab === tab ? "active" : ""} onClick={() => setMobileTab(tab)}><span>{index + 1}</span>{tab === "results" ? "Setup" : tab[0].toUpperCase() + tab.slice(1)}</button>)}
      </nav>

      <main className="builder-layout" id="main-content">
        <h1 className="visually-hidden">Lucky Defense rune builder</h1>
        <div className={`inventory-column mobile-${mobileTab}`}><Inventory state={store.state} mutate={store.mutate} onExport={store.exportBackup} onImport={store.importBackup} /></div>
        <div className={`roster-column mobile-${mobileTab}`}><Roster state={store.state} mutate={store.mutate} /></div>
        <div className={`results-column mobile-${mobileTab}`}><Results state={store.state} recommendations={recommendations} /></div>
      </main>

      <SiteFooter />

      {syncOpen && <SyncDialog syncCode={store.syncCode} status={store.syncStatus} onClose={() => setSyncOpen(false)} onImport={store.importSyncCode} onReset={store.resetWorkspace} />}
      {historyOpen && <HistoryDialog entries={store.history} onRestore={store.restoreHistory} onClose={() => setHistoryOpen(false)} />}
      {store.conflict && <ConflictDialog device={store.conflict.device} cloud={store.conflict.cloud} onResolve={store.resolveConflict} />}
    </div>
  );
}

function RunesPage() {
  return (
    <div className="app-shell reference-shell">
      <header className="app-header">
        <Brand title="LD Rune Data" />
        <PageNavigation active="runes" />
        <div className="reference-header-copy">Full rune and Immortal recommendation matrix</div>
      </header>
      <DeferredPage label="Loading rune data"><RunesReference /></DeferredPage>
      <SiteFooter />
    </div>
  );
}

function ToolPage({ active, title, children }: { active: PageId | null; title: string; children: ReactNode }) {
  return <div className="app-shell tool-shell"><header className="app-header"><Brand title={title} /><PageNavigation active={active} /></header>{children}<SiteFooter /></div>;
}

function NotFoundPage() {
  return (
    <div className="app-shell tool-shell">
      <header className="app-header"><Brand title="LD Tools" /><PageNavigation active={null} /></header>
      <main className="page-state page-state-error" id="main-content">
        <img src="/assets/ui/rune-smith.png" alt="" />
        <span>Error 404</span>
        <h1>This page does not exist</h1>
        <p>Choose a tool to continue. Your locally saved builder data has not been changed.</p>
        <a className="primary-button" href="/">Open tool selection</a>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function App() {
  if (window.location.pathname === "/") return <LandingPage />;
  if (window.location.pathname === "/privacy") return <PrivacyPage />;
  if (window.location.pathname === "/runes") return <RunesPage />;
  if (window.location.pathname === "/rune-builder") return <BuilderApp />;
  if (window.location.pathname === "/board-builder") return <ToolPage active="boards" title="LD Board Builder"><DeferredPage label="Loading board builder"><BoardBuilder /></DeferredPage></ToolPage>;
  if (window.location.pathname === "/discover") return <ToolPage active="discover" title="LD Boards"><DeferredPage label="Loading community boards"><DiscoverBoards /></DeferredPage></ToolPage>;
  if (window.location.pathname === "/calculators") {
    window.history.replaceState(null, "", "/rune-builder");
    return <BuilderApp />;
  }
  if (window.location.pathname === "/credits") return <ToolPage active={null} title="LD Credits"><DeferredPage label="Loading credits"><Credits /></DeferredPage></ToolPage>;
  return <NotFoundPage />;
}

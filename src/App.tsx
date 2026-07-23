import { Cloud, Compass, Grid3X3, History, Redo2, TableProperties, Undo2, WandSparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { BoardBuilder } from "./components/BoardBuilder";
import { ConflictDialog } from "./components/ConflictDialog";
import { Credits } from "./components/Credits";
import { DiscoverBoards } from "./components/DiscoverBoards";
import { HistoryDialog } from "./components/HistoryDialog";
import { Inventory } from "./components/Inventory";
import { Results } from "./components/Results";
import { Roster } from "./components/Roster";
import { RunesReference } from "./components/RunesReference";
import { SyncDialog } from "./components/SyncDialog";
import { useBuilderStore } from "./hooks/useBuilderStore";
import { optimizeAssignments } from "./lib/optimizer";
import { DATA, countOwnedRunes, type GameMode } from "./model";

type MobileTab = "inventory" | "roster" | "results";

function Brand({ title }: { title: string }) {
  return <a className="brand" href="/rune-builder"><img src="/assets/ui/rune-smith.png" alt="" /><div><strong>{title}</strong><span>Lucky Defense tools</span></div></a>;
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

function SiteFooter() {
  const taps = useRef<number[]>([]);
  const findCredits = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((tap) => now - tap < 3500), now];
    if (taps.current.length >= 5) window.location.href = "/credits";
  };
  return <footer className="site-footer"><span className="footer-credit">Built by <a href="/credits">FLUZ</a> for the Lucky Defense community.</span><button className="footer-secret" onClick={findCredits}>Unofficial fan project. Game names and assets belong to their respective owners.</button><a href="/privacy">Privacy</a></footer>;
}

function PrivacyPage() {
  return (
    <div className="app-shell tool-shell privacy-shell">
      <header className="app-header"><Brand title="LD Privacy" /><PageNavigation active={null} /></header>
      <main className="privacy-page">
        <header className="privacy-intro"><span>Last updated July 23, 2026</span><h1>Privacy policy</h1><p>FLUZ Tools is designed to work without accounts, advertising profiles, or personal-data collection. This page explains what remains on your device, what optional features send to Cloudflare, and the controls available to you.</p></header>
        <section><h2>Information we do not request</h2><p>There is no sign-up or login. We do not ask for your name, email address, password, social profile, payment information, or game account credentials. The site does not use OAuth providers or authentication cookies.</p></section>
        <section><h2>Browser storage</h2><p>Rune inventories, assignments, board drafts, undo history, anonymous workspace credentials, and preferences are stored locally in your browser using IndexedDB or local storage. BroadcastChannel is used only to keep open tabs on the same browser in sync. This information remains on your device unless you enable a network feature or export it yourself.</p></section>
        <section><h2>Optional encrypted device sync</h2><p>When Sync Devices is used, the browser creates a random workspace ID and private sync code. Builder state is encrypted in the browser with AES-GCM before transmission. Cloudflare D1 receives encrypted state, an authorization verifier, revision numbers, and creation/update timestamps; the encryption key is not sent separately to the server. Revision history is limited to the most recent 20 versions.</p><p>Anyone who obtains the private sync code may be able to access the encrypted workspace, so it should be treated like a password. Reset Workspace invalidates the previous code, and the Sync Devices dialog can delete the corresponding cloud workspace.</p></section>
        <section><h2>Community board publishing</h2><p>Publishing to Discover sends the board title, selected map, player count, placements, an anonymous browser-generated publisher identifier, and timestamps to Cloudflare D1. Published boards are public. Re-publishing from the same browser replaces its previous entry, and inactive entries expire after 90 days.</p></section>
        <section><h2>Backups and share links</h2><p>Downloaded backup files and PNG exports stay on your device until you choose to share them. Board share data is placed in the URL fragment, which browsers do not send to the web server as part of a normal page request.</p></section>
        <section><h2>Hosting and security</h2><p>The site and APIs run on Cloudflare. Cloudflare may process standard connection information such as IP address, request headers, and security signals to deliver the service, prevent abuse, and apply rate limits. FLUZ Tools does not intentionally store IP addresses in its application database and currently uses no advertising or behavioral analytics service.</p></section>
        <section><h2>Your controls</h2><p>You can clear site data through your browser, export or import local backups, reset an anonymous workspace, and delete its encrypted cloud copy. Clearing browser storage without a backup or sync code may permanently remove local data.</p></section>
        <section><h2>Changes and contact</h2><p>This policy may be updated when storage, publishing, or analytics features change. Material changes will be reflected by the date above. Project contact and source-code links will be published on the Credits page when the public repository is available.</p></section>
        <a href="/rune-builder" className="secondary-button privacy-return">Return to the tools</a>
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

  if (!store.loaded) return <div className="loading-screen"><img src="/assets/ui/rune-smith.png" alt="" /><span>Loading builder</span></div>;

  return (
    <div className="app-shell">
      <header className="app-header">
        <Brand title="LD Rune Builder" />
        <PageNavigation active="builder" />
        <nav className="mode-control" aria-label="Game mode">{modes.map((mode) => <button key={mode.id} className={store.state.mode === mode.id ? "active" : ""} onClick={() => store.mutate((draft) => { draft.mode = mode.id; })}>{mode.label}</button>)}</nav>
        <nav className="meta-version-control" aria-label="Rune meta version">
          <button className={store.state.metaVersion === "1.0" ? "active" : ""} onClick={() => store.mutate((draft) => { draft.metaVersion = "1.0"; })}>v1.0</button>
          <button className={store.state.metaVersion === "1.1" ? "active" : ""} onClick={() => store.mutate((draft) => { draft.metaVersion = "1.1"; })}>v1.1</button>
        </nav>
        <div className="header-actions">
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
        <span className="dataset-version">Meta v{store.state.metaVersion} · Data {DATA.datasetVersion}</span>
      </div>

      <nav className="mobile-tabs" aria-label="Builder sections">
        {(["inventory", "roster", "results"] as MobileTab[]).map((tab, index) => <button key={tab} className={mobileTab === tab ? "active" : ""} onClick={() => setMobileTab(tab)}><span>{index + 1}</span>{tab === "results" ? "Setup" : tab[0].toUpperCase() + tab.slice(1)}</button>)}
      </nav>

      <main className="builder-layout">
        <div className={`inventory-column mobile-${mobileTab}`}><Inventory state={store.state} mutate={store.mutate} onExport={store.exportBackup} onImport={store.importBackup} /></div>
        <div className={`roster-column mobile-${mobileTab}`}><Roster state={store.state} mutate={store.mutate} /></div>
        <div className={`results-column mobile-${mobileTab}`}><Results state={store.state} recommendations={recommendations} mutate={store.mutate} /></div>
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
      <RunesReference />
      <SiteFooter />
    </div>
  );
}

function ToolPage({ active, title, children }: { active: PageId; title: string; children: React.ReactNode }) {
  return <div className="app-shell tool-shell"><header className="app-header"><Brand title={title} /><PageNavigation active={active} /></header>{children}<SiteFooter /></div>;
}

export default function App() {
  if (window.location.pathname === "/privacy") return <PrivacyPage />;
  if (window.location.pathname === "/runes") return <RunesPage />;
  if (window.location.pathname === "/board-builder") return <ToolPage active="boards" title="LD Board Builder"><BoardBuilder /></ToolPage>;
  if (window.location.pathname === "/discover") return <ToolPage active="discover" title="LD Boards"><DiscoverBoards /></ToolPage>;
  if (window.location.pathname === "/calculators") {
    window.history.replaceState(null, "", "/rune-builder");
    return <BuilderApp />;
  }
  if (window.location.pathname === "/credits") return <div className="app-shell credits-shell"><Credits /><SiteFooter /></div>;
  return <BuilderApp />;
}

const VISITOR_SEED_KEY = "ld-analytics-visitor-seed";
const VISITOR_HASH_KEY = "ld-analytics-visitor-hash";
const PAGE_VIEW_ENDPOINT = "/api/analytics/event";

type AnalyticsPage = "home" | "builder" | "runes" | "boards" | "discover" | "credits" | "privacy";
type AnalyticsEvent = "page_view" | "scanner_started" | "scanner_applied" | "scanner_rejected" | "scanner_error";

const routePages: Array<[RegExp, AnalyticsPage]> = [
  [/^\/$/, "home"],
  [/^\/rune-builder$/, "builder"],
  [/^\/calculators$/, "builder"],
  [/^\/runes$/, "runes"],
  [/^\/board-builder$/, "boards"],
  [/^\/discover$/, "discover"],
  [/^\/credits$/, "credits"],
  [/^\/privacy$/, "privacy"],
];

function pageForPath(pathname: string) {
  return routePages.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getVisitorHash() {
  try {
    const cached = window.localStorage.getItem(VISITOR_HASH_KEY);
    if (cached && /^[a-f0-9]{64}$/.test(cached)) return cached;
    let seed = window.localStorage.getItem(VISITOR_SEED_KEY);
    if (!seed) {
      seed = crypto.randomUUID();
      window.localStorage.setItem(VISITOR_SEED_KEY, seed);
    }
    const hash = await sha256Hex(seed);
    window.localStorage.setItem(VISITOR_HASH_KEY, hash);
    return hash;
  } catch {
    return sha256Hex(crypto.randomUUID());
  }
}

function sendPayload(payload: { event: AnalyticsEvent; page?: AnalyticsPage; visitorHash: string }) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(PAGE_VIEW_ENDPOINT, blob)) return;
    }
  } catch {
    // Analytics is optional and must never affect the tools.
  }
  void fetch(PAGE_VIEW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

export async function trackAnalyticsEvent(event: AnalyticsEvent, page: AnalyticsPage | null = pageForPath(window.location.pathname)) {
  if (!page) return;
  const visitorHash = await getVisitorHash();
  sendPayload({ event, page, visitorHash });
}

export function installPageAnalytics() {
  let lastPage: AnalyticsPage | null = null;
  let lastTrackedAt = 0;
  const trackCurrentPage = () => {
    const page = pageForPath(window.location.pathname);
    if (!page) return;
    const now = Date.now();
    if (page === lastPage && now - lastTrackedAt < 1_000) return;
    lastPage = page;
    lastTrackedAt = now;
    void trackAnalyticsEvent("page_view", page);
  };

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  window.history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    window.setTimeout(trackCurrentPage, 0);
    return result;
  };
  window.history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    window.setTimeout(trackCurrentPage, 0);
    return result;
  };
  window.addEventListener("popstate", trackCurrentPage);
  window.addEventListener("hashchange", trackCurrentPage);
  trackCurrentPage();

  return () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", trackCurrentPage);
    window.removeEventListener("hashchange", trackCurrentPage);
  };
}

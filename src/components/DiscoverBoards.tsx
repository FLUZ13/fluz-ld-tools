import { Check, Clock3, Copy, ExternalLink, Flag, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BoardApiError, fetchPublishedBoards, reportPublishedBoard } from "../board/api";
import { encodeSharedBoard } from "../board/export";
import { BOARD_MAPS, getBoardMap, normalizeBoardMapId, type BoardState, type PublishedBoard } from "../board/model";
import { BoardPreview } from "./BoardPreview";

export function DiscoverBoards() {
  const [boards, setBoards] = useState<PublishedBoard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("all");
  const [players, setPlayers] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const filters = { map: map === "all" ? undefined : map, players: players === "all" ? undefined : players as "1" | "2", query };

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetchPublishedBoards({ ...filters, before: cursor });
      setBoards((current) => [...current, ...result.boards]);
      setCursor(result.nextCursor);
      setError("");
    } catch (loadError) {
      if (loadError instanceof BoardApiError) setError(`${loadError.message}${loadError.requestId ? ` Reference: ${loadError.requestId}` : ""}`);
      else setError("Recent boards are temporarily unavailable.");
    } finally { setLoadingMore(false); }
  };

  const refresh = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    return fetchPublishedBoards({ ...filters, signal }).then((result) => {
      setBoards(result.boards);
      setCursor(result.nextCursor);
    }).catch((loadError: unknown) => {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      if (loadError instanceof BoardApiError) setError(`${loadError.message}${loadError.requestId ? ` Reference: ${loadError.requestId}` : ""}`);
      else setError("Recent boards are temporarily unavailable.");
    }).finally(() => { if (!signal?.aborted) setLoading(false); });
  // Primitive filter values are the intentional dependencies for this request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, players, query]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { void refresh(controller.signal); }, query ? 250 : 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query, map, players, refresh]);

  const visibleBoards = boards.filter((board) => !hiddenIds.has(board.boardId));

  const boardUrl = (board: PublishedBoard) => {
    const state: BoardState = { schemaVersion: 1, id: board.boardId, title: board.title, map: normalizeBoardMapId(board.map), players: board.players, slots: board.slots, updatedAt: board.updatedAt };
    const url = new URL("/board-builder", window.location.origin);
    url.hash = new URLSearchParams({ board: encodeSharedBoard(state) }).toString();
    return url.toString();
  };

  const copyBoardLink = async (board: PublishedBoard) => {
    await navigator.clipboard.writeText(boardUrl(board));
    setCopiedId(board.boardId);
    window.setTimeout(() => setCopiedId((current) => current === board.boardId ? "" : current), 1800);
  };

  const reportBoard = async (board: PublishedBoard) => {
    if (!window.confirm(`Hide and report "${board.title}" as inappropriate or spam?`)) return;
    setHiddenIds((current) => new Set(current).add(board.boardId));
    try { await reportPublishedBoard(board.boardId, "inappropriate"); }
    catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Could not report this board.");
    }
  };

  return (
    <main className="discover-page" id="main-content">
      <section className="discover-heading">
        <div><h1>Community boards</h1><p>One latest export per anonymous browser, so repeat exports never flood the gallery.</p></div>
        <a className="primary-button" href="/board-builder">Build a board</a>
      </section>
      <section className="discover-filters">
        <label className="search-field"><Search /><input value={query} maxLength={60} onChange={(event) => setQuery(event.target.value)} placeholder="Search board titles" /></label>
        <label className="select-control"><span>Map</span><select value={map} onChange={(event) => setMap(event.target.value)}><option value="all">All maps</option>{BOARD_MAPS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="select-control"><span>Layout</span><select value={players} onChange={(event) => setPlayers(event.target.value)}><option value="all">All layouts</option><option value="1">1 player</option><option value="2">2 players</option></select></label>
      </section>
      {loading && <div className="discover-status" role="status">Loading recent boards...</div>}
      {!loading && error && <div className="discover-status discover-error" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => { void refresh(); }}><RefreshCw />Retry</button></div>}
      {!loading && !error && visibleBoards.length === 0 && <div className="discover-status">No boards match these filters yet.</div>}
      <section className="discover-grid">{visibleBoards.map((board) => (
        <article className="discover-card" key={board.boardId}>
          <BoardPreview board={board} compact />
          <div className="discover-card-copy"><div><h2>{board.title}</h2><span><Clock3 />{new Date(board.updatedAt).toLocaleDateString()} - {getBoardMap(board.map).name} - {board.players}P</span></div><div className="discover-actions"><button className="icon-button" onClick={() => { void copyBoardLink(board); }} title="Copy board link" aria-label={copiedId === board.boardId ? "Board link copied" : "Copy board link"}>{copiedId === board.boardId ? <Check /> : <Copy />}</button><a className="icon-button" href={boardUrl(board)} title="Open in board builder" aria-label="Open in board builder"><ExternalLink /></a><button className="icon-button report-button" onClick={() => { void reportBoard(board); }} title="Hide and report board" aria-label="Hide and report board"><Flag /></button></div></div>
        </article>
      ))}</section>
      {cursor && !error && <button className="secondary-button discover-more" disabled={loadingMore} onClick={() => { void loadMore(); }}>{loadingMore ? "Loading..." : "Load more"}</button>}
    </main>
  );
}

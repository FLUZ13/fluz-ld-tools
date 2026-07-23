import { Clock3, Copy, ExternalLink, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchPublishedBoards } from "../board/api";
import { encodeSharedBoard } from "../board/export";
import { BOARD_MAPS, getBoardMap, normalizeBoardMapId, type BoardState, type PublishedBoard } from "../board/model";
import { BoardPreview } from "./BoardPreview";

export function DiscoverBoards() {
  const [boards, setBoards] = useState<PublishedBoard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [map, setMap] = useState("all");
  const [players, setPlayers] = useState("all");
  const [status, setStatus] = useState("Loading recent boards...");

  const load = async (next?: string) => {
    try {
      const result = await fetchPublishedBoards(next);
      setBoards((current) => next ? [...current, ...result.boards] : result.boards);
      setCursor(result.nextCursor);
      setStatus(result.boards.length === 0 && !next ? "No community boards have been exported yet." : "");
    } catch { setStatus("Recent boards are temporarily unavailable."); }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => boards.filter((board) =>
    board.title.toLowerCase().includes(query.toLowerCase()) && (map === "all" || normalizeBoardMapId(board.map) === map) && (players === "all" || String(board.players) === players),
  ), [boards, map, players, query]);

  const boardUrl = (board: PublishedBoard) => {
    const state: BoardState = { schemaVersion: 1, id: board.boardId, title: board.title, map: normalizeBoardMapId(board.map), players: board.players, slots: board.slots, updatedAt: board.updatedAt };
    const url = new URL("/board-builder", window.location.origin);
    url.hash = new URLSearchParams({ board: encodeSharedBoard(state) }).toString();
    return url.toString();
  };

  return (
    <main className="discover-page">
      <section className="discover-heading">
        <div><h1>Community boards</h1><p>One latest export per anonymous browser, so repeat exports never flood the gallery.</p></div>
        <a className="primary-button" href="/board-builder">Build a board</a>
      </section>
      <section className="discover-filters">
        <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search board titles" /></label>
        <label className="select-control"><span>Map</span><select value={map} onChange={(event) => setMap(event.target.value)}><option value="all">All maps</option>{BOARD_MAPS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="select-control"><span>Layout</span><select value={players} onChange={(event) => setPlayers(event.target.value)}><option value="all">All layouts</option><option value="1">1 player</option><option value="2">2 players</option></select></label>
      </section>
      {status && <div className="discover-status">{status}</div>}
      <section className="discover-grid">{filtered.map((board) => (
        <article className="discover-card" key={board.boardId}>
          <BoardPreview board={board} compact />
          <div className="discover-card-copy"><div><h2>{board.title}</h2><span><Clock3 />{new Date(board.updatedAt).toLocaleDateString()} - {getBoardMap(board.map).name} - {board.players}P</span></div><div className="discover-actions"><button className="icon-button" onClick={() => { void navigator.clipboard.writeText(boardUrl(board)); }} title="Copy board link" aria-label="Copy board link"><Copy /></button><a className="icon-button" href={boardUrl(board)} title="Open in board builder" aria-label="Open in board builder"><ExternalLink /></a></div></div>
        </article>
      ))}</section>
      {cursor && <button className="secondary-button discover-more" onClick={() => { void load(cursor); }}>Load more</button>}
    </main>
  );
}

import { Check, Clock3, Copy, ExternalLink, Flag, LoaderCircle, LogIn, LogOut, MessageCircle, RefreshCw, Search, Send, ShieldCheck, Trash2, Wrench, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { BoardApiError, deletePublishedBoardComment, fetchModeratorSession, fetchPublishedBoardComments, fetchPublishedBoards, loginModerator, logoutModerator, postPublishedBoardComment, reportPublishedBoard, type PublishedBoardComment } from "../board/api";
import { encodeSharedBoard } from "../board/export";
import { BOARD_MAPS, getBoardMap, normalizeBoardMapId, type BoardState, type PublishedBoard } from "../board/model";
import { BoardPreview } from "./BoardPreview";

interface BoardCommentsProps {
  board: PublishedBoard;
  onCommentAdded: (boardId: string) => void;
  onCommentDeleted: (boardId: string) => void;
  isModerator: boolean;
}

function BoardComments({ board, onCommentAdded, onCommentDeleted, isModerator }: BoardCommentsProps) {
  const [comments, setComments] = useState<PublishedBoardComment[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetchPublishedBoardComments(board.boardId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setComments(result.comments);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Could not load comments.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [board.boardId, board.commentCount]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = message.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await postPublishedBoardComment(board.boardId, body);
      setComments((current) => [...current, result.comment]);
      setMessage("");
      onCommentAdded(board.boardId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not post this comment.");
    } finally { setSending(false); }
  };

  const removeComment = async (commentId: string) => {
    if (!window.confirm("Delete this comment?")) return;
    setDeletingId(commentId);
    setError("");
    try {
      await deletePublishedBoardComment(board.boardId, commentId);
      setComments((current) => current.filter((comment) => comment.commentId !== commentId));
      onCommentDeleted(board.boardId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete comment.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <section className="discover-comments" aria-label={`Comments for ${board.title}`}>
      <div className="discover-comments-heading"><strong><MessageCircle />Comments {board.commentCount > 0 ? `(${board.commentCount})` : ""}</strong><span>Anonymous</span></div>
      {loading && <p className="comments-status"><LoaderCircle />Loading comments...</p>}
      {!loading && comments.length > 0 && <ul className="comment-list">{comments.map((comment) => <li key={comment.commentId}><p>{comment.body}</p><div className="comment-meta"><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString()}</time>{isModerator && <button className="comment-delete" type="button" disabled={deletingId === comment.commentId} onClick={() => { void removeComment(comment.commentId); }} title="Delete comment" aria-label="Delete comment">{deletingId === comment.commentId ? <LoaderCircle className="moderator-spin" /> : <Trash2 />}</button>}</div></li>)}</ul>}
      {!loading && comments.length === 0 && <p className="comments-empty">No comments yet.</p>}
      {error && <p className="comments-error" role="alert">{error}</p>}
      <form className="comment-compose" onSubmit={submit}>
        <label className="sr-only" htmlFor={`comment-${board.boardId}`}>Add a comment</label>
        <input id={`comment-${board.boardId}`} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Add a comment" aria-describedby={`${board.boardId}-comment-limit`} />
        <button className="icon-button" type="submit" disabled={!message.trim() || sending} title="Post comment" aria-label="Post comment">{sending ? <LoaderCircle /> : <Send />}</button>
      </form>
      <small id={`${board.boardId}-comment-limit`}>{message.length}/500</small>
    </section>
  );
}

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
  const [commentsBoard, setCommentsBoard] = useState<PublishedBoard | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [moderatorPanelOpen, setModeratorPanelOpen] = useState(false);
  const [moderatorUsername, setModeratorUsername] = useState("");
  const [moderatorPassword, setModeratorPassword] = useState("");
  const [moderatorBusy, setModeratorBusy] = useState(false);
  const [moderatorError, setModeratorError] = useState("");

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

  useEffect(() => {
    const controller = new AbortController();
    void fetchModeratorSession(controller.signal)
      .then((result) => setIsModerator(result.authenticated))
      .catch(() => setIsModerator(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!commentsBoard && !moderatorPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCommentsBoard(null);
      setModeratorPanelOpen(false);
      setModeratorPassword("");
      setModeratorError("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [commentsBoard, moderatorPanelOpen]);

  const visibleBoards = boards.filter((board) => !hiddenIds.has(board.boardId));
  const activeCommentsBoard = commentsBoard ? boards.find((board) => board.boardId === commentsBoard.boardId) ?? commentsBoard : null;

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
    catch (reportError) { setError(reportError instanceof Error ? reportError.message : "Could not report this board."); }
  };

  const increaseCommentCount = (boardId: string) => {
    setBoards((current) => current.map((board) => board.boardId === boardId ? { ...board, commentCount: board.commentCount + 1 } : board));
  };

  const decreaseCommentCount = (boardId: string) => {
    setBoards((current) => current.map((board) => board.boardId === boardId ? { ...board, commentCount: Math.max(0, board.commentCount - 1) } : board));
  };

  const submitModeratorLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (moderatorBusy) return;
    setModeratorBusy(true);
    setModeratorError("");
    try {
      const result = await loginModerator(moderatorUsername, moderatorPassword);
      setIsModerator(result.authenticated);
      setModeratorPassword("");
      if (!result.authenticated) setModeratorError("Sign in was not accepted.");
    } catch (loginError) {
      setModeratorError(loginError instanceof Error ? loginError.message : "Could not sign in.");
    } finally {
      setModeratorBusy(false);
    }
  };

  const signOutModerator = async () => {
    setModeratorBusy(true);
    setModeratorError("");
    try {
      await logoutModerator();
      setIsModerator(false);
      setModeratorPanelOpen(false);
      setModeratorUsername("");
      setModeratorPassword("");
    } catch (logoutError) {
      setModeratorError(logoutError instanceof Error ? logoutError.message : "Could not sign out.");
    } finally {
      setModeratorBusy(false);
    }
  };

  const closeModeratorPanel = () => {
    setModeratorPanelOpen(false);
    setModeratorPassword("");
    setModeratorError("");
  };

  return (
    <main className="discover-page" id="main-content">
      <section className="discover-heading">
        <div><h1>Community boards</h1><p>Boards shared by the community. Every Share adds a new board to the gallery.</p></div>
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
          <div className="discover-card-copy"><div><h2>{board.title}</h2><span><Clock3 />{new Date(board.updatedAt).toLocaleDateString()} - {getBoardMap(board.map).name} - {board.players}P</span></div><div className="discover-actions"><button className="icon-button" onClick={() => { void copyBoardLink(board); }} title="Copy board link" aria-label={copiedId === board.boardId ? "Board link copied" : "Copy board link"}>{copiedId === board.boardId ? <Check /> : <Copy />}</button>{board.players === 2 && <button className="icon-button" onClick={() => setCommentsBoard(board)} title="Comments" aria-label={`Comments (${board.commentCount})`}><MessageCircle /></button>}<a className="icon-button" href={boardUrl(board)} title="Open in board builder" aria-label="Open in board builder"><ExternalLink /></a><button className="icon-button report-button" onClick={() => { void reportBoard(board); }} title="Hide and report board" aria-label="Hide and report board"><Flag /></button></div></div>
          {board.players === 1 && <BoardComments board={board} onCommentAdded={increaseCommentCount} onCommentDeleted={decreaseCommentCount} isModerator={isModerator} />}
        </article>
      ))}</section>
      {cursor && !error && <button className="secondary-button discover-more" disabled={loadingMore} onClick={() => { void loadMore(); }}>{loadingMore ? "Loading..." : "Load more"}</button>}
      {activeCommentsBoard && <div className="comments-dialog-backdrop" role="presentation" onMouseDown={() => setCommentsBoard(null)}><section className="comments-dialog" role="dialog" aria-modal="true" aria-labelledby="board-comments-title" onMouseDown={(event) => event.stopPropagation()}><header><div><h2 id="board-comments-title">Comments</h2><p>{activeCommentsBoard.title}</p></div><button className="icon-button" onClick={() => setCommentsBoard(null)} aria-label="Close comments"><X /></button></header><BoardComments board={activeCommentsBoard} onCommentAdded={increaseCommentCount} onCommentDeleted={decreaseCommentCount} isModerator={isModerator} /></section></div>}
      <button className={`moderator-entry icon-button${isModerator ? " is-active" : ""}`} type="button" onClick={() => { setModeratorPanelOpen(true); setModeratorError(""); }} title={isModerator ? "Moderator tools" : "Moderator sign in"} aria-label={isModerator ? "Open moderator tools" : "Moderator sign in"}><Wrench /></button>
      {moderatorPanelOpen && <div className="comments-dialog-backdrop moderator-dialog-backdrop" role="presentation" onMouseDown={closeModeratorPanel}><section className="moderator-dialog" role="dialog" aria-modal="true" aria-labelledby="moderator-title" onMouseDown={(event) => event.stopPropagation()}><header><div><h2 id="moderator-title">Moderator</h2><p>{isModerator ? "Comment moderation is enabled." : "Sign in to manage community comments."}</p></div><button className="icon-button" type="button" onClick={closeModeratorPanel} aria-label="Close moderator tools"><X /></button></header>{isModerator ? <div className="moderator-authenticated"><span><ShieldCheck />Moderator mode is enabled</span><p>Delete controls appear beside each community comment.</p><button className="secondary-button" type="button" disabled={moderatorBusy} onClick={() => { void signOutModerator(); }}><LogOut />Sign out</button></div> : <form className="moderator-form" onSubmit={submitModeratorLogin}><label>Username<input value={moderatorUsername} onChange={(event) => setModeratorUsername(event.target.value)} autoComplete="username" maxLength={128} required /></label><label>Password<input type="password" value={moderatorPassword} onChange={(event) => setModeratorPassword(event.target.value)} autoComplete="current-password" maxLength={512} required /></label>{moderatorError && <p className="form-error" role="alert">{moderatorError}</p>}<button className="primary-button" type="submit" disabled={moderatorBusy || !moderatorUsername || !moderatorPassword}>{moderatorBusy ? <LoaderCircle className="moderator-spin" /> : <LogIn />}Sign in</button></form>}</section></div>}
    </main>
  );
}

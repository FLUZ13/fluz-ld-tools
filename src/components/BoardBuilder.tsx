import { Check, Copy, Eraser, FileDown, FileUp, ImageDown, Plus, Redo2, Save, Search, Share2, Trash2, Undo2, Users, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { publishBoard } from "../board/api";
import { decodeSharedBoard, downloadBlob, encodeSharedBoard, renderBoardPng } from "../board/export";
import { BOARD_GUARDIANS, BOARD_MAPS, createBoardState, getBoardMap, migrateBoardState, type BoardState, type GuardianRarity } from "../board/model";
import { deleteBoardSnapshot, listBoardSnapshots, loadBoardDraft, saveBoardDraft, saveBoardSnapshot } from "../board/storage";

type GuardianFilter = GuardianRarity | "all" | "basic";
type BoardSlot = { player: number; slot: number };
type BoardCanvasSize = { width: number; height: number };

const rarities: Array<{ id: GuardianFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "basic", label: "Basic Guardians" },
  { id: "mythic", label: "Mythic" }, { id: "immortal", label: "Immortal" },
];
const MIN_BOARD_ZOOM = 55;
const MAX_BOARD_ZOOM = 100;

function loadBoardZoom() {
  const stored = localStorage.getItem("ld-board-zoom");
  if (stored === null) return 75;
  const saved = Number(stored);
  return Number.isFinite(saved) ? Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, saved)) : 75;
}

function fileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lucky-defense-board";
}

export function BoardBuilder() {
  const [board, setBoard] = useState(createBoardState);
  const [loaded, setLoaded] = useState(false);
  const [selectedGuardian, setSelectedGuardian] = useState<string | null>(null);
  const [rarity, setRarity] = useState<GuardianFilter>("all");
  const [query, setQuery] = useState("");
  const [savedBoards, setSavedBoards] = useState<BoardState[]>([]);
  const [notice, setNotice] = useState("");
  const [past, setPast] = useState<BoardState[]>([]);
  const [future, setFuture] = useState<BoardState[]>([]);
  const [boardZoom, setBoardZoom] = useState(loadBoardZoom);
  const [draggedSlot, setDraggedSlot] = useState<BoardSlot | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardSlot | null>(null);
  const [boardCanvasSize, setBoardCanvasSize] = useState<BoardCanvasSize>({ width: 0, height: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const receivedRemoteUpdate = useRef(false);
  const boardStageRef = useRef<HTMLElement>(null);
  const boardCanvasRef = useRef<HTMLDivElement>(null);

  const refreshSaved = useCallback(async () => setSavedBoards(await listBoardSnapshots()), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const shared = new URLSearchParams(window.location.hash.slice(1)).get("board");
      let initial: unknown;
      if (shared) {
        try { initial = decodeSharedBoard(shared); } catch { setNotice("That shared board link is invalid."); }
      }
      initial ??= await loadBoardDraft();
      const migrated = migrateBoardState(initial);
      if (active && migrated) setBoard(migrated);
      if (active) { setLoaded(true); await refreshSaved(); }
    })();
    channel.current = new BroadcastChannel("ld-board-builder");
    channel.current.onmessage = (event) => {
      const migrated = migrateBoardState(event.data);
      if (migrated) {
        receivedRemoteUpdate.current = true;
        setBoard(migrated);
      }
    };
    return () => { active = false; channel.current?.close(); };
  }, [refreshSaved]);

  useEffect(() => {
    if (!loaded) return;
    const cameFromAnotherTab = receivedRemoteUpdate.current;
    receivedRemoteUpdate.current = false;
    const timeout = window.setTimeout(() => {
      void saveBoardDraft(board);
      if (!cameFromAnotherTab) channel.current?.postMessage(board);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [board, loaded]);

  useEffect(() => {
    localStorage.setItem("ld-board-zoom", String(boardZoom));
  }, [boardZoom]);

  useLayoutEffect(() => {
    const stage = boardStageRef.current;
    const canvas = boardCanvasRef.current;
    if (!stage || !canvas) return;

    const updateCanvasSize = () => {
      const stageStyle = window.getComputedStyle(stage);
      const width = Math.max(0, Math.round(stage.clientWidth - Number.parseFloat(stageStyle.paddingLeft) - Number.parseFloat(stageStyle.paddingRight)));
      const height = Math.round(canvas.offsetHeight);
      setBoardCanvasSize((current) => current.width === width && current.height === height ? current : { width, height });
    };

    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(stage);
    observer.observe(canvas);
    updateCanvasSize();
    return () => observer.disconnect();
  }, [board.players, loaded]);

  const updateBoard = useCallback((recipe: (draft: BoardState) => void) => {
    setBoard((current) => {
      const next = structuredClone(current);
      recipe(next);
      next.updatedAt = new Date().toISOString();
      setPast((items) => [...items.slice(-39), current]);
      setFuture([]);
      return next;
    });
  }, []);

  const undo = () => setPast((items) => {
    const previous = items.at(-1);
    if (!previous) return items;
    setFuture((next) => [board, ...next].slice(0, 40));
    setBoard(previous);
    return items.slice(0, -1);
  });
  const redo = () => setFuture((items) => {
    const next = items[0];
    if (!next) return items;
    setPast((previous) => [...previous.slice(-39), board]);
    setBoard(next);
    return items.slice(1);
  });

  const filteredGuardians = useMemo(() => BOARD_GUARDIANS.filter((guardian) => {
    const matchesFilter = rarity === "all" ||
      (rarity === "basic" && ["common", "rare", "epic", "legendary"].includes(guardian.rarity)) ||
      guardian.rarity === rarity;
    return matchesFilter && guardian.name.toLowerCase().includes(query.toLowerCase());
  }), [query, rarity]);
  const activeMap = getBoardMap(board.map);
  const boardScale = boardZoom / 100;
  const boardViewportStyle: CSSProperties | undefined = boardCanvasSize.width && boardCanvasSize.height
    ? { width: `${Math.round(boardCanvasSize.width * boardScale)}px`, height: `${Math.round(boardCanvasSize.height * boardScale)}px` }
    : undefined;
  const boardCanvasStyle: CSSProperties = {
    backgroundImage: `linear-gradient(rgba(53,43,34,.28), rgba(53,43,34,.46)), url(${activeMap.image})`,
    width: boardCanvasSize.width ? `${boardCanvasSize.width}px` : undefined,
    transform: `scale(${boardScale})`,
  };

  const placeGuardian = (player: number, slot: number, guardianId = selectedGuardian) => {
    updateBoard((draft) => { draft.slots[player][slot] = guardianId; });
  };

  const moveGuardian = (source: BoardSlot, target: BoardSlot) => {
    if (source.player === target.player && source.slot === target.slot) return;
    updateBoard((draft) => {
      const sourceGuardian = draft.slots[source.player][source.slot];
      const targetGuardian = draft.slots[target.player][target.slot];
      draft.slots[target.player][target.slot] = sourceGuardian;
      draft.slots[source.player][source.slot] = targetGuardian;
    });
  };

  const readDraggedSlot = (event: DragEvent) => {
    try {
      const payload = event.dataTransfer.getData("application/x-ld-board-slot") || event.dataTransfer.getData("text/plain");
      const value = JSON.parse(payload.replace("ld-board-slot:", "")) as BoardSlot;
      if (Number.isInteger(value.player) && Number.isInteger(value.slot) && value.player >= 0 && value.player < 2 && value.slot >= 0 && value.slot < 18) return value;
    } catch { /* A guardian-library drag has no board-slot payload. */ }
    return null;
  };

  const exportFile = () => {
    downloadBlob(new Blob([JSON.stringify(board, null, 2)], { type: "application/json" }), `${fileSlug(board.title)}.ldboard.json`);
    setNotice("Board file saved.");
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const migrated = migrateBoardState(parsed);
      if (!migrated) throw new Error("This is not a valid LD board file.");
      setBoard(migrated);
      setPast([]);
      setFuture([]);
      setNotice("Board file loaded.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load that board."); }
    if (fileInput.current) fileInput.current.value = "";
  };

  const saveNamed = async () => {
    await saveBoardSnapshot(board);
    await refreshSaved();
    setNotice("Saved in this browser.");
  };

  const exportPng = async () => {
    try {
      const blob = await renderBoardPng(board);
      downloadBlob(blob, `${fileSlug(board.title)}.png`);
      try { await publishBoard(board); setNotice("PNG saved and your latest board was added to Discover."); }
      catch { setNotice("PNG saved. Discover publishing is currently offline."); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not export the PNG."); }
  };

  const share = async () => {
    const url = new URL("/board-builder", window.location.origin);
    url.hash = new URLSearchParams({ board: encodeSharedBoard(board) }).toString();
    await navigator.clipboard.writeText(url.toString());
    setNotice("Private board link copied.");
  };

  if (!loaded) return <div className="board-loading">Loading your board</div>;

  return (
    <main className="board-builder-page">
      <section className="board-toolbar">
        <input className="board-title-input" value={board.title} maxLength={80} aria-label="Board title" onChange={(event) => updateBoard((draft) => { draft.title = event.target.value; })} />
        <label className="select-control"><span>Map</span><select value={board.map} onChange={(event) => updateBoard((draft) => { draft.map = event.target.value as BoardState["map"]; })}>{BOARD_MAPS.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
        <div className="segmented-control" aria-label="Number of players"><button className={board.players === 1 ? "active" : ""} onClick={() => updateBoard((draft) => { draft.players = 1; })}>1 player</button><button className={board.players === 2 ? "active" : ""} onClick={() => updateBoard((draft) => { draft.players = 2; })}><Users />2 players</button></div>
        <label className="board-zoom-control" title="Board zoom"><ZoomOut /><input type="range" min={MIN_BOARD_ZOOM} max={MAX_BOARD_ZOOM} step="5" value={boardZoom} onChange={(event) => setBoardZoom(Number(event.target.value))} aria-label="Board zoom" /><span>{boardZoom}%</span></label>
        <div className="board-toolbar-actions">
          <button className="icon-button" onClick={undo} disabled={past.length === 0} title="Undo" aria-label="Undo"><Undo2 /></button>
          <button className="icon-button" onClick={redo} disabled={future.length === 0} title="Redo" aria-label="Redo"><Redo2 /></button>
          <button className="text-button framed" onClick={() => { const next = createBoardState(); setBoard(next); setPast([]); setFuture([]); }} title="New board" aria-label="New board"><Plus /><span>New</span></button>
          <button className="text-button framed" onClick={() => { void saveNamed(); }} title="Save board in this browser" aria-label="Save board"><Save /><span>Save</span></button>
          <button className="text-button framed" onClick={exportFile} title="Save board file" aria-label="Save board file"><FileDown /><span>Save file</span></button>
          <button className="text-button framed" onClick={() => fileInput.current?.click()} title="Load board file" aria-label="Load board file"><FileUp /><span>Load file</span></button>
          <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { void loadFile(event.target.files?.[0]); }} />
          <button className="text-button framed" onClick={() => { void share(); }} title="Copy private board link" aria-label="Share board"><Share2 /><span>Share</span></button>
          <button className="primary-button compact-action" onClick={() => { void exportPng(); }} title="Export board as PNG" aria-label="Export PNG"><ImageDown /><span>PNG</span></button>
        </div>
      </section>

      {notice && <div className="board-notice" role="status"><Check />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">x</button></div>}

      <div className="board-workspace">
        <section className="guardian-library">
          <header><div><h2>Guardians</h2><span>{filteredGuardians.length} available</span></div><button className={`icon-button quiet ${selectedGuardian === null ? "selected" : ""}`} onClick={() => setSelectedGuardian(null)} title="Erase a slot" aria-label="Erase a slot"><Eraser /></button></header>
          <label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guardians" /></label>
          <div className="rarity-tabs">{rarities.map((item) => <button key={item.id} className={rarity === item.id ? "active" : ""} onClick={() => setRarity(item.id)}>{item.label}</button>)}</div>
          <div className="guardian-grid">{filteredGuardians.map((guardian) => <button key={`${guardian.rarity}-${guardian.id}`} draggable className={`${selectedGuardian === guardian.id ? "selected" : ""} rarity-${guardian.rarity}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/guardian-id", guardian.id); }} onClick={() => setSelectedGuardian(guardian.id)} title={guardian.name}><img src={guardian.image} alt="" loading="lazy" /><span>{guardian.name}</span></button>)}</div>
        </section>

        <section className="board-stage" aria-label="Board canvas" ref={boardStageRef}>
          <div className="selection-status">{selectedGuardian ? <>Selected: <strong>{BOARD_GUARDIANS.find((guardian) => guardian.id === selectedGuardian)?.name}</strong></> : <><Eraser /> Erase mode</>}</div>
          <div className="board-zoom-viewport" style={boardViewportStyle}>
            <div className={`interactive-boards players-${board.players}`} ref={boardCanvasRef} style={boardCanvasStyle}>
              {board.slots.slice(0, board.players).map((slots, player) => (
                <div className="interactive-board" key={player}>
                  <span className="interactive-player-label">Player {player + 1}</span>
                  <div className="interactive-grid">{slots.map((guardianId, slot) => {
                    const guardian = guardianId ? BOARD_GUARDIANS.find((item) => item.id === guardianId) : undefined;
                    const isDragSource = draggedSlot?.player === player && draggedSlot.slot === slot;
                    const isDropTarget = dropTarget?.player === player && dropTarget.slot === slot;
                    return <button
                      key={slot}
                      draggable={Boolean(guardian)}
                      className={`${guardian ? `filled rarity-${guardian.rarity}` : ""} ${isDragSource ? "drag-source" : ""} ${isDropTarget ? "drop-target" : ""}`}
                      onClick={() => placeGuardian(player, slot)}
                      onDragStart={(event) => {
                        if (!guardian) return;
                        const source = { player, slot };
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-ld-board-slot", JSON.stringify(source));
                        event.dataTransfer.setData("text/plain", `ld-board-slot:${JSON.stringify(source)}`);
                        setDraggedSlot(source);
                      }}
                      onDragEnd={() => { setDraggedSlot(null); setDropTarget(null); }}
                      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = draggedSlot ? "move" : "copy"; setDropTarget({ player, slot }); }}
                      onDragLeave={() => setDropTarget((current) => current?.player === player && current.slot === slot ? null : current)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const source = readDraggedSlot(event);
                        if (source) moveGuardian(source, { player, slot });
                        else {
                          const guardianId = event.dataTransfer.getData("text/guardian-id");
                          if (guardianId && BOARD_GUARDIANS.some((item) => item.id === guardianId)) placeGuardian(player, slot, guardianId);
                        }
                        setDraggedSlot(null);
                        setDropTarget(null);
                      }}
                      title={guardian ? `${guardian.name}. Drag to move, or click to replace or erase.` : `Empty slot ${slot + 1}`}>
                      <span>{slot + 1}</span>{guardian && <img src={guardian.image} alt={guardian.name} />}
                    </button>;
                  })}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="saved-boards-panel">
          <header><div><h2>Saved boards</h2><span>Stored in this browser</span></div></header>
          {savedBoards.length === 0 ? <div className="saved-empty">Your named saves will appear here.</div> : <div className="saved-board-list">{savedBoards.map((saved) => <article key={saved.id}><button className="saved-board-load" onClick={() => { const migrated = migrateBoardState(saved); if (migrated) { setBoard(migrated); setPast([]); setFuture([]); } }}><strong>{saved.title}</strong><span>{getBoardMap(saved.map).name} - {saved.players}P</span></button><button className="icon-button quiet" onClick={() => { void deleteBoardSnapshot(saved.id).then(refreshSaved); }} title="Delete saved board" aria-label={`Delete ${saved.title}`}><Trash2 /></button></article>)}</div>}
          <div className="saved-panel-tip"><Copy /> Shared links contain the board layout. No account is needed.</div>
        </aside>
      </div>
    </main>
  );
}

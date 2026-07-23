import { BOARD_GUARDIAN_BY_ID, getBoardMap, type PublishedBoard } from "../board/model";

interface BoardPreviewProps {
  board: PublishedBoard;
  compact?: boolean;
}

export function BoardPreview({ board, compact = false }: BoardPreviewProps) {
  const map = getBoardMap(board.map);
  return (
    <div className={`board-preview ${compact ? "compact" : ""}`} style={{ backgroundImage: `linear-gradient(rgba(53,43,34,.22), rgba(53,43,34,.42)), url(${map.image})` }}>
      {board.slots.slice(0, board.players).map((slots, player) => (
        <div className="preview-player" key={player}>
          <span className="player-label">P{player + 1}</span>
          <div className="preview-grid">
            {slots.map((guardianId, index) => {
              const guardian = guardianId ? BOARD_GUARDIAN_BY_ID.get(guardianId) : undefined;
              return <div className="preview-slot" key={index}>{guardian && <img src={guardian.image} alt={guardian.name} loading="lazy" />}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

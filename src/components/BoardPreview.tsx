import { type CSSProperties } from "react";
import { BOARD_GUARDIAN_BY_ID, getBoardMap, type PublishedBoard } from "../board/model";

interface BoardPreviewProps {
  board: PublishedBoard;
  compact?: boolean;
}

export function BoardPreview({ board, compact = false }: BoardPreviewProps) {
  const map = getBoardMap(board.map);
  const previewStyle = {
    "--preview-aspect": String(map.aspectRatio),
    "--preview-grid-columns": String(map.columns),
    "--preview-grid-rows": String(map.rows),
    "--preview-grid-top": `${map.gridInset.top}%`,
    "--preview-grid-right": `${map.gridInset.right}%`,
    "--preview-grid-bottom": `${map.gridInset.bottom}%`,
    "--preview-grid-left": `${map.gridInset.left}%`,
  } as CSSProperties;

  return (
    <div className={`board-preview ${compact ? "compact" : ""} players-${board.players}`}>
      {board.slots.slice(0, board.players).map((slots, player) => (
        <div className="preview-player" style={previewStyle} key={player}>
          <img className="preview-map" src={map.image} alt="" aria-hidden="true" />
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

import { RotateCcw } from "lucide-react";
import type { HistoryEntry } from "../lib/db";
import { Modal } from "./Modal";

interface HistoryDialogProps {
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onClose: () => void;
}

export function HistoryDialog({ entries, onRestore, onClose }: HistoryDialogProps) {
  return (
    <Modal title="Version history" onClose={onClose}>
      <div className="history-list">
        {entries.length === 0 && <p className="muted-copy">No saved versions yet.</p>}
        {entries.map((entry) => (
          <div className="history-row" key={entry.id}>
            <div><strong>{new Date(entry.createdAt).toLocaleString()}</strong><span>{entry.ownedCount} runes · {entry.state.selectedImmortalIds.length} Immortals · {entry.state.mode.toUpperCase()}</span></div>
            <button className="icon-button" onClick={() => { onRestore(entry); onClose(); }} title="Restore version" aria-label="Restore version"><RotateCcw /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

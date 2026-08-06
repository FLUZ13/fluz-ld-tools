ALTER TABLE community_boards ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_board_reports (
  board_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'broken')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (board_id, reporter_hash),
  FOREIGN KEY (board_id) REFERENCES community_boards(board_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS community_board_reports_created_idx
  ON community_board_reports(created_at);

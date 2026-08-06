-- A Discover share is a distinct public post. Keep the anonymous owner hash for
-- rate limiting and self-report prevention, but do not use it as a unique key.
PRAGMA foreign_keys = OFF;

CREATE TABLE community_board_reports_backup AS
SELECT board_id, reporter_hash, reason, created_at FROM community_board_reports;

DROP TABLE community_board_reports;

CREATE TABLE community_boards_next (
  board_id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  map TEXT NOT NULL,
  players INTEGER NOT NULL CHECK (players IN (1, 2)),
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  report_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO community_boards_next (board_id, owner_hash, title, map, players, state_json, created_at, updated_at, report_count)
SELECT board_id, owner_hash, title, map, players, state_json, created_at, updated_at, report_count
FROM community_boards;

DROP TABLE community_boards;
ALTER TABLE community_boards_next RENAME TO community_boards;

CREATE INDEX community_boards_updated_idx ON community_boards(updated_at DESC);
CREATE INDEX community_boards_owner_hash_idx ON community_boards(owner_hash);

CREATE TABLE community_board_reports (
  board_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'broken')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (board_id, reporter_hash),
  FOREIGN KEY (board_id) REFERENCES community_boards(board_id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO community_board_reports (board_id, reporter_hash, reason, created_at)
SELECT board_id, reporter_hash, reason, created_at FROM community_board_reports_backup;

DROP TABLE community_board_reports_backup;
CREATE INDEX community_board_reports_created_idx ON community_board_reports(created_at);

PRAGMA foreign_keys = ON;

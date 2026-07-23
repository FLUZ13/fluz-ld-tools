CREATE TABLE IF NOT EXISTS community_boards (
  board_id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  map TEXT NOT NULL,
  players INTEGER NOT NULL CHECK (players IN (1, 2)),
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS community_boards_updated_idx
  ON community_boards(updated_at DESC);

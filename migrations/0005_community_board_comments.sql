CREATE TABLE IF NOT EXISTS community_board_comments (
  comment_id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  commenter_hash TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL,
  FOREIGN KEY (board_id) REFERENCES community_boards(board_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS community_board_comments_board_created_idx
  ON community_board_comments(board_id, created_at);

CREATE INDEX IF NOT EXISTS community_board_comments_commenter_created_idx
  ON community_board_comments(commenter_hash, created_at);

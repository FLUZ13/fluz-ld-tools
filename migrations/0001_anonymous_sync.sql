PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS anonymous_workspaces (
  workspace_id TEXT PRIMARY KEY,
  auth_verifier TEXT NOT NULL,
  encrypted_state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_history (
  workspace_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  encrypted_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, revision),
  FOREIGN KEY (workspace_id) REFERENCES anonymous_workspaces(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_history_recent
  ON workspace_history(workspace_id, revision DESC);

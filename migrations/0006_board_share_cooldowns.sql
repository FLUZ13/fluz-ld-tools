CREATE TABLE IF NOT EXISTS board_share_cooldowns (
  owner_hash TEXT PRIMARY KEY,
  cooldown_until INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS board_share_cooldowns_expires_idx
  ON board_share_cooldowns(cooldown_until);

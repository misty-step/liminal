-- Liminal durable store (D1 `liminal-judgments`). Applied with:
--   wrangler d1 migrations apply liminal-judgments --remote

-- Versioned judgment retention: the first stored state for a judgment key
-- wins; later or concurrent judges receive the retained winner.
CREATE TABLE IF NOT EXISTS judgments (
  key TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Player answer reports (append-only).
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  puzzle_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
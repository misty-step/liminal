-- Published puzzle schedule: one puzzle per UTC date, written by the daily
-- generator (or a manual promote) and read by the app at runtime, so new
-- puzzles publish without a deploy. Insert-only: a date, a number, and a
-- puzzle id can each be published exactly once. Existing tables are untouched.

CREATE TABLE IF NOT EXISTS schedule (
  date TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  number INTEGER NOT NULL UNIQUE CHECK (number >= 1),
  puzzle_id TEXT NOT NULL UNIQUE CHECK (length(puzzle_id) BETWEEN 1 AND 64),
  puzzle_json TEXT NOT NULL CHECK (json_valid(puzzle_json)),
  source TEXT NOT NULL CHECK (source IN ('generator', 'manual')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS schedule_no_update
BEFORE UPDATE ON schedule
BEGIN
  SELECT RAISE(ABORT, 'published schedule entries are immutable');
END;

-- A date that has begun is already being played from the deck fallback;
-- scheduling it now would swap the puzzle mid-day. Only future UTC dates.
CREATE TRIGGER IF NOT EXISTS schedule_future_only
BEFORE INSERT ON schedule
WHEN NEW.date <= date('now')
BEGIN
  SELECT RAISE(ABORT, 'only future dates can be scheduled');
END;

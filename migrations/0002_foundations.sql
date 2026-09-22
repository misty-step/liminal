-- Additive production-foundation migration. Existing judgments and reports remain intact.

CREATE TRIGGER IF NOT EXISTS judgments_state_insert_guard
BEFORE INSERT ON judgments
WHEN NEW.state NOT IN ('inside', 'close', 'outside')
BEGIN
  SELECT RAISE(ABORT, 'invalid judgment state');
END;

CREATE TRIGGER IF NOT EXISTS judgments_state_update_guard
BEFORE UPDATE OF state ON judgments
WHEN NEW.state NOT IN ('inside', 'close', 'outside')
BEGIN
  SELECT RAISE(ABORT, 'invalid judgment state');
END;

CREATE TABLE IF NOT EXISTS product_events (
  event_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'session_start',
    'puzzle_open',
    'guess_judged',
    'guess_refused',
    'puzzle_complete',
    'report_submitted'
  )),
  game TEXT NOT NULL CHECK (game = 'liminal'),
  environment TEXT NOT NULL CHECK (environment IN ('production', 'staging', 'test')),
  occurred_at TEXT NOT NULL,
  session_id TEXT NOT NULL CHECK (length(session_id) BETWEEN 16 AND 80),
  actor_id TEXT,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  props_json TEXT NOT NULL CHECK (json_valid(props_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS product_events_funnel
  ON product_events (environment, event_name, occurred_at);
CREATE INDEX IF NOT EXISTS product_events_session
  ON product_events (environment, session_id, occurred_at);

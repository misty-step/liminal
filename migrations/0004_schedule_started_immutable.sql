-- A date that has begun is being played; deleting its row would swap the
-- puzzle back to the deck fallback mid-day. Only future dates may be pulled
-- (for example, a bad puzzle caught before it airs).

CREATE TRIGGER IF NOT EXISTS schedule_no_started_delete
BEFORE DELETE ON schedule
WHEN OLD.date <= date('now')
BEGIN
  SELECT RAISE(ABORT, 'a date that has begun cannot be unpublished');
END;

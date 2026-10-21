# Archive and the daily schedule

Everyone gets the same numbered puzzle for a UTC day; #1 is 2026-09-23. After
finishing today's puzzle, a player can play the day before, then keep walking
back. "Back to today" returns. Future numbers are never served.

## Sub-features

- `daily-number`: `/api/today` serves today's UTC date and number, and `/api/puzzle/<today>` serves the same puzzle.
- `future-refused`: `/api/puzzle/<today+1>` answers 404, and `/api/puzzle/0` is not a puzzle.
- `play-previous`: after finishing, `Play #N-1` opens yesterday's different puzzle.
- `back-to-today`: `Back to today` restores today's board.

## How to get to it (user POV)

- Finish today's board, then choose `Play #<N-1>`.
- On an earlier puzzle, choose `Back to today`.

## Driving it with verify-liminal

Preconditions:

- The doctor passes. Today's board is complete in the context (the journey's first scenario).

- **Schedule identity.** `verify-liminal doctor <target>` prints `ok /api/today 200 date=<UTC today> number=<N>` and `ok /api/puzzle/<N+1> (tomorrow) answers 404`.
- **Previous day.** Choose `Play #<N-1>`. A `Back to today` button appears, and the circle labels differ from today's. Evidence: `07-archive.png`.
- **Return.** Choose `Back to today`. The button detaches and the labels equal today's again.

## Gotchas

- On puzzle #1 there is no previous day; the journey records that as a skip.
- Around 00:00 UTC, "today" changes between the doctor and the journey. Rerun both after midnight rather than comparing across it.
- Production serves today from the D1 `schedule` table. A local instance has an empty schedule and serves the bundled deck's fallback for the date, so local and production circles differ.
- The archive board starts empty in a fresh context. Archive progress is saved per puzzle, separately from today's.

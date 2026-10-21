# Play today's puzzle

A player opens Liminal and sees today's three labeled circles. They name things
until the center and all three pair regions are filled. Refused input costs
nothing. The board ends with the guess count and the thinking time, and it
survives a reload.

## Sub-features

- `first-visit`: the how-to opens once for a new player; Play dismisses it.
- `board`: three circle labels match `/api/today`, and the counter starts at `0 guesses`.
- `refuse-label`: entering a circle label is refused with "That repeats a circle", spending no guess.
- `refuse-repeat`: a word already on the board, in any case, is refused with "is already on the board".
- `fill`: an authored answer lands cleanly and fills its region.
- `complete`: four fills end the board with "Filled in 4 guesses" and "m:ss on the clock".
- `persist`: a reload restores the guesses, the end panel, and the clock.
- `word-detail`: tapping a placed word shows one verdict per circle and "Disagree?".
- `no-limit`: misses never end the board; it ends only on four fills.

## How to get to it (user POV)

- Open `https://liminal.mistystep.io/` (or a local instance's URL).
- Type in "Name a thing" (`#guess`) and choose Place, or press Enter.
- Tap any word on the board to open its detail.

## Driving it with verify-liminal

Preconditions:

- The doctor passes for the target.
- The browser context is fresh. The journey creates its own.

- **First visit.** Load `/`. `dialog.howto` becomes visible. Choose its submit button (Play). The board shows `.label-c1/.label-c2/.label-c3 .label-main` equal to `/api/today` `puzzle.conditions[].text`. Evidence: `01-first-visit-howto.png`, `02-board-empty.png`.
- **Refuse a label.** Place the first circle label. `p.status` contains "repeats a circle", `.meter-count` reads 0, and no `.word` exists. Evidence: `03-refused-circle-label.png`.
- **Fill and refuse a repeat.** Place `pairs.c3.answers[0]`, then the same word uppercased. The status says "is already on the board" and the count stays 1.
- **Complete.** Place `pairs.c2`, `pairs.c1`, and `center` answers. `.target.filled` count is 4. `h2.end-title` reads "Filled in 4 guesses" and `p.end-sub` matches `^\d+:\d{2} on the clock$`. Evidence: `04-board-complete.png`, `04-board-complete.aria.txt`.
- **Persist.** Reload. There are four `.word` elements and the same end title.
- **Word detail.** Click the first `.word`. `.detail .verdicts li` count is 3, and a `Disagree?` button exists. Escape closes it. Evidence: `06-word-detail.png`.
- **No limit (local).** `verify-liminal qa` places 11 pair answers without the center. The input stays enabled and no `section.end` exists.
- Run all of it with `verify-liminal journey prod` (read-only) or `verify-liminal journey offline`.

## Gotchas

- Authored answers are judged in the browser, so a full board on production makes no server write. Novel words call `/api/judge`, which writes a D1 judgment and spends credit. See [live-judge](./live-judge.md).
- The how-to opens after hydration, not at `domcontentloaded`. Wait for `dialog.howto[open]` instead of checking visibility once.
- A placed word briefly renders as `.word.word-awaiting` while the judge works. Count `.word:not(.word-awaiting)` and wait for `main#game[aria-busy="false"]`.
- The local deck fallback and the production schedule show different puzzles for the same number. Compare against the target's own `/api/today`.
- A board finished on production stays finished only in that browser context's localStorage. Players are unaffected; nothing is stored server-side.

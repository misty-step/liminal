# AGENTS.md — Liminal

Solo daily puzzle app. Standard Misty Step conventions: Next.js (App Router),
TypeScript strict, bun, vitest, Cloudflare Workers deploy.

## Layout

- `src/lib/liminal/` — pure game engine (deck, evaluator, regions, placement,
  daily rotation, storage, judgment mapping, TypeSafe/OpenRouter client). No
  React imports.
- `src/app/` — UI (`page.tsx`, `Board.tsx`) and API routes (`/api/judge`,
  `/api/report`).
- `src/lib/liminal/__tests__/` — the executable rule tests. Deck edits must
  keep `deck.test.ts` green: every region of every puzzle needs verified
  answers that land there and a held-out answer.
- `design/reimagine/` — design exploration and rationale behind the current
  game (read before changing the mechanic).

## Rules of the game (product contract)

- Solo only. No rooms, no partners, no multiplayer infrastructure.
- Three circles per puzzle; four regions to fill: the center and three pair
  regions (inside two circles, outside the third). Several legitimate answers
  per region; never a single canonical solution.
- No guess limit: a board ends only when all four regions are filled. Score
  is guesses used plus clock time. The clock counts thinking time only: it
  pauses while the judge considers a word, while the how-to is open, and
  while the tab is hidden. Persistent per-puzzle history and time.
- One numbered puzzle per UTC day (#1 is 2026-09-23), the same for everyone,
  served from the D1 schedule with the bundled deck as fallback. Only a
  successful schedule lookup may choose the deck; an unreadable schedule is an
  outage (503 and a retry, never a client-chosen puzzle). The archive walks
  back one day at a time; future numbers are never served.
- Sharing never spoils: the share text is squares, guess count, time, and a
  link, with no words or circle labels. The player's words live only in the
  link code and stay hidden on `/s/<code>` until tapped.
- Outside / on the line (close) / inside per condition, shown as position on
  the board; never decimal dashboards. A word whose position cannot show its
  verdict carries explicit marks.
- Literal-object and wordplay puzzles are judged by their own rubrics; the
  board does not label them.
- Reject invented objects, clue repetition, and instruction-like input.
  Circle labels and repeats are refused deterministically before judging
  (free). Invented and instruction-like input has no deterministic detector —
  any lexical rule would falsely refuse real answers — so the live judge
  rejects it semantically: it never lands in a region, never executes.
- Guess budget: a guess is spent exactly when it receives a judgment (authored
  or live). The judge bands Choice probabilities (`yes + partly / 2`), so a
  torn condition lands on a line and is spent; there is no uncertainty
  refusal. Echo/repeat/empty/too-long, outage, rate limit, and the
  calibration gate spend nothing.
- Outages are honest: no fabricated verdicts, no unfairly spent guesses.

## Puzzles: generate, critique, promote

The append-only bundled deck is in `src/lib/liminal/puzzles/`; never hand-author
a puzzle straight into it. The nightly schedule lives in D1 without a deploy,
with the deck as the fallback when a date is not scheduled.

`bun run puzzles:daily -- --store d1 --buffer 7 --budget 2` fills missing UTC
dates from tomorrow onward, earliest first. It proposes batches of cheap concepts, gauges existence
with Jev, places eight ordinary player-model guesses per region, repairs
findability-only near misses in batches, re-screens, expands survivors, critiques
and revises drafts, then live-calibrates each puzzle's authored and held-out
answers and hostile inputs. Only a fully passing candidate is inserted.
Reruns never overwrite an existing date, number, or puzzle ID. A date that has
begun is never scheduled: it is already being played from the deck fallback, and
scheduling it would swap puzzle #N mid-day. The window starts at tomorrow, both
stores refuse such dates, and the D1 trigger `schedule_future_only` refuses them
for any writer. If tomorrow cannot be filled, the command exits nonzero; later
gaps are retried the next night. Reports go to gitignored `content/daily/`.

The publish bar (`scripts/generator/publish.ts`): all critic gates pass, each
region's natural-guess hit rate is at least 4/8, editor taste is at least 0.7,
each has at least three confirmed authored answers and a held-out answer,
hostile input never lands, labels fit the board, no slug repeats, at most one
normalized label overlaps any published or bundled puzzle, and the candidate's
own live matrix has zero misses. `judgeStatus` becomes `calibrated` only then.

`FileScheduleStore` writes one ScheduleEntry per date to gitignored
`content/schedule/YYYY-MM-DD.json` for local runs. `D1HttpScheduleStore` writes
plain INSERTs via Cloudflare's D1 HTTP API to the `schedule` table. For the
nightly GitHub workflow, configure repository secrets `LIMINAL_JUDGE_API_KEY`,
`LIMINAL_GENERATOR_API_KEY` (different keys), and `CLOUDFLARE_API_TOKEN`
(D1 edit permission), plus repository variable `CLOUDFLARE_ACCOUNT_ID`.
The database ID is in the workflow. The generator key pays for proposal and
player calls; the judge key pays for Jev. The nightly run caps generator spend
at $2 (provider-reported spend, checked before calls; a final call can exceed
the cap). Measured yield on 2026-09-23 was one published puzzle per about
$1.35, so $1 a night drains the week buffer while $2 refills it; once the
buffer is full a night spends only what one new date costs.
Disable `.github/workflows/daily-puzzles.yml` to stop automatic publication
immediately.

For manual authoring, `bun run puzzles:generate -- --budget 2` writes
gitignored candidates; `bun run puzzles:promote content/candidates/<id>.json`
appends one to the deck as uncalibrated. `bun run validate:live -- --only <id> --mark-calibrated`
is its release gate. `bun run puzzles:audit` re-critiques
published puzzles. Bump `judgments.version` for any answer/condition change:
runtime caches key on that version.

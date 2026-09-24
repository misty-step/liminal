# Stories

<!-- Root artifact: what users must be able to do. One file, ids never
reused, criteria a check can fail on. skill://user-stories guides edits.
Drafted 2026-09-24 from shipped behavior (PRs #6 to #8) and the operator's
stated requests; the operator owns intent and merges changes. -->

## Capability: Play today's puzzle

## US-001 Fill the in-between

Statement: When I open today's puzzle, I want to name real things that belong
where the circles overlap, so I can fill all four in-between places.

Criteria:
1. THE SYSTEM SHALL show three labeled circles and four places to fill: the
   center (inside all three) and three gaps (inside two, outside the third).
2. WHEN a guess is judged, THE SYSTEM SHALL place it on the board by its
   verdict for each circle: inside, on the line, or outside.
3. WHEN a guess lands cleanly (no circle on the line) in an empty place, THE
   SYSTEM SHALL fill that place; a guess on a line, in one circle, or outside
   every circle SHALL fill nothing.
4. WHEN all four places are filled, THE SYSTEM SHALL end the board, and SHALL
   NOT end it on guess count, however many guesses it takes.

No-gos: no guess limit; no give-up or show-answers path (operator decision,
2026-09-24); no single canonical answer per place; no rooms, partners, or
multiplayer.

Evidence: `src/lib/liminal/__tests__/regions.test.ts`,
`src/lib/liminal/__tests__/placement.test.ts`,
`src/lib/liminal/__tests__/storage.test.ts`,
`src/lib/liminal/__tests__/deck.test.ts`, `e2e/qa-journeys.ts`

## US-002 Only a real judgment costs a guess

Statement: When I type something the game cannot judge fairly, I want it
refused without cost, so I can trust my guess count.

Criteria:
1. IF a guess repeats a circle label, repeats a word already on the board
   after normalization, or is empty or over-long, THEN THE SYSTEM SHALL refuse
   it before judging and spend no guess.
2. IF the judge is unreachable, rate-limited, or the puzzle's schedule cannot
   be read, THEN THE SYSTEM SHALL say so and spend no guess.
3. WHEN the judge returns a verdict, THE SYSTEM SHALL spend exactly one guess,
   including for a confident miss.
4. IF a guess is invented or instruction-like, THEN THE SYSTEM SHALL NOT let
   it fill a place.

Evidence: `src/lib/liminal/__tests__/evaluator.test.ts`,
`src/lib/liminal/__tests__/storage.test.ts`,
`src/lib/liminal/__tests__/typeSafe.test.ts`,
`src/lib/liminal/__tests__/routes.test.ts`,
`src/lib/liminal/__tests__/generator-publish.test.ts` (hostile input never
lands), `bun run validate:live` (hostile rows), `e2e/qa-journeys.ts`

## US-003 My score is guesses and thinking time

Statement: When I finish a board, I want my score to be my guess count and the
time I spent thinking, so I can compare fairly with friends.

Criteria:
1. WHEN the board is complete, THE SYSTEM SHALL show the guess count and the
   clock time.
2. WHILE the judge considers a word, the how-to is open, or the tab is hidden,
   THE SYSTEM SHALL hold the clock.
3. WHEN I reload the page, THE SYSTEM SHALL restore my guesses and clock time
   for that puzzle.

Evidence: `e2e/qa-journeys.ts` (thinking-time clock, four fills survive
refresh), `src/lib/liminal/__tests__/storage.test.ts`,
`src/lib/liminal/__tests__/regions.test.ts`

## US-004 Dispute a verdict

Statement: When I think the judge placed a word wrongly, I want to see its
verdicts and say so, so I can flag unfair judgments.

Criteria:
1. WHEN I open a word on the board, THE SYSTEM SHALL show its verdict for each
   circle.
2. WHEN I send a disagreement, THE SYSTEM SHALL store it durably and confirm.
3. IF the report cannot be stored, THEN THE SYSTEM SHALL say it was not sent
   and SHALL NOT fall back to local storage in production.

Evidence: `src/lib/liminal/__tests__/report-durability.test.ts` (production
route against a migrated SQLite stand-in for D1: stored, read back, and an
honest failure), `src/lib/liminal/__tests__/routes.test.ts` (no local
fallback in production), `e2e/qa-journeys.ts` (word detail, report filed)

## Capability: One shared puzzle a day

## US-005 Everyone plays the same numbered puzzle each day

Statement: When I play on a given UTC day, I want the same numbered puzzle as
everyone else, so I can compare results.

Criteria:
1. THE SYSTEM SHALL number puzzles by UTC day from #1 on 2026-09-23 and serve
   every player the same puzzle for a date.
2. THE SYSTEM SHALL NOT change a date's puzzle once that UTC day has begun: a
   begun date can be neither scheduled nor unscheduled, and the fallback for
   an unscheduled date SHALL NOT change when the bundled deck grows.
3. IF the schedule cannot be read, THEN THE SYSTEM SHALL answer unavailable
   and offer a retry, never a puzzle chosen without it.
4. THE SYSTEM SHALL refuse to serve a future puzzle number.

Evidence: `src/lib/liminal/__tests__/daily.test.ts`,
`src/lib/liminal/__tests__/generator-schedule-store.test.ts`,
`src/lib/liminal/__tests__/routes.test.ts`

## US-006 Play earlier days

Statement: When I finish today's puzzle, I want to play earlier days, so I can
keep playing.

Criteria:
1. WHEN I finish a puzzle after #1, THE SYSTEM SHALL offer the previous day's
   puzzle by number.
2. WHILE I am on an earlier puzzle, THE SYSTEM SHALL offer a way back to
   today's.

Evidence: `e2e/qa-journeys.ts` (archive opens an earlier puzzle, back to
today), `src/lib/liminal/__tests__/routes.test.ts`

## Capability: Share a result

## US-007 Share my result without spoiling it

Statement: When I finish, I want to share a short result with friends, so I
can compete without giving away the answers.

Criteria:
1. WHEN I share a finished board, THE SYSTEM SHALL produce four lines:
   "Liminal #N", one square per guess by the place it filled, "N guesses,
   m:ss", and a link.
2. THE SYSTEM SHALL NOT put my words or circle labels in the share text.
3. WHEN someone opens the link, THE SYSTEM SHALL show the result with each of
   my words hidden until tapped.
4. IF the link is malformed, THEN THE SYSTEM SHALL show it as broken.

Evidence: `src/lib/liminal/__tests__/share.test.ts`

## Capability: Fresh puzzles every day

## US-008 New puzzles publish themselves

Statement: When a new day approaches, I (the operator) want a fresh, fair
puzzle published without a deploy, so I can keep the game going without
authoring by hand.

Criteria:
1. WHEN the nightly run finds an empty date from tomorrow through seven days
   ahead, THE SYSTEM SHALL publish a puzzle there only if it clears the
   publish bar and has zero misses in its live calibration.
2. THE SYSTEM SHALL NOT publish into a date that has already begun.
3. WHEN a run's provider-reported spend reaches its cap, THE SYSTEM SHALL make
   no further generator calls.

No-gos: no approval queue; no frontier thinking models for generation.

Evidence: `src/lib/liminal/__tests__/generator-publish.test.ts`,
`src/lib/liminal/__tests__/generator-schedule-store.test.ts`,
`src/lib/liminal/__tests__/generator-budget.test.ts`,
`.github/workflows/daily-puzzles.yml`

## Capability: Play on a phone

## US-009 Keep the puzzle playable above the keyboard

Statement: When I name an answer on my phone, I want to see the whole puzzle
and whether my word is being placed, so I can keep reasoning without hiding
the keyboard between guesses.

Criteria:
1. WHILE the phone keyboard is open, THE SYSTEM SHALL keep the three circle
   labels, the board, the input, the Place action, and the current feedback
   visible or reachable in the visible viewport without the keyboard covering
   the input or Place action.
2. WHILE a word is being judged, THE SYSTEM SHALL show that word waiting at
   the board and keep the composer available without charging a guess early.
3. WHEN the verdict arrives, THE SYSTEM SHALL move the word to its judged
   position and distinguish a newly filled place from a miss without relying
   on motion or sound alone.

Evidence: `src/app/page.tsx`, `src/app/Board.tsx`, `src/app/globals.css`,
mobile visual-viewport and reduced-motion browser review.

## US-010 Hear optional game cues

Statement: When I play a puzzle, I want an optional sound for the result of
my action, so I can feel its outcome without requiring sound to understand it.

Criteria:
1. WHERE I enable sounds, THE SYSTEM SHALL play a cue on a placed word, a
   newly filled place, a completed board, or a refused answer.
2. WHERE I turn sounds off, THE SYSTEM SHALL play nothing and remember my
   choice across reloads.
3. THE SYSTEM SHALL show every result in text and on the board even when
   sound is off or unavailable.

Evidence: `src/lib/liminal/audio.ts`, `src/app/page.tsx`, browser sound
toggle and submission review.

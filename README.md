# Liminal

A daily solo puzzle about the in-between. Three labeled circles overlap in four
places: the center (inside all three) and three gaps (inside two circles, outside
the third). Fill all four with real things. No guess limit: your score is how
many guesses and how long it took. Every word lands where it belongs on the
board; many answers are right in every region.

Live target: `liminal.mistystep.io` (release owned by Zoe).

## Modes

- **Today**: one puzzle per UTC day, same for every player, numbered from
  #1 on 2026-09-23 (`src/lib/liminal/daily.ts`). `GET /api/today` serves the
  scheduled puzzle for today's date from the D1 `schedule` table and falls back
  to the bundled deck rotation when the schedule has no entry for the date.
  Only the server chooses that fallback, after a successful lookup: an
  unreadable schedule (or a production deployment without the D1 binding)
  answers 503, and the page shows unlabeled circles with "Try again" rather
  than a puzzle other players might not see.
- **Archive**: after finishing, "Play #N" opens the day before; "Back to today"
  returns. `GET /api/puzzle/<number>` serves any past number and 404s future
  ones, so nobody can play tomorrow early. Progress is saved per puzzle.

Literal-object and wordplay puzzles apply their own sense rules in the judge
rubrics; the board does not label them.

## Rules and feedback

Each guess is judged per circle: **inside**, **on the line** (close), or
**outside**, and placed on the board accordingly. A guess fills a region when it
lands there cleanly (no circle on the line) and the region is still empty
(`src/lib/liminal/regions.ts`). Words on a line, in one circle, or outside every
circle stay on the board as information. A word whose position cannot show its
verdict exactly carries explicit marks (`src/lib/liminal/placement.ts`).

The game ends only when all four regions are filled. The clock counts thinking
time: it pauses while the judge considers a word (network latency never reaches
the score), while the how-to is open, and while the tab is hidden. Progress and
clock time are saved per puzzle (`localStorage` schema `liminal.v2`); v1
progress is not migrated.

A guess is spent exactly when it receives a judgment (authored or live).
Refusals spend nothing: a circle label, a word already on the board, empty or
oversized input, judge outages, rate limits, and the calibration gate.

## Sharing

The share text (`src/lib/liminal/share.ts`) is a header, one colored square per
guess, the score, and a link:

```text
Liminal #1
🟪⬜🟩🟧⬛
5 guesses, 0:22
https://liminal.mistystep.io/s/<code>
```

Squares are the place each guess filled (purple, green, orange gap; black
center) or white when it filled nothing. A perfect four-guess board adds 🎯.
The text never contains words or circle labels. The link's code carries the
player's words; `/s/<code>` shows the result with each word hidden until tapped
(noindex, no server state). Touch devices use the native share sheet; desktop
copies to the clipboard.

## Judgment architecture

- **Authored deck judgments** (`src/lib/liminal/deck.ts`) are deterministic,
  offline, and always available. Every region of every puzzle ships with
  verified answers and held-out answers; `src/lib/liminal/__tests__/deck.test.ts`
  enforces that each authored answer lands in its region.
- **Semantic service (Jev)** covers answers outside the authored lists.
  One authored question per condition (a Choice over descriptive levels;
  Noul yes/no only as a legacy fallback) via the server route `/api/judge`.
  Providers: TypeSafe native (`TYPESAFE_API_KEY`) or OpenRouter Decisions
  (`OPENROUTER_API_KEY`, model `typesafe/jev-1.13`).
- Probabilities are **not** intensities. A Choice is scored `yes + partly / 2`
  and banded (`inside >= 0.65`, `close >= 0.35`, else `outside`) in
  `judgment.ts`. There is no uncertainty refusal: a torn judge lands a word on
  the line, where it fills nothing.
- Judgments are **versioned and cached** (`judgmentKey`: puzzle, condition,
  answer, model, prompt version) so duplicate submissions never reroll a
  judgment.
- A service outage is honest: the guess is **not consumed**, no score is
  fabricated, and the UI says the judge is unavailable.

## Security posture

- Credentials stay server-side (route handler only; never shipped to the client).
- Player text is untrusted data: bounded length (120 chars), rate-limited,
  time-boxed (8 s), and passed to the judge as `state` data — never as
  instructions.
- `/api/report` is size-capped and rate-limited; failures are reported honestly.

## Production foundations

- `GET /api/health` checks the deck and the D1 binding. Staging and production
  fail closed when durable storage is missing; local development reports that
  storage is intentionally not configured.
- `POST /api/events` accepts a strict, versioned first-party event taxonomy.
  Events contain an anonymous session ID and bounded enums/counts only. Player
  answers, report notes, IP addresses, and joinable actor IDs are not events.
- Sentry is disabled unless a DSN is supplied. Server, edge, and browser
  capture use explicit environment and release values, sampled traces, source
  maps for release builds, `sendDefaultPii: false`, and a scrubber that removes
  request data, headers, query strings, identity, extras, and breadcrumb text.
- `ops/production-foundations.json` registers health, events, and the `liminal`
  Sentry project for the approved production-only game-operations triage path.
- `bun run foundation:check` executes the repository-owned brand, health,
  telemetry, storage, Sentry, and CI contract.

## Development

```sh
bun install
bun run dev        # local
bun run format:check
bun run lint
bun run foundation:check
bun run test       # vitest: engine, deck, boundaries, storage, routes, privacy
bun run type-check
bun run build:cf   # reproducible OpenNext/Cloudflare deploy artifact
```

Puzzle pipeline. The judge key (`OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`)
scores words; generation and the audit's player model bill a separate
`LIMINAL_GENERATOR_API_KEY` and refuse to run on the judge key, so drafting
can never drain the key the live game judges with:

```sh
bun run puzzles:daily -- --store file --buffer 7 --budget 1   # fill upcoming dates (local files)
bun run puzzles:generate -- --concepts 60 --keep 12 --budget 2   # propose, screen, expand, critique
bun run puzzles:audit                               # critic on published puzzles
bun run puzzles:promote content/candidates/<id>.json
bun run validate:live -- --only <id> --mark-calibrated
```

Publishing is automatic. `.github/workflows/daily-puzzles.yml` runs
`puzzles:daily --store d1` nightly: it fills missing dates from tomorrow up to
a week ahead, publishing only puzzles that clear the publish bar and a
zero-miss live calibration. Scheduled rows are insert-only and only future
dates can be inserted, so the puzzle for a day never changes once that day has
begun. A date nobody filled in time stays on the deck fallback all day. See
`AGENTS.md` for the gates.

## Deploy contract (for Zoe)

- Cloudflare Worker + custom domain `liminal.mistystep.io` →
  `{ "pattern": "liminal.mistystep.io", "custom_domain": true }`.
- Worker secrets: `OPENROUTER_API_KEY` (scoped) or `TYPESAFE_API_KEY`, plus
  `SENTRY_DSN` when monitoring is activated.
- Worker vars: `LIMINAL_ENVIRONMENT`, `SENTRY_ENVIRONMENT`,
  `JEV_MODEL=typesafe/jev-1.13`, and
  `JEV_DECISIONS_URL=https://openrouter.ai/api/alpha/decisions`.
- Release build vars: `SENTRY_RELEASE` and `NEXT_PUBLIC_SENTRY_RELEASE` are the
  exact candidate SHA; client Sentry activation also needs the public DSN and
  explicit environment. Source-map upload uses scoped `SENTRY_AUTH_TOKEN`,
  `SENTRY_ORG`, and `SENTRY_PROJECT=liminal` in release CI only.
- Build: `bun run build:cf` (OpenNext, `open-next.config.ts`); deploy:
  `bun run deploy:cf` (wrangler `--env production`).
- Durable store: D1 `liminal-judgments` (binding `LIMINAL_DB`) retains
  first-writer-wins judgments keyed by the versioned judgment keys, holds
  append-only answer reports and privacy-safe product events, and the
  insert-only daily `schedule` (migration `0003_schedule.sql`, required by
  `/api/health`). Additive schema lives in `migrations/`.
- Daily generation (GitHub Actions): repository secrets
  `LIMINAL_JUDGE_API_KEY`, `LIMINAL_GENERATOR_API_KEY` (must differ), and
  `CLOUDFLARE_API_TOKEN` (D1 edit), plus variable `CLOUDFLARE_ACCOUNT_ID`.

## Known limitations (this slice)

- **Live calibration.** The gate is `scripts/live-matrix.ts`: every region
  answer, every held-out answer, and hostile input per puzzle. Deck 2026-09-23.1
  under prompt `liminal-judge-2026-09-23.1` passed 132/132 rows (84 answers, 36
  held-out, 12 hostile) in
  `evidence/live-matrix-2026-09-23T20-17-24-426Z.json`; the run before it missed
  one row ("sock" lands on the head line) and that answer was removed. History
  and the banded-rule decision: `evidence/calibration-findings.md`.
- **The deck was rebuilt for regions.** Kitchen Well, Made and Taken, and Pass
  or Fail could not fill all four regions with the live judge (at least one
  region had no clean answer) and were retired. Bath Vessel was kept.
- **A torn judge costs a guess.** Banding replaces the old uncertainty refusal,
  so a word the judge splits on lands on a line and is spent. The report path
  ("Disagree?" on any word) is the escape valve.
- **Crowding.** A second word for an already-filled pair region can be pushed
  off it; such words show explicit marks rather than a misleading position.
- **A stuck player has no way out.** With no guess limit there is no reveal
  or give-up; the board stays open until all four places are filled.
- The semantic judge is unit-tested against mocked transports; live behavior
  is proven by the live matrix at every deck/prompt version bump.
- No accounts and no multiplayer (by design). Product events are anonymous,
  first-party, and intentionally exclude player-entered text.

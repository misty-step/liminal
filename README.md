# Liminal

A daily solo intersection puzzle. Find a real, recognizable noun (or short noun
phrase) that satisfies every condition in the drawer. Five guesses. Per-condition
feedback: **Outside**, **Close**, **Inside**. Several legitimate answers per
puzzle; there is no single hidden canonical solution.

Live target: `liminal.mistystep.io` (release owned by Zoe).

## Modes

- **Today** — one puzzle per UTC day, same for every player. Deterministic
  rotation over the curated deck (`src/lib/liminal/daily.ts`).
- **Practice** — any drawer, any time. Progress is tracked per puzzle.

Each puzzle is labeled **literal object** or **wordplay** and applies that
mode's sense rules consistently.

## Feedback model

| State | Meaning |
| --- | --- |
| Inside | The answer satisfies this condition. |
| Close | The answer nearly satisfies this condition (a tested near miss). |
| Outside | The answer does not satisfy this condition. |

Five guesses; every scored guess is retained per puzzle (versioned
`localStorage` schema `liminal.v1`). Refresh keeps progress. Completed drawers
keep the concepts the player discovered.

A guess is consumed exactly when it receives a confident judgment (authored
or live). Deterministic rejections (clue echo, empty, oversized), honest
judge uncertainty, outages, rate limits, and the calibration gate consume
nothing — a refused guess is never spent.

## Judgment architecture

- **Authored deck judgments** (`src/lib/liminal/deck.ts`) are deterministic,
  offline, and always available. Every published puzzle ships with several
  verified answers and near misses that fail exactly one condition; the
  validation matrix is enforced by `src/lib/liminal/__tests__/deck.test.ts`.
- **Semantic service (Jev)** covers answers outside the authored lists.
  One authored question per condition (a Choice over descriptive levels;
  Noul yes/no only as a legacy fallback) via the server route `/api/judge`.
  Providers: TypeSafe native (`TYPESAFE_API_KEY`) or OpenRouter Decisions
  (`OPENROUTER_API_KEY`, model `typesafe/jev-1.13`).
- Probabilities are **not** intensities. Code maps them to decision bands
  (`inside >= 0.65`, `close >= 0.35`, else `outside`) in `judgment.ts`.
- Judgments are **versioned and cached** (`judgmentKey`: puzzle, condition,
  answer, model, prompt version) so duplicate submissions never reroll a
  judgment.
- A service outage is honest: the guess is **not consumed**, no score is
  fabricated, and the UI says the judge is unavailable.

## Security posture

- Credentials stay server-side (route handler only; never shipped to the client).
- Player text is untrusted data: bounded length (120 chars), rate-limited,
  time-boxed (4 s), and passed to the judge as `state` data — never as
  instructions.
- `/api/report` is size-capped and rate-limited; failures are reported honestly.

## Development

```sh
bun install
bun run dev        # local
bun run test       # vitest: engine, deck matrix, daily, storage, judge
bun run type-check
bun run build
```

## Deploy contract (for Zoe)

- Cloudflare Worker + custom domain `liminal.mistystep.io` →
  `{ "pattern": "liminal.mistystep.io", "custom_domain": true }`.
- Worker secrets: `OPENROUTER_API_KEY` (scoped) or `TYPESAFE_API_KEY`.
- Worker vars: `JEV_MODEL=typesafe/jev-1.13`, `JEV_DECISIONS_URL=https://openrouter.ai/api/alpha/decisions`.
- Build: `bun run build:cf` (OpenNext, `open-next.config.ts`); deploy:
  `bun run deploy:cf` (wrangler `--env production`).
- Durable store: D1 `liminal-judgments` (binding `LIMINAL_DB`) retains
  first-writer-wins judgments keyed by the versioned judgment keys and holds
  append-only answer reports; schema lives in `migrations/`.

## Known limitations (this slice)

- **Live calibration recovered and hardened.** Runs 1–2 failed (39/55 and
  41/55 rows mismatched); run 3 recovered via authored Choice rubrics; run 4
  (2026-09-20.4) hardened the pass-or-fail canonical family. The gate is
  `scripts/live-matrix.ts`: 53/53 rows match, 0 failures (24 answers, 17
  near misses, 12 held-out). Raw evidence: `evidence/live-matrix-*.json`,
  `evidence/calibration-findings.md`. All four launch puzzles are
  `judgeStatus: "calibrated"`; the gate still refuses any future
  uncalibrated puzzle (without consuming a guess) unless
  `JEV_ALLOW_UNCALIBRATED=1`.
- **Canonical bare words for Pass or Fail — exam, physical, test — are
  honestly refused.** The live judge splits on their senses (exam the event
  vs the exam paper; physical the adjective vs the noun) and lands below the
  confidence floor, so the game refuses rather than guesses; no guess is
  consumed. Authoring them would bypass the live-matrix gate, so they stay
  out-of-deck with the report path as the escape valve. Multi-word family
  members judge confidently and are accepted: checkup (authored), bar exam,
  entrance exam, hearing test, final exam, eye test, background check.
- **The authored layer is the launch-deck authority.** It is deterministic,
  offline, and enforced by the 61-test suite plus `evidence/validation-matrix.md`.
- **"Close" has two meanings** once the judge is enabled: authored near miss
  vs model uncertainty. See the findings doc before enabling.
- The semantic judge is unit-tested against mocked transports; live behavior
  is proven by the live matrix at every deck/prompt version bump.
- Practice-mode drawer browsing is a list, not an elaborate cabinet animation.
- No analytics, no accounts, no multiplayer (by design).

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

## Judgment architecture

- **Authored deck judgments** (`src/lib/liminal/deck.ts`) are deterministic,
  offline, and always available. Every published puzzle ships with several
  verified answers and near misses that fail exactly one condition; the
  validation matrix is enforced by `src/lib/liminal/__tests__/deck.test.ts`.
- **Semantic service (Jev)** covers answers outside the authored lists.
  One Noul question per condition via the server route `/api/judge`.
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
- The repo is ready for the OpenNext Cloudflare build (chrondle precedent);
  adding `@opennextjs/cloudflare` + `open-next.config.ts` is the remaining
  deploy step.

## Known limitations (this slice)

- **Live calibration is required and not yet run.** Fixture tests prove the
  rules, not the live model. Run `scripts/live-matrix.ts` against live Jev
  (`OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`) before release and attach the
  `evidence/live-matrix-*.json` output. The full-deck positive/near-miss matrix
  is a release gate.
- The semantic judge is coded and unit-tested against mocked transports; it has
  not run against the live Jev endpoint in this slice (no key in the build
  environment). Zoe owns the scoped key.
- Practice-mode drawer browsing is a list, not an elaborate cabinet animation.
- No analytics, no accounts, no multiplayer (by design).

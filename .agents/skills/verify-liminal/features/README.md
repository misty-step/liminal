# Liminal verification map

This directory is the maintained list of what a player can do in Liminal and
how to prove each thing works. Read this index first, then use the matching
feature file as the recipe. Story IDs refer to `SPEC.md`.

## Baseline preconditions

- Production: `verify-liminal doctor prod` passes. Only read-only journeys run there.
- Local: `verify-liminal build`, then `verify-liminal launch` (instance `offline`).
  Add `launch --judge` with the judge key for live-judge recipes. `verify-liminal doctor <instance>` passes.
- The local D1 is fresh and has no `schedule` rows, so a local instance serves
  the bundled deck's fallback puzzle for today. Production serves the D1
  schedule. Both are today's puzzle number; their circles differ.
- A fresh browser context is a first-time player: empty progress, and the how-to opens.
- Never drive an instance this run did not launch, except production read-only.

## Driving conventions

- `verify-liminal journey <target>` drives every read-only recipe below in one
  run. Drive a single step by hand with Playwright, using the selectors named
  in each feature file.
- Take answers from `/api/today` (`puzzle.judgments.pairs.c1|c2|c3.answers`,
  `puzzle.judgments.center.answers`). Never hard-code a word; the puzzle changes daily.
- Prefer roles and accessible names: buttons `Place`, `Share`, `Play #N`,
  `Back to today`, `Disagree?`, `How to play`, `Try again`, and links
  `Changelog` and `Play today`. Use the app's stable classes only where there is
  no role: `#guess`, `.label-c1 .label-main`, `.board .word-layer .word`,
  `.target.filled`, `.meter-count`, `.meter-clock`, `p.status`,
  `h2.end-title`, `p.end-sub`, `dialog.howto`, `.detail .verdicts li`,
  `.reveal-chip`.
- Wait for state (`main#game[aria-busy="false"]`, a status fragment, a word), never a fixed sleep.

## Proof and skip reporting

- Proof has a screenshot of the action's result and a `PASS` line with the observed value.
- Writes are proven where they land: the local D1 for reports and judgments.
- On production, the proof that the journey wrote nothing is the
  `journey.json` request census: only GET/HEAD were sent, and none were blocked.
- Report an unreachable path with the command tried and the unmet
  precondition. Never report a recipe as verified through a different path.

## Feature entry contract

Each feature file has an H1, one paragraph of user-visible behavior, and four
H2s in order: `Sub-features`, `How to get to it (user POV)`,
`Driving it with verify-liminal`, `Gotchas`.

## Features

- [Play today's puzzle](./play-today.md): first visit, free refusals, filling all four, score, persistence, and word detail (US-001, US-002, US-003).
- [Live judge](./live-judge.md): novel words and instruction-like input judged by Jev. Local only (US-002).
- [Share a result](./share.md): spoiler-free share text and the friend's `/s/<code>` page (US-007).
- [Archive and schedule](./archive.md): the shared daily number, earlier days, and the refused future (US-005, US-006).
- [Dispute a verdict](./dispute.md): "Disagree?" stores a report. Local only (US-004).
- [Changelog](./changelog.md): release notes for the serving version (US-012).
- [States that break](./breaking-states.md): schedule outage, judge outage and rate limit, slow network, denied storage, phone width and keyboard, reduced motion, the paused clock, and optional sound (US-002, US-003, US-005, US-009, US-010).

## Not covered, on purpose

- **Sign-in:** Liminal has no accounts, sessions, or owner-only pages, so
  there is no owner identity to sign in as.
- **Safe app updates** (US-011) are proven by CI and the deploy pipeline. CI walks the stories against the exact bundled artifact (`scripts/verify-artifact.py`), and `Deploy app` promotes it with rollback. After a merge, `verify-liminal doctor prod` confirms the served revision.
- **Product analytics** (the PostHog capability in SPEC) is excluded because the journey blocks every external origin, so synthetic play never reaches the real sink. To prove capture, run `BASE=<local URL> bun e2e/product-analytics.ts` (README, Development). It sends synthetic events to the live sink.
- **Nightly puzzle publication** (`puzzles:daily`, US-008) spends generator
  credit and writes the production schedule. It is an operator pipeline, not a
  player journey. The doctor checks only its player-visible outcome, today's
  numbered, calibrated puzzle.

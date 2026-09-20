# AGENTS.md — Liminal

Solo daily puzzle app. Standard Misty Step conventions: Next.js (App Router),
TypeScript strict, bun, vitest, Cloudflare Workers deploy.

## Layout

- `src/lib/liminal/` — pure game engine (deck, evaluator, daily rotation,
  storage, judgment mapping, TypeSafe/OpenRouter client). No React imports.
- `src/app/` — UI and API routes (`/api/judge`, `/api/report`).
- `src/lib/liminal/__tests__/` — the executable rule tests. Deck edits must
  keep `deck.test.ts` green: every puzzle needs several verified answers and
  near misses failing exactly one condition.

## Rules of the game (product contract)

- Solo only. No rooms, no partners, no multiplayer infrastructure.
- Several legitimate answers per puzzle; never a single canonical solution.
- Five guesses; persistent per-puzzle history; daily + practice.
- Outside / Close / Inside per condition; never decimal dashboards.
- Literal-object and wordplay puzzles are labeled and judged separately.
- Reject invented objects, clue repetition, and instruction-like input.
- Outages are honest: no fabricated scores, no unfairly consumed guesses.

## Editing judgments

Bump `judgments.version` for any answer/condition change and add tests. Runtime
caches key on that version, so edits cannot silently reroll existing judgments.

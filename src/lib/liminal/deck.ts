import { parsePuzzle } from "./puzzleSchema";
import { PUZZLE_FILES } from "./puzzles";
import type { Puzzle } from "./types";

/**
 * The in-between deck: one validated JSON file per puzzle in ./puzzles, in
 * rotation order. Every puzzle is a three-circle diagram with four regions to
 * fill: the center and three pair regions (inside two circles, outside the
 * third). Every puzzle ships with:
 * - verified answers for every region, placed by the authored path offline,
 * - held-out valid answers per region that are NOT in the allowlist:
 *   scripts/live-matrix.ts must show the live judge placing them (the
 *   open-answer guarantee),
 * - conditions the judge can answer yes or no to with confidence, because a
 *   pair region depends on a clean "no".
 *
 * New puzzles come from the generator (`bun run puzzles:generate`, see
 * scripts/generator/) and enter through `bun run puzzles:promote`.
 *
 * Bump a puzzle's judgments.version (and DECK_VERSION) whenever its answers or
 * conditions change. Runtime caches key on the judgment and prompt versions,
 * so an edit cannot silently reroll an existing judgment.
 *
 * judgeStatus stays "uncalibrated" until scripts/live-matrix.ts passes live
 * (last clean run for the launch six: evidence/live-matrix-2026-09-23T20-17-24-426Z.json).
 */
export const DECK_VERSION = "2026-09-23.1";

export const DECK: readonly Puzzle[] = PUZZLE_FILES.map(({ file, data }) =>
  parsePuzzle(data, `puzzles/${file}`),
);

export function getPuzzle(id: string): Puzzle | undefined {
  return DECK.find((puzzle) => puzzle.id === id);
}

import { normalizeAnswer } from "./normalize";
import { GUESS_LIMIT, MAX_ANSWER_LENGTH } from "./types";
import type { ConditionState, GuessFeedback, Puzzle } from "./types";

function statesFor(
  puzzle: Puzzle,
  resolve: (conditionId: string) => ConditionState,
): Record<string, ConditionState> {
  return Object.fromEntries(puzzle.conditions.map((c) => [c.id, resolve(c.id)]));
}

function allInside(puzzle: Puzzle): Record<string, ConditionState> {
  return statesFor(puzzle, () => "inside");
}

function allOutside(puzzle: Puzzle): Record<string, ConditionState> {
  return statesFor(puzzle, () => "outside");
}

export function isSolved(states: Record<string, ConditionState>): boolean {
  return Object.values(states).every((state) => state === "inside");
}

/** Text that a guess must not merely repeat. */
export function echoTexts(puzzle: Puzzle): string[] {
  return [puzzle.title, puzzle.drawer, puzzle.teaser, ...puzzle.conditions.map((c) => c.text)].map(
    normalizeAnswer,
  );
}

/**
 * Evaluate one guess against the authored judgments only.
 *
 * Authored, deterministic, offline-safe:
 * - verified answer  -> every condition inside (a win),
 * - tested near miss -> the failed condition close, the rest inside,
 * - anything else    -> marked `needsJudgment` so the caller can consult the
 *   semantic service without consuming a guess when it is unavailable.
 */
export function evaluateGuess(puzzle: Puzzle, raw: string): GuessFeedback {
  const base = {
    solved: false,
    source: "authored" as const,
    judgmentVersion: puzzle.judgments.version,
  };
  const answer = normalizeAnswer(raw);

  if (raw.length > MAX_ANSWER_LENGTH) {
    return { ...base, states: allOutside(puzzle), rejected: "too-long" };
  }
  if (!answer) {
    return { ...base, states: allOutside(puzzle), rejected: "empty" };
  }
  if (echoTexts(puzzle).includes(answer)) {
    return { ...base, states: allOutside(puzzle), rejected: "echo" };
  }

  const authoredAnswers = puzzle.judgments.answers.map(normalizeAnswer);
  if (authoredAnswers.includes(answer)) {
    const states = allInside(puzzle);
    return { ...base, states, solved: true };
  }

  const nearMiss = puzzle.judgments.nearMisses.find((n) => normalizeAnswer(n.answer) === answer);
  if (nearMiss) {
    const states = statesFor(puzzle, (id) => (id === nearMiss.fails ? "close" : "inside"));
    return { ...base, states, solved: false };
  }

  return { ...base, states: allOutside(puzzle), needsJudgment: true };
}

/** Merge a semantic-service judgment into a guess result. */
export function judgedFeedback(
  states: Record<string, ConditionState>,
  source: GuessFeedback["source"],
  judgmentVersion: string,
): GuessFeedback {
  return {
    states,
    solved: isSolved(states),
    source,
    judgmentVersion,
  };
}

export function guessesRemaining(guessesUsed: number): number {
  return Math.max(0, GUESS_LIMIT - guessesUsed);
}

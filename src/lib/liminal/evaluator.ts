import { normalizeAnswer } from "./normalize";
import { CONDITION_IDS } from "./regions";
import type { ConditionId, ConditionState, GuessFeedback, JudgmentSource, Puzzle } from "./types";
import { MAX_ANSWER_LENGTH } from "./types";

function statesFor(
  resolve: (conditionId: ConditionId) => ConditionState,
): Record<ConditionId, ConditionState> {
  return { c1: resolve("c1"), c2: resolve("c2"), c3: resolve("c3") };
}

/** Text that a guess must not merely repeat: the circle labels and their clarifiers. */
export function echoTexts(puzzle: Puzzle): string[] {
  return puzzle.conditions
    .flatMap((c) => (c.detail ? [c.text, c.detail] : [c.text]))
    .map(normalizeAnswer);
}

/**
 * Evaluate one guess against the authored judgments only.
 *
 * Authored, deterministic, offline-safe:
 * - center answer -> inside every circle,
 * - pair answer   -> outside the one circle its region excludes, inside the others,
 * - anything else -> `needsJudgment`, so the caller can consult the semantic
 *   service without spending a guess when it is unavailable.
 * Refusals (empty, too long, a circle label, a word already placed) spend nothing.
 */
export function evaluateGuess(
  puzzle: Puzzle,
  raw: string,
  previousAnswers: readonly string[] = [],
): GuessFeedback {
  const base = { source: "authored" as const, judgmentVersion: puzzle.judgments.version };
  const outside = statesFor(() => "outside");
  const answer = normalizeAnswer(raw);

  if (raw.length > MAX_ANSWER_LENGTH) return { ...base, states: outside, rejected: "too-long" };
  if (!answer) return { ...base, states: outside, rejected: "empty" };
  if (echoTexts(puzzle).includes(answer)) return { ...base, states: outside, rejected: "echo" };
  if (previousAnswers.some((previous) => normalizeAnswer(previous) === answer)) {
    return { ...base, states: outside, rejected: "repeat" };
  }

  const { center, pairs } = puzzle.judgments;
  if (center.answers.some((a) => normalizeAnswer(a) === answer)) {
    return { ...base, states: statesFor(() => "inside") };
  }
  for (const excluded of CONDITION_IDS) {
    if (pairs[excluded].answers.some((a) => normalizeAnswer(a) === answer)) {
      return { ...base, states: statesFor((id) => (id === excluded ? "outside" : "inside")) };
    }
  }

  return { ...base, states: outside, needsJudgment: true };
}

/** Wrap a semantic-service judgment as guess feedback. */
export function judgedFeedback(
  states: Record<ConditionId, ConditionState>,
  source: JudgmentSource,
  judgmentVersion: string,
): GuessFeedback {
  return { states, source, judgmentVersion };
}

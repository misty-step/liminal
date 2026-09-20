import type { ConditionState, Puzzle } from "./types";

/**
 * TypeSafe "Jev" supplies narrow yes/no judgments. Each condition becomes one
 * Noul question, and code maps the returned probabilities to feedback bands.
 *
 * A probability is a calibrated probability that the answer is yes. It is NOT
 * an intensity dial. Code owns the decision: the thresholds below are decision
 * bands, and they are versioned with the model and prompt so a judgment can
 * never be rerolled by resubmitting the same answer.
 */
export const JUDGE_THRESHOLDS = {
  /** p >= 0.65 -> inside (yes). */
  inside: 0.65,
  /** 0.35 <= p < 0.65 -> close (the model is genuinely unsure). */
  close: 0.35,
} as const;

export const JUDGE_PROMPT_VERSION = "liminal-judge-2026-09-20.1";
export const DEFAULT_MODEL = "jev-latest";

export function stateFromNoul(probability: number): ConditionState {
  if (!Number.isFinite(probability)) return "outside";
  if (probability >= JUDGE_THRESHOLDS.inside) return "inside";
  if (probability >= JUDGE_THRESHOLDS.close) return "close";
  return "outside";
}

/** Cache key: answer + condition + judgment identity. Any change rerolls deliberately. */
export function judgmentKey(input: {
  puzzleId: string;
  conditionId: string;
  answer: string;
  model: string;
}): string {
  return [
    input.puzzleId,
    input.conditionId,
    input.answer,
    input.model,
    JUDGE_PROMPT_VERSION,
  ].join("|");
}

export interface JudgeQuestion {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

/**
 * One Noul per condition. The player answer is passed as state data and never
 * interpreted as instructions; the question text is authored here, not by the
 * player.
 */
export function buildQuestions(puzzle: Puzzle): Record<string, JudgeQuestion> {
  const questions: Record<string, JudgeQuestion> = {};
  for (const condition of puzzle.conditions) {
    questions[condition.id] = {
      type: "noul",
      instructions: `Does \`answer\` satisfy this condition: ${condition.text}?`,
      criteria: {
        true: "The answer clearly satisfies the condition.",
        false: "The answer does not satisfy the condition.",
      },
    };
  }
  return questions;
}

export interface JudgeOutcome {
  status: "judged";
  states: Record<string, ConditionState>;
  model: string;
  judgmentVersion: string;
}

export type JudgeFailure = {
  status: "unavailable";
  reason: "not-configured" | "timeout" | "upstream-error" | "invalid-response";
};

export type JudgeResult = JudgeOutcome | JudgeFailure;

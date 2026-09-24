import type { ConditionState, Puzzle } from "./types";

/**
 * TypeSafe "Jev" supplies typed judgments, one per condition.
 *
 * Every launch-deck condition carries authored descriptive levels (a Choice
 * question). Choice answers are scored from their probability distribution:
 * yes counts fully and partly counts half, then JUDGE_THRESHOLDS bands the
 * score into outside / close / inside. A Noul yes/no is reserved for genuinely
 * binary conditions and uses the same bands. A probability is never shown as
 * an intensity.
 *
 * Thresholds, keys, and rubric wording are versioned with the model and prompt
 * so a judgment can never be rerolled by resubmitting the same answer.
 */
export const JUDGE_THRESHOLDS = {
  /** Noul probability or Choice score >= 0.65 -> inside. */
  inside: 0.65,
  /** Noul probability or Choice score from 0.35 to below 0.65 -> close. */
  close: 0.35,
} as const;

export const JUDGE_PROMPT_VERSION = "liminal-judge-2026-09-23.1";
export const DEFAULT_MODEL = "jev-latest";

/** Option keys of every Choice rubric. */
export const CHOICE_KEYS = ["yes", "partly", "no"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export function stateFromNoul(probability: number): ConditionState {
  if (!Number.isFinite(probability)) return "outside";
  if (probability >= JUDGE_THRESHOLDS.inside) return "inside";
  if (probability >= JUDGE_THRESHOLDS.close) return "close";
  return "outside";
}

/** Score a validated Choice distribution with the same bands as Noul. */
export function stateFromChoiceProbabilities(p: Record<string, unknown>): ConditionState | null {
  const { yes, partly, no } = p;
  if (
    typeof yes !== "number" ||
    !Number.isFinite(yes) ||
    yes < 0 ||
    yes > 1 ||
    typeof partly !== "number" ||
    !Number.isFinite(partly) ||
    partly < 0 ||
    partly > 1 ||
    typeof no !== "number" ||
    !Number.isFinite(no) ||
    no < 0 ||
    no > 1
  ) {
    return null;
  }
  return stateFromNoul(yes + partly / 2);
}

/** Cache key: answer + condition + judgment identity. Any change rerolls deliberately. */
export function judgmentKey(input: {
  puzzleId: string;
  conditionId: string;
  answer: string;
  model: string;
}): string {
  return [input.puzzleId, input.conditionId, input.answer, input.model, JUDGE_PROMPT_VERSION].join(
    "|",
  );
}

export type JudgeQuestion =
  | {
      type: "noul";
      instructions: string;
      criteria: { true: string; false: string };
    }
  | {
      type: "choice";
      instructions: string;
      criteria: Record<ChoiceKey, string>;
    };

/**
 * One question per condition. Conditions with authored levels become Choice
 * questions (descriptive outside/close/inside); the rest fall back to a Noul
 * yes/no. The player answer is passed as state data and never interpreted as
 * instructions; the question text is authored here, not by the player.
 */
export function buildQuestions(puzzle: Puzzle): Record<string, JudgeQuestion> {
  const questions: Record<string, JudgeQuestion> = {};
  for (const condition of puzzle.conditions) {
    questions[condition.id] = condition.levels
      ? {
          type: "choice",
          instructions: condition.judge ?? condition.text,
          criteria: {
            yes: condition.levels.yes,
            partly: condition.levels.partly,
            no: condition.levels.no,
          },
        }
      : {
          type: "noul",
          instructions: condition.judge ?? condition.text,
          criteria: {
            true: "The answer clearly satisfies the condition.",
            false: "The answer does not satisfy the condition.",
          },
        };
  }
  return questions;
}

export function judgeEnabledFor(puzzle: Puzzle, env: Record<string, string | undefined>): boolean {
  return puzzle.judgeStatus === "calibrated" || env.JEV_ALLOW_UNCALIBRATED === "1";
}

export interface JudgeOutcome {
  status: "judged";
  states: Record<string, ConditionState>;
  /** Live confidence per condition, when the judgment was fresh. */
  confidences?: Record<string, number>;
  model: string;
  judgmentVersion: string;
}

export type JudgeFailure = {
  status: "unavailable";
  reason: "not-configured" | "timeout" | "upstream-error" | "invalid-response";
};

export type JudgeResult = JudgeOutcome | JudgeFailure;

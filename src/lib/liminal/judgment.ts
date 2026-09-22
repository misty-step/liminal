import type { ConditionState, Puzzle } from "./types";

/**
 * TypeSafe "Jev" supplies typed judgments, one per condition.
 *
 * Every launch-deck condition carries authored descriptive levels (a Choice
 * question): the judge picks the level that fits, and code maps the pick to
 * outside / close / inside. A Noul yes/no is reserved for genuinely binary
 * conditions. A probability or confidence is never an intensity dial, and
 * uncertainty below the confidence floor is surfaced honestly as "uncertain"
 * instead of being dressed up as a near miss.
 *
 * Thresholds, keys, and rubric wording are versioned with the model and prompt
 * so a judgment can never be rerolled by resubmitting the same answer.
 */
export const JUDGE_THRESHOLDS = {
  /** Noul only: p >= 0.65 -> inside (yes). */
  inside: 0.65,
  /** Noul only: 0.35 <= p < 0.65 -> close (the model is genuinely unsure). */
  close: 0.35,
} as const;

/**
 * A Choice pick below this confidence is uncertainty, not a judgment. The
 * caller refuses honestly and consumes no guess. Principled default: the pick
 * must carry the majority of the probability mass.
 */
export const CHOICE_CONFIDENCE_FLOOR = 0.5;

export const JUDGE_PROMPT_VERSION = "liminal-judge-2026-09-20.4";
export const DEFAULT_MODEL = "jev-latest";

/** Option keys of every Choice rubric; yes/partly/no map to inside/close/outside. */
export const CHOICE_KEYS = ["yes", "partly", "no"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export function stateFromNoul(probability: number): ConditionState {
  if (!Number.isFinite(probability)) return "outside";
  if (probability >= JUDGE_THRESHOLDS.inside) return "inside";
  if (probability >= JUDGE_THRESHOLDS.close) return "close";
  return "outside";
}

/** Maps a Choice option key to a feedback state. Unknown keys are invalid. */
export function stateFromChoice(choice: string): ConditionState | null {
  if (choice === "yes") return "inside";
  if (choice === "partly") return "close";
  if (choice === "no") return "outside";
  return null;
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
  reason: "not-configured" | "timeout" | "upstream-error" | "invalid-response" | "uncertain";
};

export type JudgeResult = JudgeOutcome | JudgeFailure;

/** Core types for Liminal. Authored judgments are versioned and retained. */

export type PuzzleMode = "literal" | "wordplay";

/** Per-condition feedback. Three states, never a decimal dashboard. */
export type ConditionState = "outside" | "close" | "inside";

/** Every puzzle is a three-circle diagram; conditions are always c1, c2, c3. */
export type ConditionId = "c1" | "c2" | "c3";

/**
 * A region the player fills: "center" (inside all three circles) or a pair
 * region, named by the one condition it falls outside.
 */
export type TargetKey = "center" | ConditionId;

/**
 * Descriptive rubric levels for a condition's Choice question. Each level is a
 * plain-language description; the judge weighs them, and code maps the result
 * to outside / close / inside. Wording is authored, versioned with the
 * judgment set, and never shown to the player.
 */
export interface ChoiceLevels {
  /** Clearly satisfies the condition. */
  yes: string;
  /** Borderline or a stretch. */
  partly: string;
  /** Does not satisfy the condition. */
  no: string;
}

export interface Condition {
  id: ConditionId;
  /** Player-facing circle label: short, authored by hand, never generated. */
  text: string;
  /** Optional quiet second line that pins the intended sense. */
  detail?: string;
  /**
   * Self-contained phrasing handed to the judge for this condition. It must not
   * rely on antecedents from the display text. Falls back to `text` when omitted.
   */
  judge?: string;
  /** Authored Choice rubric. Absent means the condition falls back to a Noul yes/no. */
  levels?: ChoiceLevels;
}

/** Answers for one target region. */
export interface RegionAnswers {
  /** Verified answers the authored path places here, offline and deterministically. */
  answers: string[];
  /**
   * Valid answers deliberately held OUT of the authored allowlist.
   * scripts/live-matrix.ts must show the live judge placing them here: the
   * open-answer guarantee.
   */
  heldOut: string[];
}

export interface AuthoredJudgment {
  /** Version string for the authored judgment set. Bump on any edit. */
  version: string;
  /** Inside all three circles. */
  center: RegionAnswers;
  /** Inside two circles and outside the third, keyed by the condition it falls outside. */
  pairs: Record<ConditionId, RegionAnswers>;
}

export interface Puzzle {
  id: string;
  /** Literal-object and wordplay puzzles apply their own sense rules. */
  mode: PuzzleMode;
  conditions: readonly [Condition, Condition, Condition];
  judgments: AuthoredJudgment;
  /**
   * Whether live semantic judging has been calibrated for this puzzle's
   * conditions. Uncalibrated puzzles refuse live judging (no guess consumed)
   * unless explicitly allowed.
   */
  judgeStatus?: "calibrated" | "uncalibrated";
}

export type JudgmentSource = "authored" | "cached" | "judged";

export interface GuessFeedback {
  states: Record<ConditionId, ConditionState>;
  source: JudgmentSource;
  /** Version of the judgment set used for this feedback. */
  judgmentVersion: string;
  /** True when the guess needs the semantic service before it can be scored. */
  needsJudgment?: boolean;
  /** Set when the guess was refused before judgment; refusals spend nothing. */
  rejected?: "echo" | "empty" | "too-long" | "repeat";
}

export interface GuessRecord {
  answer: string;
  states: Record<ConditionId, ConditionState>;
  at: number;
  source: JudgmentSource;
}

/** Saved per puzzle. Filled regions derive from the guesses (see regions.ts). */
export interface PuzzleProgress {
  schemaVersion: 2;
  puzzleId: string;
  guesses: GuessRecord[];
  /** Thinking time on the clock: excludes judge waits, hidden tabs, and the how-to. */
  elapsedMs: number;
  updatedAt: number;
}

export const MAX_ANSWER_LENGTH = 120;

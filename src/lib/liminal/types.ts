/** Core types for Liminal. Authored judgments are versioned and retained. */

export type PuzzleMode = "literal" | "wordplay";

/** Per-condition feedback. Three states, never a decimal dashboard. */
export type ConditionState = "outside" | "close" | "inside";

export interface Condition {
  /** Stable id used in judgments, caches, and feedback. */
  id: string;
  /** Player-facing condition text. Authored by hand; never generated at runtime. */
  text: string;
}

/** One authored near miss: a real answer that fails exactly one condition. */
export interface NearMiss {
  answer: string;
  /** Condition id the near miss fails. The other conditions are inside. */
  fails: string;
  note?: string;
}

export interface AuthoredJudgment {
  /** Version string for the authored judgment set. Bump on any edit. */
  version: string;
  /** Answers verified to satisfy every condition. */
  answers: string[];
  /** Near misses with tested single-condition failures. */
  nearMisses: NearMiss[];
}

export interface Puzzle {
  id: string;
  title: string;
  /** Cabinet drawer label. */
  drawer: string;
  mode: PuzzleMode;
  /** Short authored teaser line. */
  teaser: string;
  conditions: Condition[];
  judgments: AuthoredJudgment;
}

export type JudgmentSource = "authored" | "cached" | "judged";

export interface GuessFeedback {
  /** Condition id -> state. */
  states: Record<string, ConditionState>;
  solved: boolean;
  source: JudgmentSource;
  /** Version of the judgment set used for this feedback. */
  judgmentVersion: string;
  /** True when the guess needs the semantic service before it can be scored. */
  needsJudgment?: boolean;
  /** Set when the guess was rejected before judgment. */
  rejected?: "echo" | "empty" | "too-long";
}

export interface GuessRecord {
  answer: string;
  states: Record<string, ConditionState>;
  at: number;
  source: JudgmentSource;
  solved: boolean;
}

export interface PuzzleProgress {
  schemaVersion: 1;
  puzzleId: string;
  guesses: GuessRecord[];
  solved: boolean;
  solvedAnswer?: string;
  /** Concepts the player discovered in this drawer. */
  collected: string[];
  updatedAt: number;
}

export const GUESS_LIMIT = 5;
export const MAX_ANSWER_LENGTH = 120;

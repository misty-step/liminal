import { boardState, landingOf } from "./regions";
import type { GuessFeedback, PuzzleProgress } from "./types";

/** The record boundary receives evaluated feedback, not raw input or network effects. */
export interface GuessEvent {
  kind: "feedback-received";
  feedback: GuessFeedback;
  answer: string;
  at: number;
}

export type GuessTransition =
  | "awaiting-judgment"
  | "refused"
  | "already-complete"
  | "filled-region"
  | "filled-board"
  | "already-filled"
  | "line"
  | "single"
  | "outside";

export function guessTransition(state: PuzzleProgress, event: GuessEvent): GuessTransition {
  if (event.feedback.needsJudgment) return "awaiting-judgment";
  if (event.feedback.rejected) return "refused";
  const board = boardState(state.guesses);
  if (board.complete) return "already-complete";
  const landing = landingOf(event.feedback.states);
  if (landing.kind !== "target") return landing.kind;
  if (board.fills[landing.key] !== undefined) return "already-filled";
  return board.filledCount === 3 ? "filled-board" : "filled-region";
}

/** Pure: the caller owns evaluation, clocks, persistence, requests, and UI effects. */
export function reduceGuess(state: PuzzleProgress, event: GuessEvent): PuzzleProgress {
  const transition = guessTransition(state, event);
  if (
    transition === "awaiting-judgment" ||
    transition === "refused" ||
    transition === "already-complete"
  ) {
    return state;
  }
  return {
    ...state,
    guesses: [
      ...state.guesses,
      {
        answer: event.answer,
        states: event.feedback.states,
        at: event.at,
        source: event.feedback.source,
      },
    ],
    updatedAt: event.at,
  };
}

export const GUESS_REASONS: Record<GuessTransition, string> = {
  "awaiting-judgment":
    "Evaluation needs a judge. Unresolved feedback spends no guess and changes no progress.",
  refused: "The evaluator refused this input. Refusals spend no guess and change no progress.",
  "already-complete": "All four regions are filled. Later feedback cannot add a guess.",
  "filled-region":
    "A judged answer lands cleanly in an empty region. Spend one guess and fill that region.",
  "filled-board":
    "The fourth distinct region is filled. Spend one guess; the board is now complete.",
  "already-filled":
    "A different judged answer lands in an occupied region. Spend one guess; keep its original fill.",
  line: "At least one condition is close. This is a judgment, so spend one guess, but fill no region.",
  single: "The answer is inside only one circle. Spend one guess, but fill no region.",
  outside: "The answer is outside every circle. Spend one guess, but fill no region.",
};

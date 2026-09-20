import { GUESS_LIMIT } from "./types";
import type { GuessFeedback, GuessRecord, PuzzleProgress } from "./types";

const KEY_PREFIX = "liminal.v1.puzzle.";

export function storageKey(puzzleId: string): string {
  return `${KEY_PREFIX}${puzzleId}`;
}

export function emptyProgress(puzzleId: string, now: number = Date.now()): PuzzleProgress {
  return {
    schemaVersion: 1,
    puzzleId,
    guesses: [],
    solved: false,
    collected: [],
    updatedAt: now,
  };
}

export function parseProgress(raw: string | null, puzzleId: string): PuzzleProgress | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PuzzleProgress;
    if (value.schemaVersion !== 1 || value.puzzleId !== puzzleId) return null;
    if (!Array.isArray(value.guesses) || !Array.isArray(value.collected)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Record a scored guess. Unjudged guesses must never reach this function. */
export function recordGuess(
  progress: PuzzleProgress,
  feedback: GuessFeedback,
  answer: string,
  now: number = Date.now(),
): PuzzleProgress {
  if (feedback.needsJudgment || feedback.rejected) return progress;
  if (progress.solved || progress.guesses.length >= GUESS_LIMIT) return progress;

  const record: GuessRecord = {
    answer,
    states: feedback.states,
    at: now,
    source: feedback.source,
    solved: feedback.solved,
  };

  const discovered = Object.values(feedback.states).some((state) => state === "inside")
    ? [answer]
    : [];

  return {
    ...progress,
    guesses: [...progress.guesses, record],
    solved: progress.solved || feedback.solved,
    solvedAnswer: feedback.solved ? answer : progress.solvedAnswer,
    collected: [...new Set([...progress.collected, ...discovered])],
    updatedAt: now,
  };
}

export function canGuess(progress: PuzzleProgress): boolean {
  return !progress.solved && progress.guesses.length < GUESS_LIMIT;
}

/** localStorage helpers; safe to call on the server (they no-op). */
export function loadProgress(puzzleId: string): PuzzleProgress | null {
  if (typeof window === "undefined") return null;
  return parseProgress(window.localStorage.getItem(storageKey(puzzleId)), puzzleId);
}

export function saveProgress(progress: PuzzleProgress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(progress.puzzleId), JSON.stringify(progress));
}

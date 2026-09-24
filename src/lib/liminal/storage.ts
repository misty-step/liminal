import { boardState, parseStates } from "./regions";
import type { GuessFeedback, GuessRecord, PuzzleProgress } from "./types";

// v2: the in-between game. v1 progress (five guesses, one center) is not
// migrated; its semantics no longer apply.
const KEY_PREFIX = "liminal.v2.puzzle.";

export function storageKey(puzzleId: string): string {
  return `${KEY_PREFIX}${puzzleId}`;
}

export function emptyProgress(puzzleId: string, now: number = Date.now()): PuzzleProgress {
  return { schemaVersion: 2, puzzleId, guesses: [], elapsedMs: 0, updatedAt: now };
}

const SOURCES = new Set(["authored", "cached", "judged"]);

function isGuessRecord(value: unknown): value is GuessRecord {
  if (!value || typeof value !== "object") return false;
  if (!("answer" in value) || typeof value.answer !== "string") return false;
  if (!("at" in value) || typeof value.at !== "number") return false;
  if (!("source" in value) || !SOURCES.has(String(value.source))) return false;
  return "states" in value && parseStates(value.states) !== null;
}

export function parseProgress(raw: string | null, puzzleId: string): PuzzleProgress | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("schemaVersion" in value) ||
      value.schemaVersion !== 2 ||
      !("puzzleId" in value) ||
      value.puzzleId !== puzzleId ||
      !("guesses" in value) ||
      !Array.isArray(value.guesses) ||
      !value.guesses.every(isGuessRecord)
    ) {
      return null;
    }
    const updatedAt =
      "updatedAt" in value && typeof value.updatedAt === "number" ? value.updatedAt : 0;
    const elapsedMs =
      "elapsedMs" in value && typeof value.elapsedMs === "number" && value.elapsedMs >= 0
        ? value.elapsedMs
        : 0;
    return { schemaVersion: 2, puzzleId, guesses: value.guesses, elapsedMs, updatedAt };
  } catch {
    return null;
  }
}

/**
 * Record a judged guess. Refused or unjudged guesses never reach the board,
 * and a complete board takes no more. There is no guess limit.
 */
export function recordGuess(
  progress: PuzzleProgress,
  feedback: GuessFeedback,
  answer: string,
  now: number = Date.now(),
): PuzzleProgress {
  if (feedback.needsJudgment || feedback.rejected) return progress;
  if (boardState(progress.guesses).complete) return progress;
  const record: GuessRecord = { answer, states: feedback.states, at: now, source: feedback.source };
  return { ...progress, guesses: [...progress.guesses, record], updatedAt: now };
}

export function canGuess(progress: PuzzleProgress): boolean {
  return !boardState(progress.guesses).complete;
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

import type { Puzzle } from "./types";

/**
 * Daily selection: the deck rotates by UTC day number so every player sees the
 * same puzzle on the same UTC date. Practice mode bypasses this.
 */
export function dateKeyUTC(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * The fallback rotation for dates the schedule has no entry for. Frozen at
 * launch: it must never grow or reorder, because every unscheduled past date
 * (and its archive board) is derived from it on each request. New puzzles
 * publish through the schedule, never by extending this list.
 */
export const FALLBACK_ROTATION = [
  "bath-vessel",
  "shell-water-eat",
  "wheels-motor-ride",
  "keys-music-carry",
  "head-and-foot",
  "tail-fly-alive",
] as const;

export function dailyPuzzleIndex(dateKey: string): number {
  const size = FALLBACK_ROTATION.length;
  const index = dayNumber(dateKey) % size;
  return index < 0 ? index + size : index;
}

/** The fallback puzzle for a date, looked up by frozen id in `deck`. */
export function dailyPuzzle(dateKey: string, deck: readonly Puzzle[]): Puzzle {
  const id = FALLBACK_ROTATION[dailyPuzzleIndex(dateKey)];
  const puzzle = deck.find((candidate) => candidate.id === id);
  if (!puzzle) throw new Error(`fallback rotation names a missing puzzle: ${id}`);
  return puzzle;
}

/** Puzzle #1 is this date; numbers count UTC days from it, so they never reshuffle. */
export const PUZZLE_EPOCH = "2026-09-23";

export function puzzleNumber(dateKey: string): number {
  return dayNumber(dateKey) - dayNumber(PUZZLE_EPOCH) + 1;
}

export function dateForNumber(number: number): string {
  return new Date((dayNumber(PUZZLE_EPOCH) + number - 1) * 86_400_000).toISOString().slice(0, 10);
}

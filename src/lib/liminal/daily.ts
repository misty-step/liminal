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

export function dailyPuzzleIndex(dateKey: string, deckSize: number): number {
  const index = dayNumber(dateKey) % deckSize;
  return index < 0 ? index + deckSize : index;
}

export function dailyPuzzle(dateKey: string, deck: readonly Puzzle[]): Puzzle {
  return deck[dailyPuzzleIndex(dateKey, deck.length)];
}

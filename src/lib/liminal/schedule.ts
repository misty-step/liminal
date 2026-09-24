import type { Puzzle } from "./types";

/**
 * The published schedule: one puzzle per UTC date. Puzzles live here at
 * runtime (D1 table `schedule`, see migrations/0003_schedule.sql) so the daily
 * generator can publish without a deploy. The bundled deck is the fallback
 * for any date without an entry, so the game never shows a blank day.
 */
export interface ScheduleEntry {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  /** Puzzle number from daily.ts `puzzleNumber(date)`. */
  number: number;
  puzzle: Puzzle;
  /** How the entry got here: the daily generator, or a manual promote. */
  source: "generator" | "manual";
  createdAt: string;
}

/** What the client receives for a date: the puzzle and its public number. */
export interface DailyPayload {
  date: string;
  number: number;
  puzzle: Puzzle;
}

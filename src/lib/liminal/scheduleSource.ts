/**
 * Runtime source of the day's puzzle. The schedule (D1 table `schedule`,
 * written by the daily generator) is the authority; a date the schedule
 * answers with no entry falls back to the bundled deck rotation, so a day is
 * never blank. Only a successful lookup may choose the deck: when the
 * schedule cannot be read, this throws `ScheduleUnavailable` and routes answer
 * 503, so no player is ever handed a different puzzle #N than everyone else.
 *
 * Outside Workers (next dev, vitest) with no D1 binding, the schedule is read
 * from content/schedule/<date>.json (the generator's file store), and only
 * outside production and staging.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { dailyPuzzle, dateForNumber, puzzleNumber } from "./daily";
import { DECK, getPuzzle } from "./deck";
import { parsePuzzle } from "./puzzleSchema";
import { runtimeEnvironment } from "./runtime";
import type { DailyPayload } from "./schedule";
import { cloudBindings, type D1Like } from "./store";
import type { Puzzle } from "./types";

const SCHEDULE_DIR = join(process.cwd(), "content", "schedule");

async function scheduleDb(): Promise<D1Like | null> {
  return (await cloudBindings())?.LIMINAL_DB ?? null;
}

/** The schedule could not be read; callers must not substitute the deck. */
export class ScheduleUnavailable extends Error {
  constructor() {
    super("schedule store is not bound");
    this.name = "ScheduleUnavailable";
  }
}

function devFilesAllowed(): boolean {
  const environment = runtimeEnvironment(process.env.LIMINAL_ENVIRONMENT);
  return environment !== "production" && environment !== "staging";
}

async function fileEntry(date: string): Promise<Puzzle | null> {
  if (!devFilesAllowed()) return null;
  try {
    const raw: unknown = JSON.parse(await readFile(join(SCHEDULE_DIR, `${date}.json`), "utf8"));
    const puzzle = raw && typeof raw === "object" ? Reflect.get(raw, "puzzle") : null;
    return parsePuzzle(puzzle, `schedule/${date}.json`);
  } catch {
    return null;
  }
}

/** The scheduled puzzle for a date, or null when the schedule has none. */
async function scheduledOn(date: string): Promise<Puzzle | null> {
  const db = await scheduleDb();
  if (!db) {
    if (!devFilesAllowed()) throw new ScheduleUnavailable();
    return fileEntry(date);
  }
  const row = await db
    .prepare("SELECT puzzle_json FROM schedule WHERE date = ?")
    .bind(date)
    .first<{ puzzle_json: string }>();
  return row ? parsePuzzle(JSON.parse(row.puzzle_json), `schedule:${date}`) : null;
}

/** The day's puzzle: the schedule when published, else the bundled rotation. */
export async function puzzleForDate(date: string): Promise<DailyPayload> {
  const scheduled = await scheduledOn(date);
  return { date, number: puzzleNumber(date), puzzle: scheduled ?? dailyPuzzle(date, DECK) };
}

export async function puzzleForNumber(number: number): Promise<DailyPayload> {
  return puzzleForDate(dateForNumber(number));
}

/** Any published puzzle by id: the bundled deck first, then the schedule. */
export async function puzzleById(id: string): Promise<Puzzle | undefined> {
  const bundled = getPuzzle(id);
  if (bundled) return bundled;
  const db = await scheduleDb();
  if (db) {
    const row = await db
      .prepare("SELECT puzzle_json FROM schedule WHERE puzzle_id = ?")
      .bind(id)
      .first<{ puzzle_json: string }>();
    return row ? parsePuzzle(JSON.parse(row.puzzle_json), `schedule:${id}`) : undefined;
  }
  if (!devFilesAllowed()) throw new ScheduleUnavailable();
  try {
    for (const file of await readdir(SCHEDULE_DIR)) {
      if (!file.endsWith(".json")) continue;
      const puzzle = await fileEntry(file.replace(/\.json$/, ""));
      if (puzzle?.id === id) return puzzle;
    }
  } catch {
    // No local schedule directory: nothing scheduled.
  }
  return undefined;
}

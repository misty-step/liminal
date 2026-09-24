import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dateForNumber, dateKeyUTC, puzzleNumber } from "../../src/lib/liminal/daily";
import { parsePuzzle } from "../../src/lib/liminal/puzzleSchema";
import type { ScheduleEntry } from "../../src/lib/liminal/schedule";
import type { Puzzle } from "../../src/lib/liminal/types";

export interface ScheduleStore {
  list(from: string, to: string): Promise<ScheduleEntry[]>;
  publishedPuzzles(): Promise<Puzzle[]>;
  insert(entry: ScheduleEntry): Promise<void>;
}

/**
 * A UTC date that has begun is already being played from the deck fallback, so
 * scheduling it would swap the puzzle mid-day. Only future dates publish; the
 * D1 trigger `schedule_future_only` enforces the same rule for every writer.
 */
export function assertFutureDate(date: string, now: Date): void {
  if (date <= dateKeyUTC(now)) {
    throw new Error(`schedule refused: ${date} has already begun (UTC)`);
  }
}

/** The dates a nightly run may fill: tomorrow through `buffer` days ahead. */
export function publishWindow(now: Date, buffer: number): string[] {
  const today = puzzleNumber(dateKeyUTC(now));
  return Array.from({ length: buffer }, (_, index) => dateForNumber(today + 1 + index));
}

function parseEntry(value: unknown, source: string): ScheduleEntry {
  if (!value || typeof value !== "object") throw new Error(`${source}: invalid schedule entry`);
  const entry = value as ScheduleEntry;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    !Number.isSafeInteger(entry.number) ||
    entry.number < 1 ||
    !["generator", "manual"].includes(entry.source) ||
    typeof entry.createdAt !== "string"
  )
    throw new Error(`${source}: invalid schedule metadata`);
  return { ...entry, puzzle: parsePuzzle(entry.puzzle, source) };
}

export class FileScheduleStore implements ScheduleStore {
  constructor(
    readonly directory = join(process.cwd(), "content/schedule"),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async publishedPuzzles(): Promise<Puzzle[]> {
    return (await this.all()).map((entry) => entry.puzzle);
  }

  async list(from: string, to: string): Promise<ScheduleEntry[]> {
    return (await this.all()).filter((entry) => entry.date >= from && entry.date <= to);
  }

  private async all(): Promise<ScheduleEntry[]> {
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
        .map(async (file) =>
          parseEntry(JSON.parse(await readFile(join(this.directory, file), "utf8")), file),
        ),
    );
  }

  async insert(entry: ScheduleEntry): Promise<void> {
    const parsed = parseEntry(entry, "insert");
    assertFutureDate(parsed.date, this.now());
    const all = await this.all();
    if (
      all.some(
        (prior) =>
          prior.date === parsed.date ||
          prior.number === parsed.number ||
          prior.puzzle.id === parsed.puzzle.id,
      )
    )
      throw new Error(`schedule conflict: ${parsed.date} #${parsed.number} ${parsed.puzzle.id}`);
    await mkdir(this.directory, { recursive: true });
    // wx guarantees a concurrent writer cannot overwrite the same date.
    await writeFile(
      join(this.directory, `${parsed.date}.json`),
      `${JSON.stringify(parsed, null, 2)}\n`,
      { flag: "wx" },
    );
  }
}

interface D1Response {
  success: boolean;
  errors?: { message: string }[];
  result?: { results?: Record<string, unknown>[] }[];
}

export class D1HttpScheduleStore implements ScheduleStore {
  private readonly endpoint: string;
  constructor(
    env: Record<string, string | undefined> = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    const account = env.CLOUDFLARE_ACCOUNT_ID;
    const token = env.CLOUDFLARE_API_TOKEN;
    const database = env.LIMINAL_D1_DATABASE_ID;
    if (!account || !token || !database)
      throw new Error(
        "D1 store requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and LIMINAL_D1_DATABASE_ID",
      );
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
    this.token = token;
  }
  private readonly token: string;

  private async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    if (!response.ok) throw new Error(`D1 query failed: HTTP ${response.status}`);
    const body = (await response.json()) as D1Response;
    if (
      !body.success ||
      !body.result ||
      body.result.length !== 1 ||
      !Array.isArray(body.result[0].results)
    )
      throw new Error(
        `D1 query failed: ${body.errors?.map((e) => e.message).join("; ") || "malformed response"}`,
      );
    return body.result[0].results;
  }

  private row(row: Record<string, unknown>): ScheduleEntry {
    return parseEntry(
      {
        date: row.date,
        number: row.number,
        puzzle: JSON.parse(String(row.puzzle_json)),
        source: row.source,
        createdAt: row.created_at,
      },
      "D1 schedule",
    );
  }

  async list(from: string, to: string): Promise<ScheduleEntry[]> {
    return (
      await this.query(
        "SELECT date, number, puzzle_json, source, created_at FROM schedule WHERE date >= ? AND date <= ? ORDER BY date",
        [from, to],
      )
    ).map((row) => this.row(row));
  }

  async publishedPuzzles(): Promise<Puzzle[]> {
    return (await this.query("SELECT puzzle_json FROM schedule ORDER BY date")).map((row) =>
      parsePuzzle(JSON.parse(String(row.puzzle_json)), "D1 schedule"),
    );
  }

  async insert(entry: ScheduleEntry): Promise<void> {
    const parsed = parseEntry(entry, "insert");
    assertFutureDate(parsed.date, this.now());
    await this.query(
      "INSERT INTO schedule (date, number, puzzle_id, puzzle_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        parsed.date,
        parsed.number,
        parsed.puzzle.id,
        JSON.stringify(parsed.puzzle),
        parsed.source,
        parsed.createdAt,
      ],
    );
  }
}

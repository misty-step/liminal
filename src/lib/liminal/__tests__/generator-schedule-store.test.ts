import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  D1HttpScheduleStore,
  FileScheduleStore,
  publishWindow,
} from "../../../../scripts/generator/schedule-store";
import { DECK } from "../deck";
import type { ScheduleEntry } from "../schedule";

const entry: ScheduleEntry = {
  date: "2026-09-23",
  number: 1,
  puzzle: DECK[0],
  source: "generator",
  createdAt: "2026-09-23T05:17:00.000Z",
};
// Publishing happens the night before: the entry's date must still be ahead.
const nightBefore = () => new Date("2026-09-22T05:17:00.000Z");
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("FileScheduleStore", () => {
  it("writes one parseable ScheduleEntry and refuses duplicate date, number, and puzzle ID", async () => {
    const dir = await mkdtemp(join(tmpdir(), "liminal-schedule-"));
    directories.push(dir);
    const store = new FileScheduleStore(dir, nightBefore);
    await store.insert(entry);
    expect(JSON.parse(await readFile(join(dir, `${entry.date}.json`), "utf8"))).toEqual(entry);
    expect(await store.list(entry.date, entry.date)).toEqual([entry]);
    expect((await store.publishedPuzzles()).map((p) => p.id)).toEqual([entry.puzzle.id]);
    await expect(store.insert({ ...entry, number: 2, puzzle: DECK[1] })).rejects.toThrow(
      "schedule conflict",
    );
    await expect(store.insert({ ...entry, date: "2026-09-24", puzzle: DECK[1] })).rejects.toThrow(
      "schedule conflict",
    );
    await expect(store.insert({ ...entry, date: "2026-09-24", number: 2 })).rejects.toThrow(
      "schedule conflict",
    );
  });
});

describe("D1HttpScheduleStore", () => {
  it("uses parameterized SELECT and plain INSERT, parsing returned puzzles", async () => {
    const requests: { url: string; sql: string; params: unknown[]; authorization: string }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const { sql, params } = JSON.parse(String(init?.body));
      requests.push({
        url: String(url),
        sql,
        params,
        authorization: String((init?.headers as Record<string, string> | undefined)?.authorization),
      });
      const results = sql.startsWith("SELECT")
        ? [
            {
              date: entry.date,
              number: entry.number,
              puzzle_json: JSON.stringify(entry.puzzle),
              source: entry.source,
              created_at: entry.createdAt,
            },
          ]
        : [];
      return new Response(JSON.stringify({ success: true, result: [{ results }] }), {
        status: 200,
      });
    }) as typeof fetch;
    const store = new D1HttpScheduleStore(
      {
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_API_TOKEN: "token",
        LIMINAL_D1_DATABASE_ID: "database",
      },
      fetchImpl,
      nightBefore,
    );
    expect(await store.list(entry.date, entry.date)).toEqual([entry]);
    expect((await store.publishedPuzzles())[0].id).toBe(entry.puzzle.id);
    await store.insert(entry);
    expect(requests[0]).toMatchObject({
      url: "https://api.cloudflare.com/client/v4/accounts/account/d1/database/database/query",
      params: [entry.date, entry.date],
      authorization: "Bearer token",
    });
    expect(requests[2].sql).toBe(
      "INSERT INTO schedule (date, number, puzzle_id, puzzle_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    expect(requests[2].params).toEqual([
      entry.date,
      entry.number,
      entry.puzzle.id,
      JSON.stringify(entry.puzzle),
      entry.source,
      entry.createdAt,
    ]);
  });

  it("fails closed on Cloudflare failure and missing credentials", async () => {
    expect(() => new D1HttpScheduleStore({})).toThrow("requires");
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, errors: [{ message: "denied" }] }), {
          status: 200,
        }),
    ) as typeof fetch;
    const store = new D1HttpScheduleStore(
      { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "b", LIMINAL_D1_DATABASE_ID: "c" },
      fetchImpl,
      nightBefore,
    );
    await expect(store.insert(entry)).rejects.toThrow("denied");
  });
});

// A date that has begun is being played from the deck fallback. Scheduling it
// would swap puzzle #N mid-day, so every layer refuses it.
describe("the mid-day swap cutoff (US-005, US-008)", () => {
  it("the nightly window starts tomorrow, however late today is", () => {
    expect(publishWindow(new Date("2026-09-23T00:00:00.000Z"), 3)).toEqual([
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
    expect(publishWindow(new Date("2026-09-23T23:59:59.999Z"), 1)).toEqual(["2026-09-24"]);
    expect(publishWindow(new Date("2026-09-24T00:00:00.000Z"), 1)).toEqual(["2026-09-25"]);
  });

  it("stores refuse today and past dates before writing anything", async () => {
    const dir = await mkdtemp(join(tmpdir(), "liminal-schedule-"));
    directories.push(dir);
    const late = () => new Date("2026-09-23T23:59:00.000Z");
    const file = new FileScheduleStore(dir, late);
    await expect(file.insert(entry)).rejects.toThrow("has already begun");
    await expect(file.insert({ ...entry, date: "2026-09-22", number: 5 })).rejects.toThrow(
      "has already begun",
    );
    expect(await file.list("2026-09-01", "2026-09-30")).toEqual([]);
    await file.insert({ ...entry, date: "2026-09-24", number: 2 });

    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const d1 = new D1HttpScheduleStore(
      { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "b", LIMINAL_D1_DATABASE_ID: "c" },
      fetchImpl,
      late,
    );
    await expect(d1.insert(entry)).rejects.toThrow("has already begun");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the D1 trigger refuses any writer scheduling a date that has begun", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(join(process.cwd(), "migrations/0003_schedule.sql"), "utf8"));
    const insert = (dateSql: string, number: number, id: string) =>
      db
        .prepare(
          `INSERT INTO schedule (date, number, puzzle_id, puzzle_json, source) VALUES (${dateSql}, ?, ?, '{}', 'manual')`,
        )
        .run(number, id);
    expect(() => insert("date('now')", 1, "today")).toThrow("only future dates");
    expect(() => insert("date('now', '-1 day')", 2, "yesterday")).toThrow("only future dates");
    insert("date('now', '+1 day')", 3, "tomorrow");
    expect(db.prepare("SELECT puzzle_id FROM schedule").all()).toEqual([{ puzzle_id: "tomorrow" }]);
  });

  it("the D1 trigger refuses unpublishing a date that has begun, not a future one", () => {
    const db = new DatabaseSync(":memory:");
    const migration = (name: string) =>
      db.exec(readFileSync(join(process.cwd(), "migrations", name), "utf8"));
    migration("0003_schedule.sql");
    // Seed a row that aired today, as the fallback-free past would hold.
    db.exec("DROP TRIGGER schedule_future_only");
    db.exec(`INSERT INTO schedule (date, number, puzzle_id, puzzle_json, source) VALUES
      (date('now'), 1, 'today', '{}', 'manual'),
      (date('now', '+1 day'), 2, 'tomorrow', '{}', 'manual')`);
    migration("0003_schedule.sql");
    migration("0004_schedule_started_immutable.sql");
    expect(() => db.exec("DELETE FROM schedule WHERE puzzle_id = 'today'")).toThrow(
      "cannot be unpublished",
    );
    db.exec("DELETE FROM schedule WHERE puzzle_id = 'tomorrow'");
    expect(db.prepare("SELECT puzzle_id FROM schedule").all()).toEqual([{ puzzle_id: "today" }]);
  });
});

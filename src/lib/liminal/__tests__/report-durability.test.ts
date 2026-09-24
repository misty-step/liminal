import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Like } from "../store";

// A real SQLite database with every production migration applied, standing in
// for the Worker's D1 binding. Nothing here touches the production database.
const binding = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { LIMINAL_DB: binding.db } }),
}));

import { POST as postReport } from "@/app/api/report/route";

function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

function asD1(db: DatabaseSync): D1Like {
  return {
    prepare(query) {
      let values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          values = bound;
          return statement;
        },
        async first<T>() {
          return (db.prepare(query).get(...(values as [])) ?? null) as T | null;
        },
        async run() {
          return db.prepare(query).run(...(values as []));
        },
      };
      return statement;
    },
  };
}

const report = (ip: string, note: string) =>
  postReport(
    new Request("https://liminal.test/api/report", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({ puzzleId: "bath-vessel", answer: "sink", note }),
    }),
  );

const previousEnvironment = process.env.LIMINAL_ENVIRONMENT;
let db: DatabaseSync;
beforeEach(() => {
  process.env.LIMINAL_ENVIRONMENT = "production";
  db = migratedDatabase();
  binding.db = asD1(db);
});
afterEach(() => {
  if (previousEnvironment === undefined) delete process.env.LIMINAL_ENVIRONMENT;
  else process.env.LIMINAL_ENVIRONMENT = previousEnvironment;
});

describe("disagreement reports in production (US-004)", () => {
  it("stores a report in the migrated D1 schema and confirms it", async () => {
    const response = await report("198.51.100.1", "sink is not a vessel here");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(db.prepare("SELECT puzzle_id, answer, note FROM reports").all()).toEqual([
      { puzzle_id: "bath-vessel", answer: "sink", note: "sink is not a vessel here" },
    ]);
  });

  it("says the report was not sent when the store rejects it", async () => {
    db.exec("DROP TABLE reports");
    const response = await report("198.51.100.2", "lost");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "storage-failed" });
  });
});

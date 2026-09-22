import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const analyticsSql = readFileSync(
  new URL("../../../../queries/production-product-events-summary.sql", import.meta.url),
  "utf8",
);

const fixtureSessionIds = [
  "session_485a72b53d2c44c682e8af86eda6ced1",
  "session_01cb1a22031a4732a13c86d3ee6041a5",
  "session_f21f5ec5647043ad95ba54c6801db8de",
  "session_a0643db4b79842eab5c976bb66d9e067",
  "session_4bfa784cfbdf4601af8194436f7107b5",
  "session_c46e2092560843af9e72b14000f49400",
] as const;

describe("production product-event analytics", () => {
  it("excludes every exact fixture session, retains a near-match, and preserves rows", () => {
    using db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE product_events (
        event_id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        environment TEXT NOT NULL,
        session_id TEXT NOT NULL
      );
    `);
    const insert = db.prepare(`
      INSERT INTO product_events (
        event_id,
        event_name,
        environment,
        session_id
      ) VALUES (?, 'puzzle_open', ?, ?)
    `);
    for (const [index, sessionId] of fixtureSessionIds.entries()) {
      insert.run(`fixture-${index}`, "production", sessionId);
    }
    insert.run("genuine-near-match", "production", `${fixtureSessionIds.at(-1)}_genuine_control`);
    insert.run("staging-control", "staging", fixtureSessionIds[0]);

    expect(db.prepare(analyticsSql).all()).toEqual([
      {
        record_type: "summary",
        event_name: null,
        event_count: null,
        sampled_events: 7,
        fixture_events_excluded: 6,
        genuine_events_retained: 1,
      },
      {
        record_type: "event_count",
        event_name: "puzzle_open",
        event_count: 1,
        sampled_events: null,
        fixture_events_excluded: null,
        genuine_events_retained: null,
      },
    ]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM product_events").get()).toEqual({ count: 8 });
  });
});

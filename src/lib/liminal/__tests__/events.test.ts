import { describe, expect, it } from "vitest";
import type { ProductEvent } from "../runtime";
import type { D1Like } from "../store";
import { d1ProductEventStore } from "../store";

function eventFixture(): ProductEvent {
  return {
    event_id: "00000000-0000-4000-8000-000000000001",
    event_name: "guess_judged",
    game: "liminal",
    environment: "test",
    occurred_at: "2026-09-21T12:00:00.000Z",
    session_id: "session_0123456789abcdef",
    actor_id: null,
    schema_version: 1,
    props: { puzzle_id: "bath-vessel", result: "close", source: "authored" },
  };
}

describe("D1 product event store", () => {
  it("persists the versioned privacy-safe envelope", async () => {
    const calls: { query: string; values: unknown[] }[] = [];
    const db: D1Like = {
      prepare(query) {
        let values: unknown[] = [];
        return {
          bind(...next) {
            values = next;
            return this;
          },
          async first<T>() {
            return null as T | null;
          },
          async run() {
            calls.push({ query, values });
            return {};
          },
        };
      },
    };

    await d1ProductEventStore(db).append(eventFixture());

    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("INSERT OR IGNORE INTO product_events");
    expect(calls[0].values.slice(0, 8)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "guess_judged",
      "liminal",
      "test",
      "2026-09-21T12:00:00.000Z",
      "session_0123456789abcdef",
      null,
      1,
    ]);
    expect(JSON.parse(String(calls[0].values[8]))).toEqual({
      puzzle_id: "bath-vessel",
      result: "close",
      source: "authored",
    });
    expect(String(calls[0].values[8])).not.toContain("answer");
  });
});

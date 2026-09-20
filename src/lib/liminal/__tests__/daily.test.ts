import { describe, expect, it } from "vitest";
import { DECK } from "../deck";
import { dailyPuzzle, dailyPuzzleIndex, dateKeyUTC, dayNumber } from "../daily";

describe("daily rotation", () => {
  it("keys dates in UTC", () => {
    expect(dateKeyUTC(new Date("2026-09-20T23:59:59Z"))).toBe("2026-09-20");
    expect(dateKeyUTC(new Date("2026-09-21T00:00:01Z"))).toBe("2026-09-21");
  });

  it("computes stable day numbers", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("2026-09-20") - dayNumber("2026-09-19")).toBe(1);
  });

  it("is deterministic for a given date", () => {
    const a = dailyPuzzle("2026-09-20", DECK);
    const b = dailyPuzzle("2026-09-20", DECK);
    expect(a.id).toBe(b.id);
  });

  it("rotates through the deck across consecutive days", () => {
    const ids = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"].map(
      (key) => dailyPuzzle(key, DECK).id,
    );
    expect(new Set(ids).size).toBe(DECK.length);
  });

  it("wraps cleanly and never returns a negative index", () => {
    const index = dailyPuzzleIndex("1969-12-31", DECK.length);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(DECK.length);
  });
});

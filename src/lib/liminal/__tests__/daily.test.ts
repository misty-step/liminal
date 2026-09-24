import { describe, expect, it } from "vitest";
import {
  dailyPuzzle,
  dailyPuzzleIndex,
  dateForNumber,
  dateKeyUTC,
  dayNumber,
  FALLBACK_ROTATION,
} from "../daily";
import { DECK } from "../deck";

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

  // Past fallback dates are recomputed on every archive request, so the dates
  // players have already seen must keep their puzzle forever.
  it("keeps launch fallback assignments", () => {
    expect(dailyPuzzle(dateForNumber(1), DECK).id).toBe("shell-water-eat");
    expect(dailyPuzzle(dateForNumber(2), DECK).id).toBe("wheels-motor-ride");
  });

  it("an appended deck puzzle leaves every fallback date unchanged", () => {
    const grown = [...DECK, { ...DECK[0], id: "appended-later" }];
    for (let number = 1; number <= 90; number++) {
      const date = dateForNumber(number);
      expect(dailyPuzzle(date, grown).id).toBe(dailyPuzzle(date, DECK).id);
    }
  });

  it("names only bundled puzzles and visits each once per cycle", () => {
    const ids = FALLBACK_ROTATION.map((_, day) => dailyPuzzle(dateForNumber(day + 1), DECK).id);
    expect(new Set(ids).size).toBe(FALLBACK_ROTATION.length);
    expect(() => dailyPuzzle(dateForNumber(1), [])).toThrow("missing puzzle");
  });

  it("wraps cleanly and never returns a negative index", () => {
    const index = dailyPuzzleIndex("1969-12-31");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(FALLBACK_ROTATION.length);
  });
});

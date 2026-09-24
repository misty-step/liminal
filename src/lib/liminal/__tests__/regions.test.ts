import { describe, expect, it } from "vitest";
import { boardState, formatClock, landingOf } from "../regions";
import type { ConditionState } from "../types";

const s = (c1: ConditionState, c2: ConditionState, c3: ConditionState) => ({
  states: { c1, c2, c3 },
});
const CENTER = s("inside", "inside", "inside");
const NOT_C3 = s("inside", "inside", "outside");
const NOT_C2 = s("inside", "outside", "inside");
const NOT_C1 = s("outside", "inside", "inside");
const SINGLE = s("inside", "outside", "outside");
const NOWHERE = s("outside", "outside", "outside");
const ON_LINE = s("inside", "inside", "close");

describe("landingOf (US-001)", () => {
  it("names the target a clean landing fills", () => {
    expect(landingOf(CENTER.states)).toEqual({ kind: "target", key: "center" });
    expect(landingOf(NOT_C3.states)).toEqual({ kind: "target", key: "c3" });
    expect(landingOf(NOT_C2.states)).toEqual({ kind: "target", key: "c2" });
    expect(landingOf(NOT_C1.states)).toEqual({ kind: "target", key: "c1" });
  });

  it("fills nothing from one circle, no circle, or any line", () => {
    expect(landingOf(SINGLE.states).kind).toBe("single");
    expect(landingOf(NOWHERE.states).kind).toBe("outside");
    expect(landingOf(ON_LINE.states).kind).toBe("line");
    expect(landingOf(s("close", "close", "close").states).kind).toBe("line");
  });
});

describe("boardState (US-001)", () => {
  it("lets the first clean landing fill a region and keeps it", () => {
    const board = boardState([NOT_C3, NOT_C3, CENTER]);
    expect(board.fills).toEqual({ c3: 0, center: 2 });
    expect(board.filledCount).toBe(2);
    expect(board.complete).toBe(false);
  });

  it("completes when all four regions are filled, in any order", () => {
    const board = boardState([CENTER, NOWHERE, NOT_C1, ON_LINE, NOT_C2, NOT_C3]);
    expect(board.complete).toBe(true);
  });

  it("never ends on guess count alone", () => {
    const many = Array.from({ length: 40 }, () => NOWHERE);
    expect(boardState([...many, NOT_C3, NOT_C2, NOT_C1]).complete).toBe(false);
    expect(boardState([...many, NOT_C3, NOT_C2, NOT_C1, CENTER]).complete).toBe(true);
  });
});

describe("formatClock", () => {
  it("shows m:ss, then h:mm:ss past an hour, and never negative", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(59_999)).toBe("0:59");
    expect(formatClock(84_000)).toBe("1:24");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatClock(-5)).toBe("0:00");
  });
});

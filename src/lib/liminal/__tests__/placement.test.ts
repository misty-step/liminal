import { describe, expect, it } from "vitest";
import { CIRCLES, placeWords, RADIUS } from "../placement";
import { CONDITION_IDS } from "../regions";
import type { ConditionId, ConditionState } from "../types";

const STATES: ConditionState[] = ["inside", "close", "outside"];
const combos = STATES.flatMap((c1) =>
  STATES.flatMap((c2) =>
    STATES.map((c3) => ({ c1, c2, c3 }) as Record<ConditionId, ConditionState>),
  ),
);

function inTrueRegion(p: { x: number; y: number }, states: Record<ConditionId, ConditionState>) {
  return CONDITION_IDS.every((id) => {
    const d = Math.hypot(p.x - CIRCLES[id].x, p.y - CIRCLES[id].y) - RADIUS;
    if (states[id] === "inside") return d < 0;
    if (states[id] === "outside") return d > 0;
    return Math.abs(d) < 1.5;
  });
}

describe("placeWords", () => {
  it("puts every verdict in its true region, or flags it inexact", () => {
    for (const states of combos) {
      const [spot] = placeWords([{ states, width: 12 }], 6);
      if (spot.exact) expect(inTrueRegion(spot, states), JSON.stringify(states)).toBe(true);
    }
  });

  it("flags on-the-line-everywhere as inexact: no point lies on all three lines", () => {
    const [spot] = placeWords(
      [{ states: { c1: "close", c2: "close", c3: "close" }, width: 12 }],
      6,
    );
    expect(spot.exact).toBe(false);
  });

  it("places every clean single-word verdict exactly", () => {
    for (const states of combos.filter((s) => !Object.values(s).includes("close"))) {
      expect(placeWords([{ states, width: 10 }], 6)[0].exact, JSON.stringify(states)).toBe(true);
    }
  });

  it("keeps two words in the same region from overlapping", () => {
    const states: Record<ConditionId, ConditionState> = {
      c1: "inside",
      c2: "outside",
      c3: "outside",
    };
    const [a, b] = placeWords(
      [
        { states, width: 14 },
        { states, width: 14 },
      ],
      6,
    );
    const overlapX = Math.abs(a.x - b.x) < 14;
    const overlapY = Math.abs(a.y - b.y) < 6;
    expect(overlapX && overlapY).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getPuzzle } from "../deck";
import { evaluateGuess } from "../evaluator";
import {
  canGuess,
  emptyProgress,
  parseProgress,
  recordGuess,
  storageKey,
} from "../storage";

const vessel = getPuzzle("bath-vessel")!;
const nearMissFeedback = evaluateGuess(vessel, "shampoo bottle");
const winFeedback = evaluateGuess(vessel, "sink");
const unknownFeedback = evaluateGuess(vessel, "sundial");

describe("progress storage", () => {
  it("uses a versioned key", () => {
    expect(storageKey("bath-vessel")).toBe("liminal.v1.puzzle.bath-vessel");
  });

  it("round-trips valid progress and rejects corrupt data", () => {
    const progress = recordGuess(emptyProgress("bath-vessel", 1), nearMissFeedback, "shampoo bottle", 2);
    const parsed = parseProgress(JSON.stringify(progress), "bath-vessel");
    expect(parsed?.guesses).toHaveLength(1);
    expect(parseProgress("{not json", "bath-vessel")).toBeNull();
    expect(parseProgress(JSON.stringify(progress), "kitchen-well")).toBeNull();
    expect(parseProgress(JSON.stringify({ schemaVersion: 9 }), "bath-vessel")).toBeNull();
  });

  it("never records an unjudged or rejected guess", () => {
    const progress = emptyProgress("bath-vessel", 1);
    expect(recordGuess(progress, unknownFeedback, "sundial", 2)).toBe(progress);
    expect(recordGuess(progress, evaluateGuess(vessel, "   "), "   ", 3)).toBe(progress);
  });

  it("caps guesses at five and records the win", () => {
    let progress = emptyProgress("bath-vessel", 1);
    for (let i = 0; i < 4; i += 1) {
      progress = recordGuess(progress, nearMissFeedback, `shampoo bottle ${i}`, 10 + i);
    }
    expect(progress.guesses).toHaveLength(4);
    expect(canGuess(progress)).toBe(true);

    const win = recordGuess(progress, winFeedback, "sink", 100);
    expect(win.solved).toBe(true);
    expect(win.solvedAnswer).toBe("sink");
    expect(win.guesses).toHaveLength(5);
    expect(canGuess(win)).toBe(false);
    expect(recordGuess(win, winFeedback, "toilet", 101).guesses).toHaveLength(5);
  });

  it("refuses a sixth guess after the cap", () => {
    let progress = emptyProgress("bath-vessel", 1);
    for (let i = 0; i < 5; i += 1) {
      progress = recordGuess(progress, nearMissFeedback, `shampoo bottle ${i}`, 10 + i);
    }
    expect(progress.guesses).toHaveLength(5);
    expect(canGuess(progress)).toBe(false);
    const afterCap = recordGuess(progress, winFeedback, "sink", 99);
    expect(afterCap.guesses).toHaveLength(5);
    expect(afterCap.solved).toBe(false);
  });

  it("collects concepts the player discovered", () => {
    let progress = emptyProgress("bath-vessel", 1);
    progress = recordGuess(progress, nearMissFeedback, "shampoo bottle", 2);
    expect(progress.collected).toEqual(["shampoo bottle"]);
    progress = recordGuess(progress, winFeedback, "sink", 3);
    expect(progress.collected).toEqual(["shampoo bottle", "sink"]);
    progress = recordGuess(progress, winFeedback, "sink", 4);
    expect(progress.collected).toEqual(["shampoo bottle", "sink"]);
  });
});

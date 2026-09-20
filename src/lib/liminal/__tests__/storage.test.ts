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

const relic = getPuzzle("pocket-relic")!;
const nearMissFeedback = evaluateGuess(relic, "nail");
const winFeedback = evaluateGuess(relic, "pebble");
const unknownFeedback = evaluateGuess(relic, "sundial");

describe("progress storage", () => {
  it("uses a versioned key", () => {
    expect(storageKey("pocket-relic")).toBe("liminal.v1.puzzle.pocket-relic");
  });

  it("round-trips valid progress and rejects corrupt data", () => {
    const progress = recordGuess(emptyProgress("pocket-relic", 1), nearMissFeedback, "nail", 2);
    const parsed = parseProgress(JSON.stringify(progress), "pocket-relic");
    expect(parsed?.guesses).toHaveLength(1);
    expect(parseProgress("{not json", "pocket-relic")).toBeNull();
    expect(parseProgress(JSON.stringify(progress), "kitchen-well")).toBeNull();
    expect(parseProgress(JSON.stringify({ schemaVersion: 9 }), "pocket-relic")).toBeNull();
  });

  it("never records an unjudged or rejected guess", () => {
    const progress = emptyProgress("pocket-relic", 1);
    expect(recordGuess(progress, unknownFeedback, "sundial", 2)).toBe(progress);
    expect(recordGuess(progress, evaluateGuess(relic, "   "), "   ", 3)).toBe(progress);
  });

  it("caps guesses at five and records the win", () => {
    let progress = emptyProgress("pocket-relic", 1);
    for (let i = 0; i < 4; i += 1) {
      progress = recordGuess(progress, nearMissFeedback, `nail ${i}`, 10 + i);
    }
    expect(progress.guesses).toHaveLength(4);
    expect(canGuess(progress)).toBe(true);

    const win = recordGuess(progress, winFeedback, "pebble", 100);
    expect(win.solved).toBe(true);
    expect(win.solvedAnswer).toBe("pebble");
    expect(win.guesses).toHaveLength(5);
    expect(canGuess(win)).toBe(false);
    expect(recordGuess(win, winFeedback, "coin", 101).guesses).toHaveLength(5);
  });

  it("refuses a sixth guess after the cap", () => {
    let progress = emptyProgress("pocket-relic", 1);
    for (let i = 0; i < 5; i += 1) {
      progress = recordGuess(progress, nearMissFeedback, `nail ${i}`, 10 + i);
    }
    expect(progress.guesses).toHaveLength(5);
    expect(canGuess(progress)).toBe(false);
    const afterCap = recordGuess(progress, winFeedback, "pebble", 99);
    expect(afterCap.guesses).toHaveLength(5);
    expect(afterCap.solved).toBe(false);
  });

  it("collects concepts the player discovered", () => {
    let progress = emptyProgress("pocket-relic", 1);
    progress = recordGuess(progress, nearMissFeedback, "nail", 2);
    expect(progress.collected).toEqual(["nail"]);
    progress = recordGuess(progress, winFeedback, "pebble", 3);
    expect(progress.collected).toEqual(["nail", "pebble"]);
    progress = recordGuess(progress, winFeedback, "pebble", 4);
    expect(progress.collected).toEqual(["nail", "pebble"]);
  });
});

import { describe, expect, it } from "vitest";
import { getPuzzle } from "../deck";
import { evaluateGuess, judgedFeedback } from "../evaluator";
import { canGuess, emptyProgress, parseProgress, recordGuess, storageKey } from "../storage";

const vessel = getPuzzle("bath-vessel")!;
const miss = judgedFeedback({ c1: "outside", c2: "outside", c3: "outside" }, "judged", "v");

describe("progress storage (US-001, US-002, US-003)", () => {
  it("uses a versioned key that ignores five-guess v1 progress", () => {
    expect(storageKey("bath-vessel")).toBe("liminal.v2.puzzle.bath-vessel");
    const v1 = {
      schemaVersion: 1,
      puzzleId: "bath-vessel",
      guesses: [],
      solved: false,
      collected: [],
    };
    expect(parseProgress(JSON.stringify(v1), "bath-vessel")).toBeNull();
  });

  it("round-trips valid progress and rejects corrupt or foreign data", () => {
    const progress = recordGuess(
      emptyProgress("bath-vessel", 1),
      evaluateGuess(vessel, "faucet"),
      "faucet",
      2,
    );
    expect(parseProgress(JSON.stringify(progress), "bath-vessel")).toEqual(progress);
    expect(parseProgress("{not json", "bath-vessel")).toBeNull();
    expect(parseProgress(JSON.stringify(progress), "shell-water-eat")).toBeNull();
    const broken = { ...progress, guesses: [{ answer: "faucet", states: { c1: "inside" } }] };
    expect(parseProgress(JSON.stringify(broken), "bath-vessel")).toBeNull();
  });

  it("never records an unjudged or refused guess", () => {
    const progress = emptyProgress("bath-vessel", 1);
    expect(recordGuess(progress, evaluateGuess(vessel, "sundial"), "sundial", 2)).toBe(progress);
    expect(recordGuess(progress, evaluateGuess(vessel, "   "), "   ", 3)).toBe(progress);
    const placed = recordGuess(progress, evaluateGuess(vessel, "tap"), "tap", 4);
    expect(recordGuess(placed, evaluateGuess(vessel, "tap", ["tap"]), "tap", 5)).toBe(placed);
  });

  it("spends a guess on a confident miss (invented-input policy)", () => {
    const next = recordGuess(emptyProgress("bath-vessel", 1), miss, "zorblax", 2);
    expect(next.guesses).toHaveLength(1);
  });

  it("stops taking guesses once all four regions are filled", () => {
    let progress = emptyProgress("bath-vessel", 1);
    for (const answer of ["faucet", "baby bath", "kitchen sink"]) {
      progress = recordGuess(progress, evaluateGuess(vessel, answer), answer, 2);
    }
    expect(canGuess(progress)).toBe(true);
    progress = recordGuess(progress, evaluateGuess(vessel, "sink"), "sink", 3);
    expect(canGuess(progress)).toBe(false);
    expect(recordGuess(progress, miss, "rock", 4).guesses).toHaveLength(4);
  });

  it("takes any number of guesses until the board is complete", () => {
    let progress = emptyProgress("bath-vessel", 1);
    for (let i = 0; i < 30; i += 1) progress = recordGuess(progress, miss, `rock ${i}`, i);
    expect(canGuess(progress)).toBe(true);
    expect(progress.guesses).toHaveLength(30);
  });

  it("keeps saved clock time and treats missing or bad time as zero", () => {
    const saved = { ...emptyProgress("bath-vessel", 1), elapsedMs: 84_000 };
    expect(parseProgress(JSON.stringify(saved), "bath-vessel")?.elapsedMs).toBe(84_000);
    const { elapsedMs: _drop, ...older } = saved;
    expect(parseProgress(JSON.stringify(older), "bath-vessel")?.elapsedMs).toBe(0);
    const negative = { ...saved, elapsedMs: -3 };
    expect(parseProgress(JSON.stringify(negative), "bath-vessel")?.elapsedMs).toBe(0);
  });
});

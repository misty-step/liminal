import { describe, expect, it } from "vitest";
import { getPuzzle } from "../deck";
import { evaluateGuess, guessesRemaining, isSolved, judgedFeedback } from "../evaluator";
import { normalizeAnswer } from "../normalize";

const relic = getPuzzle("pocket-relic")!;
const measures = getPuzzle("hidden-measures")!;

describe("normalizeAnswer", () => {
  it("normalizes case, articles, punctuation, and whitespace", () => {
    expect(normalizeAnswer("  A Glass SHARD ")).toBe("glass shard");
    expect(normalizeAnswer("The Coin.")).toBe("coin");
    expect(normalizeAnswer("wheel-barrow")).toBe("wheel-barrow");
  });
});

describe("evaluateGuess", () => {
  it("accepts verified answers as full wins", () => {
    const feedback = evaluateGuess(relic, "Coin");
    expect(feedback.solved).toBe(true);
    expect(feedback.states).toEqual({ c1: "inside", c2: "inside", c3: "inside" });
    expect(feedback.source).toBe("authored");
  });

  it("marks the failed condition close on tested near misses", () => {
    const feedback = evaluateGuess(relic, "glass shard");
    expect(feedback.solved).toBe(false);
    expect(feedback.states).toEqual({ c1: "inside", c2: "inside", c3: "close" });
  });

  it("rejects guesses that repeat the clues", () => {
    const feedback = evaluateGuess(relic, "Worn smooth by time or handling — not sharp, not rough");
    expect(feedback.rejected).toBe("echo");
    expect(Object.values(feedback.states).every((s) => s === "outside")).toBe(true);
  });

  it("rejects empty and oversized guesses", () => {
    expect(evaluateGuess(relic, "   ").rejected).toBe("empty");
    expect(evaluateGuess(relic, "x".repeat(200)).rejected).toBe("too-long");
  });

  it("flags unknown answers for the semantic service without scoring them", () => {
    const feedback = evaluateGuess(measures, "sundial");
    expect(feedback.needsJudgment).toBe(true);
    expect(feedback.solved).toBe(false);
    expect(Object.values(feedback.states).every((s) => s === "outside")).toBe(true);
  });
});

describe("judgedFeedback and helpers", () => {
  it("derives solved from judged states", () => {
    const win = judgedFeedback(relic, { c1: "inside", c2: "inside", c3: "inside" }, "judged", "v1");
    expect(win.solved).toBe(true);
    const miss = judgedFeedback(relic, { c1: "inside", c2: "close", c3: "inside" }, "judged", "v1");
    expect(miss.solved).toBe(false);
  });

  it("counts remaining guesses", () => {
    expect(guessesRemaining(0)).toBe(5);
    expect(guessesRemaining(4)).toBe(1);
    expect(guessesRemaining(5)).toBe(0);
    expect(guessesRemaining(9)).toBe(0);
  });

  it("treats only all-inside states as solved", () => {
    expect(isSolved({ c1: "inside", c2: "inside" })).toBe(true);
    expect(isSolved({ c1: "inside", c2: "close" })).toBe(false);
    expect(isSolved({})).toBe(true);
  });
});

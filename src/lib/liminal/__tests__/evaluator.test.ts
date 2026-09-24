import { describe, expect, it } from "vitest";
import { getPuzzle } from "../deck";
import { evaluateGuess } from "../evaluator";
import { normalizeAnswer } from "../normalize";

const vessel = getPuzzle("bath-vessel")!;
const headFoot = getPuzzle("head-and-foot")!;

describe("normalizeAnswer", () => {
  it("normalizes case, articles, punctuation, and whitespace", () => {
    expect(normalizeAnswer("  A Glass SHARD ")).toBe("glass shard");
    expect(normalizeAnswer("The Sink.")).toBe("sink");
    expect(normalizeAnswer("wash-basin")).toBe("wash-basin");
  });
});

describe("evaluateGuess", () => {
  it("places center answers inside every circle", () => {
    const feedback = evaluateGuess(vessel, "The Sink");
    expect(feedback.states).toEqual({ c1: "inside", c2: "inside", c3: "inside" });
    expect(feedback.source).toBe("authored");
    expect(feedback.needsJudgment).toBeUndefined();
  });

  it("places pair answers outside exactly the circle their region excludes", () => {
    expect(evaluateGuess(vessel, "faucet").states).toEqual({
      c1: "inside",
      c2: "inside",
      c3: "outside",
    });
    expect(evaluateGuess(vessel, "baby bath").states).toEqual({
      c1: "inside",
      c2: "outside",
      c3: "inside",
    });
    expect(evaluateGuess(vessel, "kitchen sink").states).toEqual({
      c1: "outside",
      c2: "inside",
      c3: "inside",
    });
  });

  it("refuses circle labels and their clarifiers", () => {
    expect(evaluateGuess(vessel, "Holds a pool of water").rejected).toBe("echo");
    expect(evaluateGuess(headFoot, "or a part called one").rejected).toBe("echo");
  });

  it("refuses a word already on the board, after normalization", () => {
    expect(evaluateGuess(vessel, "the Faucet", ["faucet"]).rejected).toBe("repeat");
    expect(evaluateGuess(vessel, "tap", ["faucet"]).rejected).toBeUndefined();
  });

  it("refuses empty and oversized guesses", () => {
    expect(evaluateGuess(vessel, "   ").rejected).toBe("empty");
    expect(evaluateGuess(vessel, "x".repeat(200)).rejected).toBe("too-long");
  });

  it("sends unknown answers to the semantic service without scoring them", () => {
    const feedback = evaluateGuess(vessel, "sundial");
    expect(feedback.needsJudgment).toBe(true);
    expect(feedback.rejected).toBeUndefined();
  });
});

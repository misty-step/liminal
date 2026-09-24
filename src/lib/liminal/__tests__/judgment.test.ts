import { describe, expect, it } from "vitest";
import { getPuzzle } from "../deck";
import {
  buildQuestions,
  CHOICE_KEYS,
  DEFAULT_MODEL,
  JUDGE_PROMPT_VERSION,
  judgeEnabledFor,
  judgmentKey,
  stateFromChoiceProbabilities,
  stateFromNoul,
} from "../judgment";

const vessel = getPuzzle("bath-vessel")!;

describe("judgment mapping", () => {
  it("maps legacy noul probabilities to decision bands, not intensities", () => {
    expect(stateFromNoul(0.95)).toBe("inside");
    expect(stateFromNoul(0.65)).toBe("inside");
    expect(stateFromNoul(0.64)).toBe("close");
    expect(stateFromNoul(0.35)).toBe("close");
    expect(stateFromNoul(0.34)).toBe("outside");
    expect(stateFromNoul(0.0)).toBe("outside");
    expect(stateFromNoul(Number.NaN)).toBe("outside");
  });

  it("bands Choice scores at the same thresholds as Noul", () => {
    expect(stateFromChoiceProbabilities({ yes: 0.65, partly: 0, no: 0.35 })).toBe("inside");
    expect(stateFromChoiceProbabilities({ yes: 0.649, partly: 0, no: 0.351 })).toBe("close");
    expect(stateFromChoiceProbabilities({ yes: 0.35, partly: 0, no: 0.65 })).toBe("close");
    expect(stateFromChoiceProbabilities({ yes: 0.349, partly: 0, no: 0.651 })).toBe("outside");
  });

  it("counts partly as half a yes", () => {
    expect(stateFromChoiceProbabilities({ yes: 0.4, partly: 0.5, no: 0.1 })).toBe("inside");
    expect(stateFromChoiceProbabilities({ yes: 0.2, partly: 0.3, no: 0.5 })).toBe("close");
    expect(stateFromChoiceProbabilities({ yes: 0.19, partly: 0.3, no: 0.51 })).toBe("outside");
  });

  it("rejects missing, nonnumeric, nonfinite, and out-of-range Choice probabilities", () => {
    expect(stateFromChoiceProbabilities({ yes: 0.7, partly: 0.2 })).toBeNull();
    expect(stateFromChoiceProbabilities({ yes: "0.7", partly: 0.2, no: 0.1 })).toBeNull();
    expect(stateFromChoiceProbabilities({ yes: 0.7, partly: Infinity, no: 0.1 })).toBeNull();
    expect(stateFromChoiceProbabilities({ yes: 0.7, partly: 0.2, no: -0.1 })).toBeNull();
  });

  it("builds one authored Choice question per launch-deck condition", () => {
    const questions = buildQuestions(vessel);
    expect(Object.keys(questions)).toEqual(vessel.conditions.map((c) => c.id));
    for (const question of Object.values(questions)) {
      if (question.type !== "choice") {
        throw new Error(`expected a choice question, got ${question.type}`);
      }
      expect(question.instructions.length).toBeGreaterThan(10);
      for (const key of CHOICE_KEYS) {
        expect(question.criteria[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("keys cache entries on puzzle, condition, answer, model, and prompt version", () => {
    const key = judgmentKey({
      puzzleId: "bath-vessel",
      conditionId: "c1",
      answer: "urinal",
      model: DEFAULT_MODEL,
    });
    expect(key).toBe(`bath-vessel|c1|urinal|${DEFAULT_MODEL}|${JUDGE_PROMPT_VERSION}`);
    const other = judgmentKey({
      puzzleId: "bath-vessel",
      conditionId: "c1",
      answer: "urinal",
      model: "jev-1.13",
    });
    expect(other).not.toBe(key);
  });

  it("refuses uncalibrated puzzles unless explicitly allowed", () => {
    const uncalibrated = { ...vessel, judgeStatus: "uncalibrated" as const };
    expect(judgeEnabledFor(uncalibrated, {})).toBe(false);
    expect(judgeEnabledFor(uncalibrated, { JEV_ALLOW_UNCALIBRATED: "0" })).toBe(false);
    expect(judgeEnabledFor(uncalibrated, { JEV_ALLOW_UNCALIBRATED: "1" })).toBe(true);
    expect(judgeEnabledFor({ ...vessel, judgeStatus: "calibrated" }, {})).toBe(true);
  });
});

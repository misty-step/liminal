import { describe, expect, it } from "vitest";
import { getPuzzle } from "../deck";
import {
  CHOICE_CONFIDENCE_FLOOR,
  CHOICE_KEYS,
  DEFAULT_MODEL,
  JUDGE_PROMPT_VERSION,
  buildQuestions,
  judgeEnabledFor,
  judgmentKey,
  stateFromChoice,
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

  it("maps descriptive choice levels to feedback states and rejects unknown keys", () => {
    expect(stateFromChoice("yes")).toBe("inside");
    expect(stateFromChoice("partly")).toBe("close");
    expect(stateFromChoice("no")).toBe("outside");
    expect(stateFromChoice("maybe")).toBeNull();
  });

  it("keeps the uncertainty floor inside (0, 1) and away from the state mapping", () => {
    expect(CHOICE_CONFIDENCE_FLOOR).toBeGreaterThan(0);
    expect(CHOICE_CONFIDENCE_FLOOR).toBeLessThan(1);
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

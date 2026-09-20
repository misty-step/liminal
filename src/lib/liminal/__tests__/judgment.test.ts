import { describe, expect, it } from "vitest";
import { getPuzzle } from "../deck";
import {
  DEFAULT_MODEL,
  JUDGE_PROMPT_VERSION,
  buildQuestions,
  judgmentKey,
  stateFromNoul,
} from "../judgment";

const relic = getPuzzle("pocket-relic")!;

describe("judgment mapping", () => {
  it("maps probabilities to decision bands, not intensities", () => {
    expect(stateFromNoul(0.95)).toBe("inside");
    expect(stateFromNoul(0.65)).toBe("inside");
    expect(stateFromNoul(0.64)).toBe("close");
    expect(stateFromNoul(0.35)).toBe("close");
    expect(stateFromNoul(0.34)).toBe("outside");
    expect(stateFromNoul(0.0)).toBe("outside");
    expect(stateFromNoul(Number.NaN)).toBe("outside");
  });

  it("builds one authored Noul question per condition", () => {
    const questions = buildQuestions(relic);
    expect(Object.keys(questions)).toEqual(relic.conditions.map((c) => c.id));
    for (const question of Object.values(questions)) {
      expect(question.type).toBe("noul");
      expect(question.instructions.length).toBeGreaterThan(10);
      expect(question.criteria.true.length).toBeGreaterThan(0);
      expect(question.criteria.false.length).toBeGreaterThan(0);
    }
  });

  it("keys cache entries on puzzle, condition, answer, model, and prompt version", () => {
    const key = judgmentKey({
      puzzleId: "pocket-relic",
      conditionId: "c1",
      answer: "sundial",
      model: DEFAULT_MODEL,
    });
    expect(key).toBe(`pocket-relic|c1|sundial|${DEFAULT_MODEL}|${JUDGE_PROMPT_VERSION}`);
    const other = judgmentKey({
      puzzleId: "pocket-relic",
      conditionId: "c1",
      answer: "sundial",
      model: "jev-1.13",
    });
    expect(other).not.toBe(key);
  });
});

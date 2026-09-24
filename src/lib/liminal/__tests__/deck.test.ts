import { describe, expect, it } from "vitest";
import { DECK, DECK_VERSION, getPuzzle } from "../deck";
import { echoTexts, evaluateGuess } from "../evaluator";
import { normalizeAnswer } from "../normalize";
import { landingOf, TARGETS } from "../regions";

describe("in-between deck", () => {
  it("ships distinct puzzles with versions and explicit calibration status", () => {
    expect(DECK.length).toBeGreaterThanOrEqual(4);
    expect(new Set(DECK.map((p) => p.id)).size).toBe(DECK.length);
    expect(DECK_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    for (const puzzle of DECK) {
      expect(puzzle.judgments.version.length).toBeGreaterThan(0);
      expect(["calibrated", "uncalibrated"]).toContain(puzzle.judgeStatus);
      expect(puzzle.conditions.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    }
  });

  for (const puzzle of DECK) {
    const regionOf = (target: (typeof TARGETS)[number]) =>
      target === "center" ? puzzle.judgments.center : puzzle.judgments.pairs[target];

    describe(`${puzzle.id} (${puzzle.mode})`, () => {
      it("gives every region several verified answers and a held-out answer", () => {
        for (const target of TARGETS) {
          const region = regionOf(target);
          expect(region.answers.length, target).toBeGreaterThanOrEqual(target === "center" ? 3 : 2);
          expect(region.heldOut.length, target).toBeGreaterThanOrEqual(1);
        }
      });

      it("places every authored answer in the region it is filed under", () => {
        for (const target of TARGETS) {
          for (const answer of regionOf(target).answers) {
            expect(landingOf(evaluateGuess(puzzle, answer).states), answer).toEqual({
              kind: "target",
              key: target,
            });
          }
        }
      });

      it("files each answer once across the whole puzzle", () => {
        const all = TARGETS.flatMap((t) => [...regionOf(t).answers, ...regionOf(t).heldOut]).map(
          normalizeAnswer,
        );
        expect(new Set(all).size).toBe(all.length);
      });

      it("keeps held-out answers off the authored path", () => {
        for (const target of TARGETS) {
          for (const held of regionOf(target).heldOut) {
            expect(evaluateGuess(puzzle, held).needsJudgment, held).toBe(true);
          }
        }
      });

      it("keeps circle labels out of the answers", () => {
        const labels = new Set(echoTexts(puzzle));
        for (const target of TARGETS) {
          for (const answer of regionOf(target).answers) {
            expect(labels.has(normalizeAnswer(answer)), answer).toBe(false);
          }
        }
      });
    });
  }

  it("exposes puzzles by id", () => {
    expect(getPuzzle("head-and-foot")?.mode).toBe("wordplay");
    expect(getPuzzle("bath-vessel")?.mode).toBe("literal");
    expect(getPuzzle("nope")).toBeUndefined();
  });
});

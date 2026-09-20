import { describe, expect, it } from "vitest";
import { DECK, DECK_VERSION, getPuzzle } from "../deck";
import { evaluateGuess } from "../evaluator";
import { normalizeAnswer } from "../normalize";

describe("launch deck", () => {
  it("ships four puzzles with stable ids and versions", () => {
    expect(DECK.length).toBeGreaterThanOrEqual(4);
    expect(new Set(DECK.map((p) => p.id)).size).toBe(DECK.length);
    for (const puzzle of DECK) {
      expect(puzzle.judgments.version.length).toBeGreaterThan(0);
      expect(puzzle.conditions.length).toBeGreaterThanOrEqual(3);
    }
    expect(DECK_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  for (const puzzle of DECK) {
    describe(`${puzzle.id} (${puzzle.mode})`, () => {
      it("has several verified answers that win outright", () => {
        expect(puzzle.judgments.answers.length).toBeGreaterThanOrEqual(3);
        for (const answer of puzzle.judgments.answers) {
          const feedback = evaluateGuess(puzzle, answer);
          expect(feedback.solved, `${answer} should solve ${puzzle.id}`).toBe(true);
          expect(Object.values(feedback.states).every((s) => s === "inside")).toBe(true);
          expect(feedback.needsJudgment).toBeUndefined();
        }
      });

      it("keeps accepted answers distinct after normalization", () => {
        const normalized = puzzle.judgments.answers.map(normalizeAnswer);
        expect(new Set(normalized).size).toBe(normalized.length);
      });

      it("has near misses that fail exactly one condition", () => {
        expect(puzzle.judgments.nearMisses.length).toBeGreaterThanOrEqual(3);
        for (const nearMiss of puzzle.judgments.nearMisses) {
          expect(
            puzzle.conditions.some((c) => c.id === nearMiss.fails),
            `${nearMiss.answer} must fail a real condition id`,
          ).toBe(true);
          const feedback = evaluateGuess(puzzle, nearMiss.answer);
          expect(feedback.solved, `${nearMiss.answer} must not win`).toBe(false);
          expect(feedback.needsJudgment, `${nearMiss.answer} must be known`).toBeUndefined();
          for (const condition of puzzle.conditions) {
            const state = feedback.states[condition.id];
            if (condition.id === nearMiss.fails) {
              expect(state, `${nearMiss.answer} should be close on ${condition.id}`).toBe("close");
            } else {
              expect(state, `${nearMiss.answer} should be inside on ${condition.id}`).toBe("inside");
            }
          }
        }
      });

      it("never accepts a near miss as a win or a win as a near miss", () => {
        const answerSet = new Set(puzzle.judgments.answers.map(normalizeAnswer));
        for (const nearMiss of puzzle.judgments.nearMisses) {
          expect(answerSet.has(normalizeAnswer(nearMiss.answer))).toBe(false);
        }
      });

      it("keeps clue text out of the answer lists", () => {
        const clueTexts = new Set(
          [puzzle.title, puzzle.drawer, puzzle.teaser, ...puzzle.conditions.map((c) => c.text)].map(
            normalizeAnswer,
          ),
        );
        for (const answer of [
          ...puzzle.judgments.answers,
          ...puzzle.judgments.nearMisses.map((n) => n.answer),
        ]) {
          expect(clueTexts.has(normalizeAnswer(answer)), `${answer} repeats a clue`).toBe(false);
        }
      });
    });
  }

  it("exposes puzzles by id", () => {
    expect(getPuzzle("hidden-measures")?.mode).toBe("wordplay");
    expect(getPuzzle("pocket-relic")?.mode).toBe("literal");
    expect(getPuzzle("nope")).toBeUndefined();
  });
});

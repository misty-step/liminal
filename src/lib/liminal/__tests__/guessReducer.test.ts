import { describe, expect, it } from "vitest";
import { DECK } from "../deck";
import { evaluateGuess } from "../evaluator";
import type { GuessEvent } from "../guessReducer";
import { guessTransition, reduceGuess } from "../guessReducer";
import { boardState } from "../regions";
import { emptyProgress, recordGuess } from "../storage";
import type { ConditionState, PuzzleProgress } from "../types";

const puzzle = DECK[0];
const initial = emptyProgress(puzzle.id, 10);
function event(answer: string, at = 20): GuessEvent {
  return { kind: "feedback-received", answer, at, feedback: evaluateGuess(puzzle, answer) };
}
const answers = [
  puzzle.judgments.center.answers[0],
  ...Object.values(puzzle.judgments.pairs).map((r) => r.answers[0]),
];

describe("guess reducer", () => {
  it("replays a complete board without mutating its input or losing folded thinking time", () => {
    const start = { ...initial, elapsedMs: 1234 };
    const snapshot = structuredClone(start);
    const end = answers.reduce(
      (state, answer, i) => reduceGuess(state, event(answer, 20 + i)),
      start,
    );
    expect(start).toEqual(snapshot);
    expect(end.elapsedMs).toBe(1234);
    expect(end.updatedAt).toBe(23);
    expect(end.guesses.map((g) => g.answer)).toEqual(answers);
    expect(boardState(end.guesses).complete).toBe(true);
    expect(reduceGuess(end, event("late answer"))).toBe(end);
  });

  it("spends nothing for refused or unresolved feedback", () => {
    for (const answer of [
      "",
      puzzle.conditions[0].text,
      "x".repeat(121),
      "unlisted novel answer",
    ]) {
      expect(reduceGuess(initial, event(answer))).toBe(initial);
    }
    const first = reduceGuess(initial, event(answers[0]));
    const repeat = {
      ...event(answers[0]),
      feedback: evaluateGuess(puzzle, answers[0], [answers[0]]),
    };
    expect(guessTransition(first, repeat)).toBe("refused");
    expect(reduceGuess(first, repeat)).toBe(first);
  });

  it("spends a guess in an occupied region but preserves the first fill", () => {
    const first = reduceGuess(initial, event(answers[0]));
    const another = event(puzzle.judgments.center.answers[1]);
    expect(guessTransition(first, another)).toBe("already-filled");
    const next = reduceGuess(first, another);
    expect(next.guesses).toHaveLength(2);
    expect(boardState(next.guesses)).toEqual({
      fills: { center: 0 },
      filledCount: 1,
      complete: false,
    });
  });

  it.each<[ConditionState, ConditionState, ConditionState, string]>([
    ["inside", "close", "inside", "line"],
    ["inside", "outside", "outside", "single"],
    ["outside", "outside", "outside", "outside"],
  ])("spends a guess for %s/%s/%s without filling a region", (c1, c2, c3, reason) => {
    const received: GuessEvent = {
      ...event("judged word"),
      feedback: { states: { c1, c2, c3 }, source: "judged", judgmentVersion: "test" },
    };
    expect(guessTransition(initial, received)).toBe(reason);
    const next = reduceGuess(initial, received);
    expect(next.guesses).toHaveLength(1);
    expect(next.guesses[0].source).toBe("judged");
    expect(boardState(next.guesses).filledCount).toBe(0);
  });

  it("composes with the existing storage consumer at an explicit timestamp", () => {
    const received = event(answers[0], 200);
    expect(recordGuess(initial, received.feedback, received.answer, received.at)).toEqual(
      reduceGuess(initial, received),
    );
  });
});

import { recording } from "../../../../docs/reducer/recording";

it("replays every recorded browser attempt to the observed daily-game result", () => {
  let state: PuzzleProgress = recording.initial;
  recording.events.forEach((received, i) => {
    state = reduceGuess(state, received);
    expect(state.guesses).toHaveLength(recording.observed[i].guesses);
    expect(boardState(state.guesses).filledCount).toBe(recording.observed[i].filled);
  });
  expect(boardState(state.guesses).complete).toBe(true);
  expect(state.guesses.map((guess) => guess.answer)).toEqual(
    recording.events
      .filter((received) => !received.feedback.rejected)
      .map((received) => received.answer),
  );
});

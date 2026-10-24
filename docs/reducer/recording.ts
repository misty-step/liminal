// Recorded by scripts/reducer/record.ts; authored puzzle answers only.
import type { GuessEvent } from "../../src/lib/liminal/guessReducer";
import type { PuzzleProgress } from "../../src/lib/liminal/types";

export const recording = {
  date: "2026-10-22",
  number: 30,
  puzzleId: "backyard-bark-climb",
  labels: ["Found in backyards", "Has fur", "Can climb trees"],
  revision: "3d2e23128a4eb61a20366916be6f231df3077c03",
  capturedAt: "2026-10-22T19:37:54.387Z",
  provenance:
    "Read-only browser capture of a production-mode Worker; real browser form submissions. Accepted feedback is read from saved records; refusal feedback is reconstructed with the production evaluator and checked against unchanged saved guesses. Clock folding is outside this replay.",
  initial: {
    schemaVersion: 2,
    puzzleId: "backyard-bark-climb",
    guesses: [],
    elapsedMs: 0,
    updatedAt: 0,
  },
  events: [
    {
      kind: "feedback-received",
      answer: "Found in backyards",
      at: 1792697873602,
      feedback: {
        source: "authored",
        judgmentVersion: "2026-10-15.1",
        states: {
          c1: "outside",
          c2: "outside",
          c3: "outside",
        },
        rejected: "echo",
      },
    },
    {
      kind: "feedback-received",
      answer: "squirrel",
      at: 1792697873653,
      feedback: {
        states: {
          c1: "inside",
          c2: "inside",
          c3: "inside",
        },
        source: "authored",
        judgmentVersion: "2026-10-15.1",
      },
    },
    {
      kind: "feedback-received",
      answer: "squirrel",
      at: 1792697873746,
      feedback: {
        source: "authored",
        judgmentVersion: "2026-10-15.1",
        states: {
          c1: "outside",
          c2: "outside",
          c3: "outside",
        },
        rejected: "repeat",
      },
    },
    {
      kind: "feedback-received",
      answer: "raccoon",
      at: 1792697873787,
      feedback: {
        states: {
          c1: "inside",
          c2: "inside",
          c3: "inside",
        },
        source: "authored",
        judgmentVersion: "2026-10-15.1",
      },
    },
    {
      kind: "feedback-received",
      answer: "monkey",
      at: 1792697873871,
      feedback: {
        states: {
          c1: "outside",
          c2: "inside",
          c3: "inside",
        },
        source: "authored",
        judgmentVersion: "2026-10-15.1",
      },
    },
    {
      kind: "feedback-received",
      answer: "lizard",
      at: 1792697873987,
      feedback: {
        states: {
          c1: "inside",
          c2: "outside",
          c3: "inside",
        },
        source: "authored",
        judgmentVersion: "2026-10-15.1",
      },
    },
    {
      kind: "feedback-received",
      answer: "rabbit",
      at: 1792697874105,
      feedback: {
        states: {
          c1: "inside",
          c2: "inside",
          c3: "outside",
        },
        source: "authored",
        judgmentVersion: "2026-10-15.1",
      },
    },
  ],
  observed: [
    {
      answer: "Found in backyards",
      status: "That repeats a circle. Name a thing instead.",
      guesses: 0,
      filled: 0,
    },
    {
      answer: "squirrel",
      status: "“squirrel” fills the center. 1 of 4.",
      guesses: 1,
      filled: 1,
    },
    {
      answer: "squirrel",
      status: "“squirrel” is already on the board.",
      guesses: 1,
      filled: 1,
    },
    {
      answer: "raccoon",
      status: "“raccoon” fits a place you already filled.",
      guesses: 2,
      filled: 1,
    },
    {
      answer: "monkey",
      status: "“monkey” fills a gap. 2 of 4.",
      guesses: 3,
      filled: 2,
    },
    {
      answer: "lizard",
      status: "“lizard” fills a gap. 3 of 4.",
      guesses: 4,
      filled: 3,
    },
    {
      answer: "rabbit",
      status: "",
      guesses: 5,
      filled: 4,
    },
  ],
} satisfies {
  date: unknown;
  number: unknown;
  puzzleId: string;
  labels: string[];
  revision: unknown;
  capturedAt: string;
  provenance: string;
  initial: PuzzleProgress;
  events: GuessEvent[];
  observed: { answer: string; status: string; guesses: number; filled: number }[];
};

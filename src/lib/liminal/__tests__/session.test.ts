import { describe, expect, it } from "vitest";
import {
  clockRunning,
  keyboardOpenForViewport,
  responseSpendsGuess,
  type ClockState,
} from "../session";

const THINKING: ClockState = {
  ready: true,
  complete: false,
  pending: false,
  howtoOpen: false,
  visible: true,
};

describe("clockRunning (US-003)", () => {
  it.each([
    ["the judge is pending", { pending: true }],
    ["the how-to is open", { howtoOpen: true }],
    ["the tab is hidden", { visible: false }],
  ] satisfies ReadonlyArray<[string, Partial<ClockState>]>)(
    "pauses while %s and resumes afterward",
    (_, hold) => {
      expect(clockRunning(THINKING)).toBe(true);
      expect(clockRunning({ ...THINKING, ...hold })).toBe(false);
      expect(clockRunning(THINKING)).toBe(true);
    },
  );
});

describe("responseSpendsGuess (US-002)", () => {
  it.each([
    ["an outage", { ok: false, status: undefined, states: null }],
    ["a rate limit", { ok: false, status: "unavailable", states: null }],
    ["the calibration gate", { ok: false, status: "unavailable", states: null }],
  ])("%s spends nothing", (_, response) => {
    expect(responseSpendsGuess(response)).toBe(false);
  });

  it("spends one only after a verdict has parsed", () => {
    expect(
      responseSpendsGuess({
        ok: true,
        status: "judged",
        states: { c1: "inside", c2: "close", c3: "outside" },
      }),
    ).toBe(true);
    expect(responseSpendsGuess({ ok: true, status: "judged", states: null })).toBe(false);
  });
});

describe("keyboardOpenForViewport (US-009)", () => {
  it("follows the narrow coarse-pointer viewport predicate", () => {
    expect(keyboardOpenForViewport({ width: 600, coarsePointer: true })).toBe(true);
    expect(keyboardOpenForViewport({ width: 601, coarsePointer: true })).toBe(false);
    expect(keyboardOpenForViewport({ width: 390, coarsePointer: false })).toBe(false);
  });
});

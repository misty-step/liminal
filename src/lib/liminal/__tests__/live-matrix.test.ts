import { describe, expect, it, vi } from "vitest";
import { buildMatrixSummary, judgeMatrixCase } from "../../../../scripts/live-matrix";
import { DECK, DECK_VERSION } from "../deck";
import { JUDGE_PROMPT_VERSION, type JudgeResult } from "../judgment";

const judged: JudgeResult = {
  status: "judged",
  states: { c1: "inside", c2: "inside", c3: "inside" },
  model: "test-model",
  judgmentVersion: "test-version",
};

describe("live matrix evidence (US-008)", () => {
  it("records the deck, every puzzle judgment, and prompt version", () => {
    const summary = buildMatrixSummary({
      at: "2026-10-04T14:50:00Z",
      model: "test-model",
      url: "https://example.test",
      rows: [],
    });

    expect(summary.deckVersion).toBe(DECK_VERSION);
    expect(summary.judgmentVersions).toEqual(
      Object.fromEntries(DECK.map((puzzle) => [puzzle.id, puzzle.judgments.version])),
    );
    expect(summary.promptVersion).toBe(JUDGE_PROMPT_VERSION);
  });

  it.each(["not-configured", "invalid-response"] as const)(
    "does not overwrite a %s protocol failure with a later success",
    async (reason) => {
      let calls = 0;
      const judge = vi.fn(async (): Promise<JudgeResult> => {
        calls += 1;
        return calls === 1 ? { status: "unavailable", reason } : judged;
      });
      const waitForRetry = vi.fn(async () => {});

      await expect(judgeMatrixCase(judge, waitForRetry)).resolves.toEqual({
        result: { status: "unavailable", reason },
        attempts: 1,
      });
      expect(judge).toHaveBeenCalledTimes(1);
      expect(waitForRetry).not.toHaveBeenCalled();
    },
  );

  it("still retries a transport failure", async () => {
    let calls = 0;
    const judge = vi.fn(async (): Promise<JudgeResult> => {
      calls += 1;
      return calls === 1 ? { status: "unavailable", reason: "timeout" } : judged;
    });
    const waitForRetry = vi.fn(async () => {});

    await expect(judgeMatrixCase(judge, waitForRetry)).resolves.toEqual({
      result: judged,
      attempts: 2,
    });
    expect(waitForRetry).toHaveBeenCalledWith(1500);
  });
});

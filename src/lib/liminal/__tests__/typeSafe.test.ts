import { describe, expect, it, vi } from "vitest";
import { getPuzzle } from "../deck";
import { JUDGE_PROMPT_VERSION } from "../judgment";
import { judgeAnswer, judgeEnvFrom, memoryCache } from "../typeSafe";

const vessel = getPuzzle("bath-vessel")!;

function okResponse(
  cells: Record<
    string,
    {
      choice?: string;
      noul?: number;
      confidence?: number;
      probabilities?: Record<string, unknown>;
    }
  >,
) {
  return {
    ok: true,
    json: async () => ({
      answers: Object.fromEntries(
        Object.entries(cells).map(([id, cell]) => [id, { type: "choice", ...cell }]),
      ),
    }),
  } as unknown as Response;
}

const env = {
  url: "https://example.test/decisions",
  apiKey: "test-key",
  model: "typesafe/jev-1.13",
};

describe("judgeEnvFrom", () => {
  it("prefers TypeSafe native, falls back to OpenRouter, else null", () => {
    const native = judgeEnvFrom({ TYPESAFE_API_KEY: "a" });
    expect(native?.url).toContain("api.typesafe.ai");
    const or = judgeEnvFrom({ OPENROUTER_API_KEY: "b" });
    expect(or?.url).toContain("openrouter.ai");
    expect(or?.model).toBe("typesafe/jev-1.13");
    expect(judgeEnvFrom({})).toBeNull();
  });
});

describe("judgeAnswer", () => {
  it("is unavailable without credentials and consumes nothing", async () => {
    const result = await judgeAnswer({
      puzzle: vessel,
      answer: "urinal",
      env: null,
      cache: memoryCache(),
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toBe("not-configured");
  });

  it("judges one Choice per condition with the answer as state data", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("typesafe/jev-1.13");
      expect(body.state.answer).toBe("urinal");
      expect(Object.keys(body.questions)).toEqual(["c1", "c2", "c3"]);
      for (const question of Object.values(body.questions) as {
        type: string;
        criteria: Record<string, string>;
      }[]) {
        expect(question.type).toBe("choice");
        expect(Object.keys(question.criteria).sort()).toEqual(["no", "partly", "yes"]);
      }
      return okResponse({
        c1: {
          choice: "yes",
          confidence: 0.9,
          probabilities: { yes: 0.9, partly: 0.08, no: 0.02 },
        },
        c2: {
          choice: "partly",
          confidence: 0.8,
          probabilities: { yes: 0.35, partly: 0.5, no: 0.15 },
        },
        c3: {
          choice: "no",
          confidence: 0.95,
          probabilities: { yes: 0.05, partly: 0.05, no: 0.9 },
        },
      });
    }) as unknown as typeof fetch;

    const result = await judgeAnswer({
      puzzle: vessel,
      answer: "Urinal",
      env,
      cache: memoryCache(),
      fetchImpl,
    });
    expect(result.status).toBe("judged");
    if (result.status === "judged") {
      expect(result.states).toEqual({ c1: "inside", c2: "close", c3: "outside" });
      expect(result.confidences).toEqual({ c1: 0.9, c2: 0.8, c3: 0.95 });
      expect(result.judgmentVersion).toContain("typesafe/jev-1.13");
    }
  });

  it("judges and caches a low-confidence Choice from its probabilities", async () => {
    const cache = memoryCache();
    const fetchImpl = vi.fn(async () =>
      okResponse({
        c1: {
          choice: "yes",
          confidence: 0.3,
          probabilities: { yes: 0.6, partly: 0.35, no: 0.05 },
        },
        c2: {
          choice: "partly",
          confidence: 0.35,
          probabilities: { yes: 0.4, partly: 0.5, no: 0.1 },
        },
        c3: {
          choice: "no",
          confidence: 0.9,
          probabilities: { yes: 0.19, partly: 0.3, no: 0.51 },
        },
      }),
    ) as unknown as typeof fetch;
    const first = await judgeAnswer({
      puzzle: vessel,
      answer: "urinal",
      env,
      cache,
      fetchImpl,
    });
    expect(first.status).toBe("judged");
    if (first.status === "judged") {
      expect(first.states).toEqual({ c1: "inside", c2: "inside", c3: "outside" });
      expect(first.confidences).toEqual({ c1: 0.3, c2: 0.35, c3: 0.9 });
    }
    const firstStates = first.status === "judged" ? first.states : null;
    const second = await judgeAnswer({ puzzle: vessel, answer: "urinal", env, cache, fetchImpl });
    expect(second.status === "judged" ? second.states : null).toEqual(firstStates);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("serves repeats from cache instead of rerolling", async () => {
    const cache = memoryCache();
    const fetchImpl = vi.fn(async () =>
      okResponse({
        c1: { choice: "yes", confidence: 0.9, probabilities: { yes: 0.9, partly: 0.1, no: 0 } },
        c2: { choice: "yes", confidence: 0.9, probabilities: { yes: 0.9, partly: 0.1, no: 0 } },
        c3: { choice: "yes", confidence: 0.9, probabilities: { yes: 0.9, partly: 0.1, no: 0 } },
      }),
    ) as unknown as typeof fetch;
    const first = await judgeAnswer({ puzzle: vessel, answer: "urinal", env, cache, fetchImpl });
    const second = await judgeAnswer({ puzzle: vessel, answer: "urinal", env, cache, fetchImpl });
    expect(first.status).toBe("judged");
    expect(second.status).toBe("judged");
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
  });

  it("reports honest failures for timeouts, upstream errors, and bad payloads", async () => {
    const aborting = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;
    const timedOut = await judgeAnswer({
      puzzle: vessel,
      answer: "urinal",
      env,
      cache: memoryCache(),
      fetchImpl: aborting,
    });
    expect(timedOut).toEqual({ status: "unavailable", reason: "timeout" });

    const failing = vi.fn(
      async () => ({ ok: false, status: 429 }) as unknown as Response,
    ) as unknown as typeof fetch;
    const errored = await judgeAnswer({
      puzzle: vessel,
      answer: "urinal",
      env,
      cache: memoryCache(),
      fetchImpl: failing,
    });
    expect(errored).toEqual({ status: "unavailable", reason: "upstream-error" });

    const malformed = vi.fn(
      async () => ({ ok: true, json: async () => ({}) }) as unknown as Response,
    ) as unknown as typeof fetch;
    const invalid = await judgeAnswer({
      puzzle: vessel,
      answer: "urinal",
      env,
      cache: memoryCache(),
      fetchImpl: malformed,
    });
    expect(invalid).toEqual({ status: "unavailable", reason: "invalid-response" });
  });

  it("never writes partial judgments to cache on failure", async () => {
    const cache = memoryCache();
    const fetchImpl = vi.fn(
      async () =>
        okResponse({
          c1: {
            choice: "yes",
            confidence: 0.9,
            probabilities: { yes: 0.9, partly: 0.1, no: 0 },
          },
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    const result = await judgeAnswer({ puzzle: vessel, answer: "urinal", env, cache, fetchImpl });
    expect(result.status).toBe("unavailable");
    expect(
      cache.get(`bath-vessel|c1|urinal|typesafe/jev-1.13|${JUDGE_PROMPT_VERSION}`),
    ).toBeUndefined();
  });

  it.each([
    ["missing probabilities", { choice: "yes", confidence: 0.9 }],
    [
      "malformed probabilities",
      { choice: "yes", probabilities: { yes: 0.7, partly: Number.NaN, no: 0.3 } },
    ],
    ["unknown choice key", { choice: "maybe", probabilities: { yes: 0.7, partly: 0.2, no: 0.1 } }],
  ])("rejects %s without caching any fresh condition", async (_case, invalidCell) => {
    const cache = memoryCache();
    const validCell = {
      choice: "yes",
      confidence: 0.9,
      probabilities: { yes: 0.9, partly: 0.1, no: 0 },
    };
    const fetchImpl = vi.fn(async () =>
      okResponse({ c1: validCell, c2: invalidCell, c3: validCell }),
    ) as unknown as typeof fetch;
    const result = await judgeAnswer({ puzzle: vessel, answer: "urinal", env, cache, fetchImpl });
    expect(result).toEqual({ status: "unavailable", reason: "invalid-response" });
    for (const conditionId of ["c1", "c2", "c3"]) {
      expect(
        cache.get(`bath-vessel|${conditionId}|urinal|typesafe/jev-1.13|${JUDGE_PROMPT_VERSION}`),
      ).toBeUndefined();
    }
  });
});

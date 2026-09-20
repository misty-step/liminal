import { describe, expect, it, vi } from "vitest";
import { getPuzzle } from "../deck";
import { judgeAnswer, judgeEnvFrom, memoryCache } from "../typeSafe";

const relic = getPuzzle("pocket-relic")!;

function okResponse(nouls: Record<string, number>) {
  return {
    ok: true,
    json: async () => ({
      answers: Object.fromEntries(
        Object.entries(nouls).map(([id, noul]) => [id, { type: "noul", noul }]),
      ),
    }),
  } as unknown as Response;
}

const env = { url: "https://example.test/decisions", apiKey: "test-key", model: "typesafe/jev-1.13" };

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
    const result = await judgeAnswer({ puzzle: relic, answer: "sundial", env: null, cache: memoryCache() });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toBe("not-configured");
  });

  it("judges one Noul per condition with the answer as state data", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("typesafe/jev-1.13");
      expect(body.state.answer).toBe("sundial");
      expect(Object.keys(body.questions)).toEqual(["c1", "c2", "c3"]);
      for (const question of Object.values(body.questions) as { type: string }[]) {
        expect(question.type).toBe("noul");
      }
      return okResponse({ c1: 0.9, c2: 0.5, c3: 0.1 });
    }) as unknown as typeof fetch;

    const result = await judgeAnswer({
      puzzle: relic,
      answer: "Sundial",
      env,
      cache: memoryCache(),
      fetchImpl,
    });
    expect(result.status).toBe("judged");
    if (result.status === "judged") {
      expect(result.states).toEqual({ c1: "inside", c2: "close", c3: "outside" });
      expect(result.judgmentVersion).toContain("typesafe/jev-1.13");
    }
  });

  it("serves repeats from cache instead of rerolling", async () => {
    const cache = memoryCache();
    const fetchImpl = vi.fn(async () => okResponse({ c1: 0.9, c2: 0.9, c3: 0.9 })) as unknown as typeof fetch;
    const first = await judgeAnswer({ puzzle: relic, answer: "sundial", env, cache, fetchImpl });
    const second = await judgeAnswer({ puzzle: relic, answer: "sundial", env, cache, fetchImpl });
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
      puzzle: relic,
      answer: "sundial",
      env,
      cache: memoryCache(),
      fetchImpl: aborting,
    });
    expect(timedOut).toEqual({ status: "unavailable", reason: "timeout" });

    const failing = vi.fn(async () => ({ ok: false, status: 429 }) as unknown as Response) as unknown as typeof fetch;
    const errored = await judgeAnswer({
      puzzle: relic,
      answer: "sundial",
      env,
      cache: memoryCache(),
      fetchImpl: failing,
    });
    expect(errored).toEqual({ status: "unavailable", reason: "upstream-error" });

    const malformed = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    const invalid = await judgeAnswer({
      puzzle: relic,
      answer: "sundial",
      env,
      cache: memoryCache(),
      fetchImpl: malformed,
    });
    expect(invalid).toEqual({ status: "unavailable", reason: "invalid-response" });
  });

  it("never writes partial judgments to cache on failure", async () => {
    const cache = memoryCache();
    const fetchImpl = vi.fn(async () =>
      okResponse({ c1: 0.9, c2: 0.9 }) as unknown as Response,
    ) as unknown as typeof fetch;
    const result = await judgeAnswer({ puzzle: relic, answer: "sundial", env, cache, fetchImpl });
    expect(result.status).toBe("unavailable");
    expect(cache.get(`pocket-relic|c1|sundial|typesafe/jev-1.13|liminal-judge-2026-09-20.1`)).toBeUndefined();
  });
});

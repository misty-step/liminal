import * as Sentry from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/judge/route";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

const canary = "private-player-otter";

function request(answer: string) {
  return new Request("https://liminal.test/api/judge", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.71" },
    body: JSON.stringify({ puzzleId: "bath-vessel", answer }),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("handled semantic failures (US-002)", () => {
  it.each([
    ["http", "upstream-error", () => new Response(canary, { status: 429 })],
    [
      "network",
      "upstream-error",
      () => {
        throw new TypeError(canary);
      },
    ],
    [
      "timeout",
      "timeout",
      () => {
        throw new DOMException(canary, "AbortError");
      },
    ],
    ["syntax", "invalid-response", () => new Response(canary)],
    ["null", "invalid-response", () => Response.json(null)],
    ["shape", "invalid-response", () => Response.json({ answers: {} })],
  ])(
    "reports only the bounded %s failure, never its private details",
    async (name, reason, reply) => {
      vi.stubEnv("LIMINAL_ENVIRONMENT", "test");
      vi.stubEnv("TYPESAFE_API_KEY", "private-credential-canary");
      vi.stubGlobal("fetch", vi.fn(reply));
      const capture = vi.mocked(Sentry.captureMessage).mockReturnValue("test-event");

      const response = await POST(request(`${canary}-${name}`));
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        status: "unavailable",
        reason,
        normalized: `${canary}-${name}`,
      });
      expect(capture).toHaveBeenCalledExactlyOnceWith("Semantic judge unavailable", {
        level: "error",
        tags: { route: "judge", operation: "provider", reason },
        fingerprint: ["semantic-judge", reason],
      });
      expect(JSON.stringify(capture.mock.calls)).not.toContain(canary);
      expect(JSON.stringify(capture.mock.calls)).not.toContain("private-credential-canary");
    },
  );

  it("does not report successful judgments or rejected requests as provider faults", async () => {
    vi.stubEnv("LIMINAL_ENVIRONMENT", "test");
    vi.stubEnv("TYPESAFE_API_KEY", "private-credential-canary");
    const cell = { choice: "yes", probabilities: { yes: 1, partly: 0, no: 0 } };
    const transport = vi.fn(() => Response.json({ answers: { c1: cell, c2: cell, c3: cell } }));
    vi.stubGlobal("fetch", transport);
    const capture = vi.mocked(Sentry.captureMessage).mockReturnValue("test-event");
    const response = await POST(request("recovered-otter"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "judged",
      states: { c1: "inside", c2: "inside", c3: "inside" },
    });
    const rejected = await POST(request(""));
    expect(rejected.status).toBe(400);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { POST as postEvent } from "@/app/api/events/route";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as postJudge } from "@/app/api/judge/route";
import { POST as postReport } from "@/app/api/report/route";

const previousEnvironment = process.env.LIMINAL_ENVIRONMENT;

afterEach(() => {
  if (previousEnvironment === undefined) delete process.env.LIMINAL_ENVIRONMENT;
  else process.env.LIMINAL_ENVIRONMENT = previousEnvironment;
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://liminal.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

describe("production route boundaries", () => {
  it("keeps local health meaningful without claiming a bound store", async () => {
    delete process.env.LIMINAL_ENVIRONMENT;
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "liminal",
      environment: "development",
      checks: { deck: "ok", storage: "not-configured" },
    });
  });

  it("fails judging closed when production storage is not bound", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    const response = await postJudge(
      jsonRequest("/api/judge", { puzzleId: "bath-vessel", answer: "sundial" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      reason: "store-not-configured",
    });
  });

  it("does not replace a production report store with a local file", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    const response = await postReport(
      jsonRequest("/api/report", { puzzleId: "bath-vessel", answer: "sink", note: "test" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "store-not-configured" });
  });

  it("requires explicit environment and durable storage for product events", async () => {
    delete process.env.LIMINAL_ENVIRONMENT;
    const response = await postEvent(
      jsonRequest("/api/events", {
        eventId: "00000000-0000-4000-8000-000000000001",
        eventName: "puzzle_open",
        sessionId: "session_0123456789abcdef",
        props: { puzzle_id: "bath-vessel", mode: "today" },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "environment-not-configured" });
  });
});

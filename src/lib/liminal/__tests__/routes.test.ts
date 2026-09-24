import { afterEach, describe, expect, it } from "vitest";
import { POST as postEvent } from "@/app/api/events/route";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as postJudge } from "@/app/api/judge/route";
import { GET as getPuzzleByNumber } from "@/app/api/puzzle/[number]/route";
import { POST as postReport } from "@/app/api/report/route";
import { GET as getToday } from "@/app/api/today/route";
import { dateKeyUTC, puzzleNumber } from "@/lib/liminal/daily";

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

  it("serves today's puzzle with its number and never a future one", async () => {
    process.env.LIMINAL_ENVIRONMENT = "test";
    const today = await getToday();
    expect(today.status).toBe(200);
    const payload = await today.json();
    expect(payload.date).toBe(dateKeyUTC());
    expect(payload.number).toBe(puzzleNumber(dateKeyUTC()));
    expect(payload.puzzle.conditions).toHaveLength(3);

    const params = (value: string) => ({ params: Promise.resolve({ number: value }) });
    const past = await getPuzzleByNumber(new Request("https://liminal.test/"), params("1"));
    expect(past.status).toBe(200);
    const future = String(payload.number + 1);
    expect(
      (await getPuzzleByNumber(new Request("https://liminal.test/"), params(future))).status,
    ).toBe(404);
    expect(
      (await getPuzzleByNumber(new Request("https://liminal.test/"), params("0"))).status,
    ).toBe(404);
    expect(
      (await getPuzzleByNumber(new Request("https://liminal.test/"), params("abc"))).status,
    ).toBe(404);
  });

  // Only a successful schedule lookup may choose the deck. Without the D1
  // binding, serving the deck could hand some players a different puzzle #N.
  it("fails closed without the production schedule instead of serving the deck", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    const today = await getToday();
    expect(today.status).toBe(503);
    expect(await today.json()).toEqual({ status: "unavailable" });
    const past = await getPuzzleByNumber(new Request("https://liminal.test/"), {
      params: Promise.resolve({ number: "1" }),
    });
    expect(past.status).toBe(503);

    // A scheduled (non-bundled) id is an outage, not an unknown puzzle: no guess spent.
    const judged = await postJudge(
      jsonRequest("/api/judge", { puzzleId: "floats-motor-passengers", answer: "ferry" }),
    );
    expect(judged.status).toBe(503);
    expect(await judged.json()).toEqual({ status: "unavailable", reason: "schedule-unavailable" });
    const reported = await postReport(
      jsonRequest("/api/report", {
        puzzleId: "floats-motor-passengers",
        answer: "ferry",
        note: "test",
      }),
    );
    expect(reported.status).toBe(503);
  });

  it("refuses to judge a puzzle id that is neither bundled nor scheduled", async () => {
    process.env.LIMINAL_ENVIRONMENT = "test";
    const response = await postJudge(
      jsonRequest("/api/judge", { puzzleId: "no-such-puzzle", answer: "sundial" }),
    );
    expect(response.status).toBe(400);
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

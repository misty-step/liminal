import { describe, expect, it } from "vitest";
import {
  clientKey,
  createProductEvent,
  createRateLimiter,
  parseJudgePayload,
  parseProductEventPayload,
  parseReportPayload,
  readJsonPayload,
} from "../runtime";

describe("request boundaries", () => {
  it("accepts one known puzzle and a bounded answer", () => {
    expect(parseJudgePayload({ puzzleId: "bath-vessel", answer: "  sundial  " })).toEqual({
      ok: true,
      value: { puzzleId: "bath-vessel", answer: "sundial" },
    });
  });

  it("rejects malformed and oversized judge input", () => {
    expect(parseJudgePayload([]).ok).toBe(false);
    expect(parseJudgePayload({ puzzleId: "Not A Slug!", answer: "mug" }).ok).toBe(false);
    expect(parseJudgePayload({ puzzleId: "x".repeat(65), answer: "mug" }).ok).toBe(false);
    expect(parseJudgePayload({ puzzleId: "bath-vessel", answer: "x".repeat(121) }).ok).toBe(false);
  });

  it("rejects oversized reports instead of silently truncating them", () => {
    expect(
      parseReportPayload({ puzzleId: "bath-vessel", answer: "sink", note: "x".repeat(501) }),
    ).toEqual({ ok: false, reason: "bad-request" });
    expect(
      parseReportPayload({ puzzleId: "bath-vessel", answer: " sink ", note: " fair call " }),
    ).toEqual({
      ok: true,
      value: { puzzleId: "bath-vessel", answer: "sink", note: "fair call" },
    });
  });

  it("reads only JSON bodies within the UTF-8 byte budget", async () => {
    const accepted = await readJsonPayload(
      new Request("https://liminal.test/api/judge", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ answer: "mug" }),
      }),
      128,
    );
    expect(accepted).toEqual({ ok: true, value: { answer: "mug" } });

    const multibyte = await readJsonPayload(
      new Request("https://liminal.test/api/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: "éééé" }),
      }),
      16,
    );
    expect(multibyte).toEqual({ ok: false, reason: "payload-too-large" });

    expect(
      await readJsonPayload(
        new Request("https://liminal.test/api/judge", { method: "POST", body: "{}" }),
        128,
      ),
    ).toEqual({ ok: false, reason: "bad-request" });
  });

  it("bounds rate-limit memory and resets windows", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, maxKeys: 2 });
    expect(limiter.isLimited("a", 0)).toBe(false);
    expect(limiter.isLimited("a", 1)).toBe(false);
    expect(limiter.isLimited("a", 2)).toBe(true);
    expect(limiter.isLimited("b", 2)).toBe(false);
    expect(limiter.isLimited("c", 2)).toBe(true);
    expect(limiter.isLimited("c", 1_001)).toBe(false);
  });

  it("uses Cloudflare's client address and rejects spoof-shaped fallbacks", () => {
    expect(
      clientKey(
        new Request("https://liminal.test", {
          headers: { "cf-connecting-ip": "2001:db8::1", "x-forwarded-for": "203.0.113.8" },
        }),
      ),
    ).toBe("2001:db8::1");
    expect(
      clientKey(
        new Request("https://liminal.test", {
          headers: { "x-forwarded-for": "attacker-controlled-value" },
        }),
      ),
    ).toBe("unknown");
  });
});

describe("privacy-safe product event boundary", () => {
  it("accepts the canonical Liminal event shape without player text", () => {
    expect(
      parseProductEventPayload({
        eventId: "00000000-0000-4000-8000-000000000001",
        eventName: "guess_judged",
        sessionId: "session_0123456789abcdef",
        props: { puzzle_id: "bath-vessel", result: "close", source: "authored" },
      }),
    ).toEqual({
      ok: true,
      value: {
        eventId: "00000000-0000-4000-8000-000000000001",
        eventName: "guess_judged",
        sessionId: "session_0123456789abcdef",
        props: { puzzle_id: "bath-vessel", result: "close", source: "authored" },
      },
    });
  });

  it("rejects free-text and unknown properties", () => {
    expect(
      parseProductEventPayload({
        eventId: "00000000-0000-4000-8000-000000000002",
        eventName: "guess_judged",
        sessionId: "session_0123456789abcdef",
        props: {
          puzzle_id: "bath-vessel",
          result: "inside",
          source: "live",
          answer: "private player text",
        },
      }).ok,
    ).toBe(false);
  });

  it("builds an explicit environment envelope with anonymous identity", () => {
    const parsed = parseProductEventPayload({
      eventId: "00000000-0000-4000-8000-000000000001",
      eventName: "puzzle_open",
      sessionId: "session_0123456789abcdef",
      props: { puzzle_id: "bath-vessel", mode: "today" },
    });
    if (!parsed.ok) throw new Error("fixture must parse");
    expect(
      createProductEvent(parsed.value, {
        environment: "test",
        occurredAt: "2026-09-21T12:00:00.000Z",
      }),
    ).toEqual({
      event_id: "00000000-0000-4000-8000-000000000001",
      event_name: "puzzle_open",
      game: "liminal",
      environment: "test",
      occurred_at: "2026-09-21T12:00:00.000Z",
      session_id: "session_0123456789abcdef",
      actor_id: null,
      schema_version: 1,
      props: { puzzle_id: "bath-vessel", mode: "today" },
    });
  });
});

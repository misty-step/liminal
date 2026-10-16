import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "../monitoring";
import { encodeReveal } from "../share";

describe("Sentry privacy boundary", () => {
  it("removes identity, request payloads, headers, query strings, and breadcrumb data", () => {
    const event = scrubSentryEvent({
      event_id: "00000000000000000000000000000001",
      user: { id: "player", email: "player@example.test" },
      request: {
        url: "https://liminal.test/api/judge?answer=private",
        query_string: "answer=private",
        data: { answer: "private" },
        cookies: { session: "private" },
        headers: { authorization: "private" },
      },
      breadcrumbs: [
        {
          timestamp: 1,
          category: "fetch",
          message: "POST /api/judge",
          data: { body: "private" },
        },
      ],
    });

    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://liminal.test/api/judge" });
    expect(event.breadcrumbs).toEqual([{ timestamp: 1, category: "fetch" }]);
    expect(JSON.stringify(event)).not.toContain("private");
  });

  const answer = "privacy-canary-otter";
  const code = encodeReveal({
    number: 1,
    elapsedMs: 1000,
    words: [{ word: answer, landing: { kind: "target", key: "center" } }],
  });

  it.each([answer, code, code.replace(/^./, (letter) => `%${letter.charCodeAt(0).toString(16)}`)])(
    "removes share payload %s from every URL-bearing event field",
    (payload) => {
      const path = `/s/${payload}`;
      const url = `https://liminal.test${path}?answer=${answer}#${answer}`;
      const event = scrubSentryEvent({
        request: { url, headers: { Referer: url } },
        transaction: `GET ${path}`,
        message: `Failed to fetch ${url}`,
        exception: { values: [{ type: "Error", value: `Navigation failed: ${url}` }] },
        spans: [
          {
            trace_id: "a".repeat(32),
            span_id: "b".repeat(16),
            start_timestamp: 1,
            timestamp: 2,
            op: "http.client",
            description: `GET ${url}`,
            data: {
              url,
              "http.url": url,
              "http.target": path,
              "http.request.header.referer": url,
            },
          },
        ],
        contexts: {
          trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16), data: { url } },
          page: { url, headers: { referer: url }, history: [url, path] },
        },
        breadcrumbs: [{ category: "navigation", message: url, data: { from: url, to: url } }],
        tags: { url, referrer: url, transaction: path, "http.status_code": 200 },
        extra: { url },
      });

      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain(payload);
      expect(serialized).not.toContain(answer);
      expect(event.request).toEqual({ url: "https://liminal.test/s/[redacted]" });
      expect(event.transaction).toBe("GET /s/[redacted]");
      expect(event.spans?.[0].description).toBe("GET https://liminal.test/s/[redacted]");
      expect(event.spans?.[0].data?.["http.target"]).toBe("/s/[redacted]");
      expect(event.spans?.[0].op).toBe("http.client");
      expect(event.tags?.["http.status_code"]).toBe(200);
      expect(event.breadcrumbs).toEqual([{ category: "navigation" }]);
    },
  );

  it("scrubs multiple absolute and relative share URLs without mutating the input", () => {
    const input = {
      transaction: "/s/[code]",
      tags: { routes: `from /s/${code} to https://liminal.test/s/${code}/` },
      release: "release-id",
      environment: "test",
    };
    const event = scrubSentryEvent(input);
    expect(event.tags?.routes).toBe("from /s/[redacted] to https://liminal.test/s/[redacted]");
    expect(input.tags.routes).toContain(code);
    expect(event.release).toBe(input.release);
    expect(event.environment).toBe(input.environment);
    expect(scrubSentryEvent({})).toEqual({});
  });
});

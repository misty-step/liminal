import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "../monitoring";

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
});

import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "../id";
import { emitProductEvent } from "../productEvents";
import { parseProductEventPayload } from "../runtime";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION_KEY = "liminal.event-session.v1";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function browser() {
  const storage = new Map<string, string>();
  const sessionStorage = {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  };
  vi.stubGlobal("window", { sessionStorage });
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null));
  vi.stubGlobal("fetch", fetch);
  return { sessionStorage, fetch };
}

function withoutRandomUUID() {
  vi.stubGlobal("crypto", {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  });
}

describe("compatible anonymous IDs", () => {
  it("uses the native API with its crypto receiver when available", () => {
    const getRandomValues = vi.fn();
    const provider = {
      randomUUID() {
        expect(this).toBe(provider);
        return "12345678-1234-4234-8234-123456789abc";
      },
      getRandomValues,
    };
    vi.stubGlobal("crypto", provider);
    expect(randomId()).toBe("12345678-1234-4234-8234-123456789abc");
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it.each([
    [0, "00000000-0000-4000-8000-000000000000"],
    [255, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
  ])("sets version and variant bits for entropy byte %i", (byte, expected) => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(Number(byte)));
    vi.stubGlobal("crypto", { getRandomValues });
    expect(randomId()).toBe(expected);
    expect(getRandomValues.mock.calls[0][0]).toHaveLength(16);
  });

  it("generates distinct v4 IDs with real fallback entropy", () => {
    withoutRandomUUID();
    const ids = Array.from({ length: 100 }, () => randomId());
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("best-effort product events", () => {
  it("creates valid event and session IDs without randomUUID, retaining the session", () => {
    const { fetch, sessionStorage } = browser();
    withoutRandomUUID();
    expect(() =>
      emitProductEvent("session_start", { mode: "today", new_visitor: true }),
    ).not.toThrow();
    expect(() =>
      emitProductEvent("puzzle_open", { puzzle_id: "bath-vessel", mode: "today" }),
    ).not.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    const ids = new Set<string>();
    for (const [path, init] of fetch.mock.calls) {
      expect(path).toBe("/api/events");
      expect(init).toMatchObject({ method: "POST", keepalive: true });
      const parsed = parseProductEventPayload(JSON.parse(String(init?.body)));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error("Invalid event envelope");
      expect(parsed.value.eventId).toMatch(UUID_V4);
      expect(parsed.value.sessionId).toBe(sessionStorage.getItem(SESSION_KEY));
      expect(parsed.value.sessionId).toMatch(/^session_[0-9a-f]{32}$/);
      ids.add(parsed.value.eventId);
    }
    expect(ids.size).toBe(2);
    expect(sessionStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it("preserves an existing anonymous session", () => {
    const { sessionStorage, fetch } = browser();
    sessionStorage.setItem(SESSION_KEY, "session_0123456789abcdef");
    emitProductEvent("session_start", { mode: "today", new_visitor: false });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).sessionId).toBe(
      "session_0123456789abcdef",
    );
    expect(sessionStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it.each(["getItem", "setItem"] as const)("contains session storage %s failures", (method) => {
    const { sessionStorage, fetch } = browser();
    sessionStorage[method].mockImplementation(() => {
      throw new Error("Storage denied");
    });
    expect(() => emitProductEvent("session_start", {})).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("contains denied sessionStorage access", () => {
    const { fetch } = browser();
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("Access denied");
      },
    });
    expect(() => emitProductEvent("session_start", {})).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["randomUUID", "getRandomValues"])("contains %s failures", (method) => {
    const { fetch } = browser();
    vi.stubGlobal("crypto", {
      [method]() {
        throw new Error("Entropy denied");
      },
    });
    expect(() => emitProductEvent("session_start", {})).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("contains serialization failures", () => {
    const { fetch } = browser();
    const props = {
      get mode(): string {
        throw new Error("Invalid property");
      },
    };
    expect(() => emitProductEvent("session_start", props)).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("contains a synchronous fetch failure", () => {
    const { fetch } = browser();
    fetch.mockImplementation(() => {
      throw new Error("Fetch denied");
    });
    expect(() => emitProductEvent("session_start", {})).not.toThrow();
  });

  it("handles network rejections without an unhandled rejection", async () => {
    const { fetch } = browser();
    fetch.mockRejectedValue(new Error("Offline"));
    emitProductEvent("session_start", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does nothing during server rendering", () => {
    const { fetch } = browser();
    vi.stubGlobal("window", undefined);
    expect(() => emitProductEvent("session_start", {})).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

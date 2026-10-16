import { webcrypto } from "node:crypto";
import type { CaptureResult } from "posthog-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomId } from "../id";
import { analyticsRoute, liminalPostHogConfig, sanitizeAnalyticsEvent } from "../productEvents";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));
const id = "12345678-1234-4234-8234-123456789abc";

beforeEach(() => {
  vi.stubGlobal("window", { location: { pathname: "/s/PRIVATE-share-code" } });
  vi.stubGlobal("navigator", { webdriver: true });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-public-ingestion-key");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENVIRONMENT", "production");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sdk.init.mockReset();
  sdk.capture.mockReset();
  vi.resetModules();
});

function event(name = "$pageview", properties: Record<string, unknown> = {}): CaptureResult {
  return {
    uuid: id,
    event: name,
    timestamp: new Date(),
    properties: {
      distinct_id: id,
      $session_id: id,
      $set_once: { $initial_referrer: "PRIVATE-referrer" },
      $current_url: "https://liminal.mistystep.io/s/PRIVATE-code?token=PRIVATE-query",
      $ip: "192.0.2.10",
      answer: "PRIVATE-answer",
      note: "PRIVATE-note",
      ...properties,
    },
  };
}

describe("privacy boundary", () => {
  it.each(["/", "/changelog", "/s/PRIVATE", "/unknown/PRIVATE"])("templates %s", (path) => {
    expect(analyticsRoute(path)).toBe(
      path === "/" || path === "/changelog" ? path : path.startsWith("/s/") ? "/s/:code" : "/other",
    );
  });
  it.each([
    "$pageview",
    "puzzle_open",
    "guess_judged",
    "guess_refused",
    "puzzle_complete",
    "report_submitted",
  ])("rebuilds %s without private defaults or envelope fields", (name) => {
    const safe = sanitizeAnalyticsEvent({ ...event(name), $set: { email: "PRIVATE-email" } });
    expect(safe).not.toBeNull();
    expect(JSON.stringify(safe)).not.toContain("PRIVATE");
    expect(safe?.properties).toMatchObject({
      app: "liminal",
      environment: "production",
      is_synthetic: true,
      $ip: "0.0.0.0",
      $geoip_disable: true,
      $process_person_profile: false,
      $session_id: id,
      route: "/s/:code",
    });
    expect(Object.keys(safe ?? {}).sort()).toEqual(["event", "properties", "timestamp", "uuid"]);
  });
  it.each(["$identify", "$snapshot", "$autocapture", "$exception", "session_start"])(
    "drops %s",
    (name) => {
      expect(sanitizeAnalyticsEvent(event(name))).toBeNull();
    },
  );
  it("refuses account-like distinct IDs and unsafe session IDs", () => {
    expect(
      sanitizeAnalyticsEvent(event("puzzle_open", { distinct_id: "PRIVATE-account" })),
    ).toBeNull();
    expect(
      sanitizeAnalyticsEvent(event("puzzle_open", { $session_id: "PRIVATE-session" }))?.properties,
    ).not.toHaveProperty("$session_id");
  });
  it("admits only event-specific enum/count values", () => {
    expect(
      sanitizeAnalyticsEvent(event("puzzle_open", { mode: "practice", guesses_used: 4 }))
        ?.properties,
    ).toMatchObject({ mode: "practice" });
    expect(
      sanitizeAnalyticsEvent(event("puzzle_open", { guesses_used: 4 }))?.properties,
    ).not.toHaveProperty("guesses_used");
    expect(
      sanitizeAnalyticsEvent(event("guess_judged", { source: "authored", result: "inside" }))
        ?.properties,
    ).toMatchObject({ source: "authored", result: "inside" });
    for (const value of [-1, 0, 0.5, 1001, Infinity, "4"]) {
      expect(
        sanitizeAnalyticsEvent(event("puzzle_complete", { guesses_used: value }))?.properties,
      ).not.toHaveProperty("guesses_used");
    }
    expect(
      sanitizeAnalyticsEvent(event("puzzle_complete", { guesses_used: 4 }))?.properties
        .guesses_used,
    ).toBe(4);
    expect(
      JSON.stringify(sanitizeAnalyticsEvent(event("guess_refused", { reason: "PRIVATE-error" }))),
    ).not.toContain("PRIVATE");
  });
  it("marks non-production traffic synthetic even with a normal browser", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_ENVIRONMENT", "development");
    vi.stubGlobal("navigator", { webdriver: false });
    expect(sanitizeAnalyticsEvent(event())?.properties.is_synthetic).toBe(true);
  });
  it("disables all automatic content capture and cross-product identity", () => {
    expect(liminalPostHogConfig).toMatchObject({
      person_profiles: "never",
      persistence_name: "liminal-anonymous-v1",
      cross_subdomain_cookie: false,
      cookie_expiration: 30,
      capture_pageview: false,
      autocapture: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      save_referrer: false,
      store_google: false,
      ip: false,
      respect_dnt: true,
    });
  });
});

describe("one optional SDK transport", () => {
  it("initializes once before concurrent captures without posting to the legacy collector", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { emitProductEvent } = await import("../productEvents");
    emitProductEvent("puzzle_open", { mode: "today" });
    emitProductEvent("guess_judged", { result: "inside" });
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledTimes(2));
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["init", "capture"] as const)(
    "contains %s failure and recovers on later events",
    async (method) => {
      const { emitProductEvent } = await import("../productEvents");
      sdk[method].mockImplementationOnce(() => {
        throw new Error("Sink unavailable");
      });
      expect(() => emitProductEvent("puzzle_open")).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 20));
      emitProductEvent("puzzle_complete");
      await vi.waitFor(() =>
        expect(sdk.capture).toHaveBeenCalledWith("puzzle_complete", undefined),
      );
    },
  );
  it("skips SSR, unknown events and missing config", async () => {
    const { emitProductEvent } = await import("../productEvents");
    emitProductEvent("session_start");
    vi.stubGlobal("window", undefined);
    emitProductEvent("puzzle_open");
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    emitProductEvent("puzzle_open");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sdk.init).not.toHaveBeenCalled();
  });
});

describe("compatible application IDs (not analytics identity)", () => {
  it("uses the native API with its crypto receiver", () => {
    const provider = {
      randomUUID() {
        expect(this).toBe(provider);
        return id;
      },
    };
    vi.stubGlobal("crypto", provider);
    expect(randomId()).toBe(id);
  });
  it.each([
    [0, "00000000-0000-4000-8000-000000000000"],
    [255, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
  ])("sets version and variant bits for entropy byte %i", (byte, expected) => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(Number(byte)) });
    expect(randomId()).toBe(expected);
  });
  it("generates distinct IDs using real fallback entropy", () => {
    vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const ids = Array.from({ length: 100 }, () => randomId());
    for (const value of ids)
      expect(value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const release = "0123456789abcdef0123456789abcdef01234567";
const productionError =
  "Production builds require NEXT_PUBLIC_SENTRY_DSN and matching NEXT_PUBLIC_SENTRY_RELEASE and SENTRY_RELEASE values set to the same 40-hex commit SHA.";

beforeEach(() => {
  vi.resetModules();
  for (const name of [
    "NEXT_PUBLIC_SENTRY_DSN",
    "NEXT_PUBLIC_SENTRY_RELEASE",
    "SENTRY_RELEASE",
    "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
    "SENTRY_ENVIRONMENT",
    "SENTRY_AUTH_TOKEN",
  ]) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  ["production", "test"],
  ["test", "production"],
  ["production", "production"],
])("Sentry build identity (browser=%s, server=%s)", (browser, server) => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", browser);
    vi.stubEnv("SENTRY_ENVIRONMENT", server);
    // A synthetic, non-routable fixture; no real DSN or Sentry writes.
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_RELEASE", release);
    vi.stubEnv("SENTRY_RELEASE", release);
  });

  it.each([
    ["NEXT_PUBLIC_SENTRY_DSN", undefined],
    ["NEXT_PUBLIC_SENTRY_DSN", ""],
    ["NEXT_PUBLIC_SENTRY_DSN", "   "],
    ["NEXT_PUBLIC_SENTRY_RELEASE", undefined],
    ["NEXT_PUBLIC_SENTRY_RELEASE", ""],
    ["SENTRY_RELEASE", undefined],
    ["SENTRY_RELEASE", "fedcba9876543210fedcba9876543210fedcba98"],
  ])("rejects %s=%s", async (name, value) => {
    vi.stubEnv(name, value);
    await expect(import("./next.config")).rejects.toThrow(productionError);
  });

  it.each([
    "0123456",
    release.slice(1),
    `${release}0`,
    "g".repeat(40),
    `${release}\n`,
    ` ${release}`,
  ])("rejects matching non-SHA releases: %j", async (invalidRelease) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_RELEASE", invalidRelease);
    vi.stubEnv("SENTRY_RELEASE", invalidRelease);
    await expect(import("./next.config")).rejects.toThrow(productionError);
  });

  it.each([release, release.toUpperCase()])("accepts complete identity: %s", async (sha) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_RELEASE", sha);
    vi.stubEnv("SENTRY_RELEASE", sha);
    await expect(import("./next.config")).resolves.toHaveProperty("default");
  });
});

it.each([undefined, "development", "test", "staging"])(
  "allows %s builds without a DSN or release",
  async (environment) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", environment);
    vi.stubEnv("SENTRY_ENVIRONMENT", environment);
    await expect(import("./next.config")).resolves.toHaveProperty("default");
  },
);

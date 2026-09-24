import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getHealth } from "@/app/api/health/route";
import { POST as postJudge } from "@/app/api/judge/route";
import { POST as postReport } from "@/app/api/report/route";
import type { D1Like } from "../store";
import { judgeCache } from "../store";

const harness = vi.hoisted(() => ({
  bindings: null as Record<string, unknown> | null,
  captureException: vi.fn(),
  mkdir: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => (harness.bindings ? { env: harness.bindings } : undefined),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: harness.captureException,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: harness.mkdir,
  appendFile: harness.appendFile,
}));

const originalEnvironment = process.env.LIMINAL_ENVIRONMENT;
const originalTypeSafeKey = process.env.TYPESAFE_API_KEY;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
let requestSequence = 0;

beforeEach(() => {
  harness.bindings = null;
  vi.clearAllMocks();
  delete process.env.LIMINAL_ENVIRONMENT;
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  harness.bindings = null;
  vi.unstubAllGlobals();
  if (originalEnvironment === undefined) delete process.env.LIMINAL_ENVIRONMENT;
  else process.env.LIMINAL_ENVIRONMENT = originalEnvironment;
  if (originalTypeSafeKey === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = originalTypeSafeKey;
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
});

function jsonRequest(path: string, body: unknown): Request {
  requestSequence += 1;
  return new Request(`https://liminal.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": `203.0.113.${requestSequence}`,
    },
    body: JSON.stringify(body),
  });
}

const requiredSchemaObjects = [
  "judgments",
  "reports",
  "product_events",
  "schedule",
  "judgments_state_insert_guard",
  "judgments_state_update_guard",
  "schedule_no_update",
  "schedule_future_only",
  "schedule_no_started_delete",
  "product_events_funnel",
  "product_events_session",
] as const;

const ALL_MIGRATIONS = [
  "0001_judgments_and_reports.sql",
  "0002_foundations.sql",
  "0003_schedule.sql",
  "0004_schedule_started_immutable.sql",
] as const;

const requiredSchemaColumns = {
  judgments: ["key", "state"],
  reports: ["at", "puzzle_id", "answer", "note"],
  product_events: [
    "event_id",
    "event_name",
    "game",
    "environment",
    "occurred_at",
    "session_id",
    "actor_id",
    "schema_version",
    "props_json",
  ],
  schedule: ["date", "number", "puzzle_id", "puzzle_json", "source"],
} as const;

function schemaD1(options: {
  migrationTable: boolean;
  migrations?: readonly string[];
  objects?: readonly string[];
  columns?: Partial<Record<keyof typeof requiredSchemaColumns, readonly string[]>>;
}): D1Like {
  const migrations = new Set(options.migrations ?? []);
  const objects = new Set(options.objects ?? []);
  const columnsFor = (table: keyof typeof requiredSchemaColumns): readonly string[] =>
    options.columns?.[table] ?? requiredSchemaColumns[table];
  return {
    prepare(query) {
      return {
        bind() {
          return this;
        },
        async first<T>() {
          // The reviewed implementation's generic probe succeeds even when the
          // database is otherwise completely empty.
          if (query.includes("SELECT 1 AS ok")) return { ok: 1 } as T;
          for (const [table, required] of Object.entries(requiredSchemaColumns)) {
            if (!query.includes(`FROM ${table} LIMIT 0`)) continue;
            if (
              required.some(
                (name) => !columnsFor(table as keyof typeof requiredSchemaColumns).includes(name),
              )
            ) {
              throw new Error(`no such column in ${table}`);
            }
            return null as T;
          }
          if (!query.includes("d1_migrations")) {
            throw new Error(`unexpected readiness query: ${query}`);
          }
          if (!options.migrationTable) throw new Error("no such table: d1_migrations");
          return {
            coreMigration: Number(migrations.has("0001_judgments_and_reports.sql")),
            foundationMigration: Number(migrations.has("0002_foundations.sql")),
            scheduleMigration: Number(migrations.has("0003_schedule.sql")),
            tableCount: ["judgments", "reports", "product_events", "schedule"].filter((name) =>
              objects.has(name),
            ).length,
            triggerCount: [
              "judgments_state_insert_guard",
              "judgments_state_update_guard",
              "schedule_no_update",
              "schedule_future_only",
              "schedule_no_started_delete",
            ].filter((name) => objects.has(name)).length,
            indexCount: ["product_events_funnel", "product_events_session"].filter((name) =>
              objects.has(name),
            ).length,
          } as T;
        },
        async run() {
          return {};
        },
      };
    },
  };
}

function judgeD1(mode: "read-error" | "corrupt" | "hit" | "write" | "write-error" | "lost-write") {
  const rows = new Map<string, string>();
  const counters = { selects: 0, inserts: 0 };
  const db: D1Like = {
    prepare(query) {
      let values: unknown[] = [];
      return {
        bind(...next) {
          values = next;
          return this;
        },
        async first<T>() {
          if (!query.startsWith("SELECT state FROM judgments")) return null as T | null;
          counters.selects += 1;
          if (mode === "read-error") throw new Error("synthetic D1 read outage");
          if (mode === "corrupt") return { state: "banana" } as T;
          if (mode === "hit") return { state: "inside" } as T;
          if (mode === "lost-write") return null as T | null;
          const key = String(values[0]);
          return rows.has(key) ? ({ state: rows.get(key) } as T) : null;
        },
        async run() {
          if (query.startsWith("INSERT OR IGNORE INTO judgments")) {
            counters.inserts += 1;
            if (mode === "write-error") throw new Error("synthetic D1 write outage");
            const [key, state] = values as [string, string];
            if (!rows.has(key)) rows.set(key, state);
          }
          return {};
        },
      };
    },
  };
  return { db, rows, counters };
}

function providerResponse() {
  return {
    ok: true,
    json: async () => ({
      answers: {
        c1: { choice: "yes", confidence: 0.95, probabilities: { yes: 0.95, partly: 0.05, no: 0 } },
        c2: {
          choice: "partly",
          confidence: 0.85,
          probabilities: { yes: 0.1, partly: 0.8, no: 0.1 },
        },
        c3: { choice: "no", confidence: 0.9, probabilities: { yes: 0, partly: 0.1, no: 0.9 } },
      },
    }),
  } as unknown as Response;
}

async function postLiveJudge(answer: string): Promise<Response> {
  process.env.LIMINAL_ENVIRONMENT = "production";
  process.env.TYPESAFE_API_KEY = "test-only-key";
  return postJudge(jsonRequest("/api/judge", { puzzleId: "bath-vessel", answer }));
}

describe("D1 readiness", () => {
  it("rejects a bound but empty database", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    harness.bindings = { LIMINAL_DB: schemaD1({ migrationTable: false }) };

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.storage).toBe("failed");
  });

  it("rejects a database with only the first migration", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    harness.bindings = {
      LIMINAL_DB: schemaD1({
        migrationTable: true,
        migrations: ["0001_judgments_and_reports.sql"],
        objects: ["judgments", "reports"],
      }),
    };

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.storage).toBe("failed");
  });

  it("rejects a stale schema even when both migration receipts exist", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    harness.bindings = {
      LIMINAL_DB: schemaD1({
        migrationTable: true,
        migrations: ALL_MIGRATIONS,
        objects: requiredSchemaObjects.filter((name) => name !== "product_events_session"),
      }),
    };

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.storage).toBe("failed");
  });

  it("rejects a database that predates the schedule migration", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    harness.bindings = {
      LIMINAL_DB: schemaD1({
        migrationTable: true,
        migrations: ["0001_judgments_and_reports.sql", "0002_foundations.sql"],
        objects: requiredSchemaObjects.filter((name) => !name.startsWith("schedule")),
      }),
    };

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect((await response.json()).checks.storage).toBe("failed");
  });

  it.each([
    ["schedule", "puzzle_json"],
    ["judgments", "state"],
    ["reports", "note"],
    ["product_events", "props_json"],
  ] as const)(
    "rejects a named schema missing route-required %s.%s",
    async (table, missingColumn) => {
      process.env.LIMINAL_ENVIRONMENT = "production";
      harness.bindings = {
        LIMINAL_DB: schemaD1({
          migrationTable: true,
          migrations: ALL_MIGRATIONS,
          objects: requiredSchemaObjects,
          columns: {
            [table]: requiredSchemaColumns[table].filter((name) => name !== missingColumn),
          },
        }),
      };

      const response = await getHealth();

      expect(response.status).toBe(503);
      expect((await response.json()).checks.storage).toBe("failed");
    },
  );

  it("accepts the complete schema with compatible additive columns", async () => {
    process.env.LIMINAL_ENVIRONMENT = "production";
    harness.bindings = {
      LIMINAL_DB: schemaD1({
        migrationTable: true,
        migrations: ALL_MIGRATIONS,
        objects: requiredSchemaObjects,
        columns: {
          judgments: [...requiredSchemaColumns.judgments, "compatible_extra"],
          reports: [...requiredSchemaColumns.reports, "compatible_extra"],
          product_events: [...requiredSchemaColumns.product_events, "compatible_extra"],
          schedule: [...requiredSchemaColumns.schedule, "compatible_extra"],
        },
      }),
    };

    const response = await getHealth();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      environment: "production",
      checks: { deck: "ok", storage: "ok" },
    });
  });
});

describe("runtime environment boundary", () => {
  it("reports a nonempty invalid environment as unhealthy instead of development", async () => {
    process.env.LIMINAL_ENVIRONMENT = "prod";

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "unhealthy",
      environment: "invalid",
      checks: { storage: "configuration-error" },
    });
  });

  it("refuses the memory judge cache for a nonempty invalid environment", async () => {
    process.env.LIMINAL_ENVIRONMENT = "prod";

    await expect(judgeCache()).rejects.toThrow("LIMINAL_ENVIRONMENT");
  });

  it("refuses the filesystem report fallback for a nonempty invalid environment", async () => {
    process.env.LIMINAL_ENVIRONMENT = "prod";

    const response = await postReport(
      jsonRequest("/api/report", { puzzleId: "bath-vessel", answer: "sink", note: "test" }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "environment-not-configured" });
    expect(harness.mkdir).not.toHaveBeenCalled();
    expect(harness.appendFile).not.toHaveBeenCalled();
  });

  it("keeps unset and explicit development local controls usable", async () => {
    for (const environment of [undefined, "development"] as const) {
      if (environment === undefined) delete process.env.LIMINAL_ENVIRONMENT;
      else process.env.LIMINAL_ENVIRONMENT = environment;
      const health = await getHealth();
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ environment: "development" });
      const cache = await judgeCache();
      expect(await cache.set(`local-${environment ?? "unset"}`, "inside")).toBe("inside");
    }
  });

  it("keeps the test environment's local controls usable", async () => {
    process.env.LIMINAL_ENVIRONMENT = "test";

    const health = await getHealth();
    const cache = await judgeCache();
    const report = await postReport(
      jsonRequest("/api/report", { puzzleId: "bath-vessel", answer: "sink", note: "test" }),
    );

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ environment: "test" });
    expect(await cache.set("test-control", "close")).toBe("close");
    expect(report.status).toBe(200);
    expect(await report.json()).toEqual({ ok: true });
    expect(harness.appendFile).toHaveBeenCalledTimes(1);
  });

  it.each(["production", "staging"])("requires D1 in %s", async (environment) => {
    process.env.LIMINAL_ENVIRONMENT = environment;

    const health = await getHealth();

    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({
      status: "unhealthy",
      environment,
      checks: { storage: "not-configured" },
    });
    await expect(judgeCache()).rejects.toThrow("LIMINAL_DB binding is required");
  });
});

describe("judge storage boundary", () => {
  it("turns a D1 read outage into the structured no-store response", async () => {
    const store = judgeD1("read-error");
    harness.bindings = { LIMINAL_DB: store.db };
    const fetchImpl = vi.fn(async () => providerResponse());
    vi.stubGlobal("fetch", fetchImpl);

    const response = await postLiveJudge("read outage fixture");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "unavailable",
      reason: "store-not-configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(harness.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { route: "judge", operation: "storage" },
    });
  });

  it("turns a retained-state invariant failure into the structured no-store response", async () => {
    const store = judgeD1("corrupt");
    harness.bindings = { LIMINAL_DB: store.db };
    const fetchImpl = vi.fn(async () => providerResponse());
    vi.stubGlobal("fetch", fetchImpl);

    const response = await postLiveJudge("corrupt state fixture");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "unavailable",
      reason: "store-not-configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(harness.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { route: "judge", operation: "storage" },
    });
  });

  it.each(["write-error", "lost-write"] as const)(
    "turns a post-evaluation %s into the structured no-store response",
    async (mode) => {
      const store = judgeD1(mode);
      harness.bindings = { LIMINAL_DB: store.db };
      const fetchImpl = vi.fn(async () => providerResponse());
      vi.stubGlobal("fetch", fetchImpl);

      const response = await postLiveJudge(`${mode} fixture`);

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        status: "unavailable",
        reason: "store-not-configured",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(store.counters.inserts).toBe(1);
      expect(harness.captureException).toHaveBeenCalledWith(expect.any(Error), {
        tags: { route: "judge", operation: "storage" },
      });
    },
  );

  it("still serves an ordinary complete D1 cache hit without a provider call", async () => {
    const store = judgeD1("hit");
    harness.bindings = { LIMINAL_DB: store.db };
    const fetchImpl = vi.fn(async () => providerResponse());
    vi.stubGlobal("fetch", fetchImpl);

    const response = await postLiveJudge("cached healthy fixture");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "judged",
      states: { c1: "inside", c2: "inside", c3: "inside" },
    });
    expect(store.counters.selects).toBe(3);
    expect(store.counters.inserts).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("still evaluates, writes, and returns an ordinary uncached judgment", async () => {
    const store = judgeD1("write");
    harness.bindings = { LIMINAL_DB: store.db };
    const fetchImpl = vi.fn(async () => providerResponse());
    vi.stubGlobal("fetch", fetchImpl);

    const response = await postLiveJudge("fresh healthy fixture");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "judged",
      states: { c1: "inside", c2: "close", c3: "outside" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.counters.inserts).toBe(3);
    expect(store.rows.size).toBe(3);
  });
});

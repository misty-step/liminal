import { describe, expect, it } from "vitest";
import { d1JudgeCache, judgeCache, reportStore } from "../store";
import type { D1Like } from "../store";
import { memoryCache } from "../typeSafe";

/** In-memory D1 double with SQLite unique-key semantics for the statements used. */
function fakeD1() {
  const rows = new Map<string, string>();
  const counters = { selects: 0, inserts: 0 };
  const prepare = (query: string) => {
    let params: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) {
        params = values;
        return stmt;
      },
      async first<T = unknown>(): Promise<T | null> {
        if (!query.startsWith("SELECT")) return null;
        counters.selects += 1;
        const key = String(params[0]);
        return rows.has(key) ? ({ state: rows.get(key) } as unknown as T) : null;
      },
      async run(): Promise<unknown> {
        if (query.startsWith("INSERT OR IGNORE")) {
          counters.inserts += 1;
          const [key, state] = params as [string, string];
          if (!rows.has(key)) rows.set(key, state);
        }
        return {};
      },
    };
    return stmt;
  };
  return { rows, counters, prepare };
}

describe("d1JudgeCache — durable first-writer-wins", () => {
  it("returns the retained winner to a second caller with a conflicting verdict", async () => {
    const db = fakeD1();
    const key = "bath-vessel|c2|urinal|typesafe/jev-1.13|liminal-judge-2026-09-20.4";
    const callerA = d1JudgeCache(db as unknown as D1Like, memoryCache());
    const callerB = d1JudgeCache(db as unknown as D1Like, memoryCache());
    expect(await callerA.set(key, "inside")).toBe("inside");
    expect(await callerB.set(key, "outside")).toBe("inside"); // overwrite refused
    expect(db.rows.get(key)).toBe("inside");
    expect(await callerB.get(key)).toBe("inside");
  });

  it("persists across fresh instances (isolate restart readback)", async () => {
    const db = fakeD1();
    await d1JudgeCache(db as unknown as D1Like, memoryCache()).set("k1", "close");
    const fresh = d1JudgeCache(db as unknown as D1Like, memoryCache());
    expect(await fresh.get("k1")).toBe("close");
  });

  it("keeps the hot layer in front of D1 for repeats in one instance", async () => {
    const db = fakeD1();
    const cache = d1JudgeCache(db as unknown as D1Like, memoryCache());
    await cache.set("k2", "inside");
    const selectsAfterSet = db.counters.selects;
    expect(await cache.get("k2")).toBe("inside");
    expect(db.counters.selects).toBe(selectsAfterSet);
  });

  it("ignores corrupt stored values", async () => {
    const db = fakeD1();
    db.rows.set("k3", "banana");
    expect(await d1JudgeCache(db as unknown as D1Like, memoryCache()).get("k3")).toBeUndefined();
  });
});

describe("runtime fallbacks outside Workers", () => {
  it("judgeCache falls back to a usable process-local cache", async () => {
    const cache = await judgeCache();
    expect(await cache.set("kx", "outside")).toBe("outside");
    expect(await cache.get("kx")).toBe("outside");
  });

  it("reportStore is null without bindings (route keeps the local JSONL fallback)", async () => {
    expect(await reportStore()).toBeNull();
  });
});